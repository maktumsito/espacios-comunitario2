export interface DataViewQuery {
  path: string;
  kind: 'document' | 'query';
  constraints?: unknown[];
  version?: string;
}
export interface DataViewMessage {
  version?: string;
  unchanged?: boolean;
  docs?: any[];
  error?: string;
  status?: number;
  code?: string;
  retryAfterMs?: number;
}
type Listener = { next: (message: DataViewMessage) => void; error: (error: any) => void };
interface Entry {
  query: DataViewQuery;
  listeners: Set<Listener>;
  last?: DataViewMessage;
  retryAt: number;
  blocked: boolean;
}

function matchesQueryConstraints(data: Record<string, any> | undefined, id: string, constraints?: unknown[]): boolean {
  if (!data) return false;
  if (!Array.isArray(constraints) || !constraints.length) return true;
  for (const raw of constraints) {
    const c = raw as { type?: string; field?: string; op?: string; value?: any } | undefined;
    if (!c || c.type !== 'where' || !c.field) continue;
    const fieldVal = c.field === '__name__' ? id : data[c.field];
    switch (c.op) {
      case '==':
        if (fieldVal !== c.value) return false;
        break;
      case '!=':
        if (fieldVal === c.value) return false;
        break;
      case '>=':
        if (!(fieldVal >= c.value)) return false;
        break;
      case '>':
        if (!(fieldVal > c.value)) return false;
        break;
      case '<=':
        if (!(fieldVal <= c.value)) return false;
        break;
      case '<':
        if (!(fieldVal < c.value)) return false;
        break;
      case 'in':
        if (!Array.isArray(c.value) || !c.value.includes(fieldVal)) return false;
        break;
      default:
        break;
    }
  }
  return true;
}

/** One authenticated request serves all live views in this browser tab. */
export class DataViewPoller {
  private entries = new Map<string, Entry>();
  private timer?: ReturnType<typeof setTimeout>;
  private controller?: AbortController;
  private generation = 0;
  private failures = 0;
  private retryAt = 0;
  private dirty = false;

  constructor(
    private request: (queries: DataViewQuery[], signal: AbortSignal) => Promise<{ results: DataViewMessage[] }>,
    private token: () => string,
    private visible: () => boolean,
  ) {}

  applyReservationProgress(detail: { reservations?: any[]; deletedIds?: string[] }) {
    const reservations = Array.isArray(detail?.reservations) ? detail.reservations : [];
    const deletedIds = new Set(Array.isArray(detail?.deletedIds) ? detail.deletedIds : []);
    if (!reservations.length && !deletedIds.size) return;

    for (const entry of this.entries.values()) {
      if (entry.query.path !== 'reservas' || !entry.last?.docs) continue;
      const byId = new Map<string, { id: string; data: any }>(
        entry.last.docs.map((doc: any) => [doc.id, doc]),
      );
      let changed = false;

      for (const delId of deletedIds) {
        if (byId.delete(delId)) changed = true;
      }

      for (const res of reservations) {
        if (!res?.id) continue;
        if (matchesQueryConstraints(res, res.id, entry.query.constraints)) {
          byId.set(res.id, { id: res.id, data: res });
          changed = true;
        } else if (byId.delete(res.id)) {
          changed = true;
        }
      }

      if (changed) {
        const nextDocs = [...byId.values()].sort((a, b) => {
          const fa = a.data?.fecha || '';
          const fb = b.data?.fecha || '';
          if (fa !== fb) return fa < fb ? -1 : 1;
          const ha = a.data?.horaInicio || '';
          const hb = b.data?.horaInicio || '';
          return ha < hb ? -1 : ha > hb ? 1 : 0;
        });
        const nextMessage: DataViewMessage = {
          ...entry.last,
          unchanged: false,
          docs: nextDocs,
        };
        entry.last = nextMessage;
        entry.query.version = undefined;
        for (const listener of entry.listeners) {
          listener.next(nextMessage);
        }
      }
    }
  }

  subscribe(query: DataViewQuery, next: Listener['next'], error: Listener['error']) {
    const key = JSON.stringify(query);
    let entry = this.entries.get(key);
    const listener = { next, error };
    if (!entry) {
      entry = { query: { ...query }, listeners: new Set(), retryAt: 0, blocked: false };
      this.entries.set(key, entry);
      this.dirty = true;
    }
    entry.listeners.add(listener);
    if (entry.last) next(entry.last);
    this.schedule(25);
    return () => {
      entry!.listeners.delete(listener);
      if (!entry!.listeners.size) this.entries.delete(key);
      if (!this.entries.size) {
        clearTimeout(this.timer);
        this.generation++;
        this.controller?.abort();
        this.controller = undefined;
        this.dirty = false;
      }
    };
  }

  refresh(resetSession = false) {
    if (resetSession) {
      this.generation++;
      this.controller?.abort();
      this.controller = undefined;
      this.retryAt = 0;
      this.failures = 0;
      for (const entry of this.entries.values()) {
        entry.query.version = undefined;
        entry.last = undefined;
        entry.blocked = false;
        entry.retryAt = 0;
      }
    }
    this.dirty = true;
    this.schedule(50);
  }

  private schedule(delay: number) {
    clearTimeout(this.timer);
    if (!this.entries.size || !this.token() || !this.visible() || this.controller || this.retryAt === Infinity) return;
    this.timer = setTimeout(() => void this.poll(), Math.max(delay, this.retryAt - Date.now()));
  }

  private async poll() {
    if (!this.visible() || !this.token() || this.controller) return;
    const entries = [...this.entries.values()].filter(entry => !entry.blocked && entry.retryAt <= Date.now());
    if (!entries.length) {
      const retry = Math.min(...[...this.entries.values()].filter(entry => !entry.blocked).map(entry => entry.retryAt));
      if (Number.isFinite(retry)) this.schedule(Math.max(1000, retry - Date.now()));
      return;
    }
    const generation = this.generation;
    const token = this.token();
    const controller = new AbortController();
    this.controller = controller;
    this.dirty = false;
    try {
      // Bound each batch while still sharing one verification across up to 50 views.
      for (let index = 0; index < entries.length; index += 50) {
        const chunk = entries.slice(index, index + 50);
        const response = await this.request(chunk.map(entry => ({ ...entry.query })), controller.signal);
        if (generation !== this.generation || token !== this.token()) return;
        if (!Array.isArray(response.results) || response.results.length !== chunk.length) throw new Error('Respuesta de sincronización incompleta.');
        response.results.forEach((message, i) => {
          const entry = chunk[i];
          if (message.error) {
            entry.blocked = message.status === 401 || message.status === 403;
            entry.retryAt = Date.now() + Math.max(60_000, message.retryAfterMs || 0);
            for (const listener of entry.listeners) listener.error(Object.assign(new Error(message.error), message));
            return;
          }
          entry.query.version = message.version;
          if (message.unchanged) return;
          entry.last = message;
          for (const listener of entry.listeners) listener.next(message);
        });
      }
      this.failures = 0;
      this.retryAt = 0;
    } catch (error: any) {
      if (generation !== this.generation || controller.signal.aborted) return;
      const terminal = error.status === 401 || error.status === 403;
      this.retryAt = terminal ? Infinity : Date.now() + Math.max(error.retryAfterMs || 0, Math.min(300_000, 10_000 * 2 ** Math.min(this.failures++, 5)));
      for (const entry of entries) for (const listener of entry.listeners) listener.error(error);
    } finally {
      if (generation === this.generation) {
        this.controller = undefined;
        if (this.retryAt !== Infinity) this.schedule(this.dirty ? 50 : 60_000);
      }
    }
  }
}
