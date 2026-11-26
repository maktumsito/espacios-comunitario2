import { SESSION_REJECTED_EVENT, readBrowserSessionToken } from '../services/browserSession';
import { DataViewPoller } from './dataViewPoller';

export type {
  Firestore,
  Unsubscribe,
  Query,
  DocumentReference,
  CollectionReference,
  QuerySnapshot,
  DocumentSnapshot,
  QueryDocumentSnapshot,
  DocumentData,
  QueryConstraint,
  SetOptions,
} from 'firebase/firestore';

export const usesDataApi = () => true;
export const sessionToken = readBrowserSessionToken;

export class DataApiError extends Error {
  constructor(
    message: string,
    public status = 500,
    public code = 'unavailable',
    public retryAfterMs = 0,
  ) {
    super(message);
  }
}

function responseFailure(response: Response, result: any) {
  const seconds = Number(response.headers.get('Retry-After'));
  return new DataApiError(
    result.error || 'No se pudo completar la operación.',
    response.status,
    result.code,
    Number.isFinite(seconds) ? Math.min(3_600_000, Math.max(0, seconds * 1000)) : 0,
  );
}

export async function dataRequest(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<any> {
  const sentToken = sessionToken();
  if (!sentToken) {
    throw new DataApiError('Inicia sesión para acceder a los datos.', 401, 'unauthenticated');
  }
  const response = await fetch(path, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sentToken}`,
    },
    body: JSON.stringify(body),
  });
  if (
    response.status === 401 &&
    path === '/api/data/listen-batch' &&
    sentToken === sessionToken() &&
    typeof window !== 'undefined'
  ) {
    window.dispatchEvent(new Event(SESSION_REJECTED_EVENT));
  }
  const result = await response.json();
  if (!response.ok || result.success === false) {
    throw responseFailure(response, result);
  }
  if (
    ![
      '/api/data/read',
      '/api/data/listen',
      '/api/data/listen-batch',
      '/api/maintenance/status',
      '/api/reservations/planning-snapshot',
      '/api/reservations/cake-stock',
    ].includes(path)
  ) {
    announceDataChange();
  }
  return result;
}

export function announceDataChange(options?: { local?: boolean }) {
  if (typeof window === 'undefined') return;
  if (options?.local !== false) {
    window.dispatchEvent(new Event('data-changed'));
  }
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('espacios-data-v1');
    channel.postMessage('changed');
    channel.close();
  }
}

export async function reservationRequest(
  body: unknown,
  onProgress: (result: any) => Promise<void>,
): Promise<any> {
  const controller = new AbortController();
  const response = await fetch('/api/reservations/commit', {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson',
      Authorization: `Bearer ${sessionToken()}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const result = await response.json();
    throw responseFailure(response, result);
  }
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let final: any;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const packet = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        if (packet.progress) await onProgress(packet.progress);
        else final = packet;
      }
    }
    if (!final || final.success === false) {
      throw new DataApiError(
        final?.error || 'Se perdió la confirmación del servidor. Reanuda el guardado.',
        final?.status || 500,
      );
    }
    announceDataChange({ local: false });
    return final;
  } finally {
    await reader.cancel().catch(() => {});
    controller.abort();
  }
}

export interface DataReference {
  path: string;
  kind: 'document' | 'query';
  constraints?: any[];
}

function joinPath(base: string | undefined, segments: string[]): string {
  const parts = [...(base ? [base] : []), ...segments]
    .join('/')
    .split('/')
    .filter(Boolean);
  return parts.join('/');
}

function makeRef(firestore: any, path: string, kind: 'document' | 'query', constraints: any[] = []): any {
  const id = path.split('/').at(-1) || '';
  return {
    firestore,
    path,
    id,
    type: kind === 'document' ? 'document' : 'collection',
    __desc: { path, kind, ...(kind === 'query' ? { constraints } : {}) } as DataReference,
  };
}

function describe(ref: any): DataReference {
  if (ref?.__desc) return ref.__desc;
  const path = String(ref?.path || '');
  return {
    path,
    kind: ref?.type === 'document' || path.split('/').length % 2 === 0 ? 'document' : 'query',
  };
}

export const documentId = () => '__name__' as any;
export const serverTimestamp = () => new Date().toISOString() as any;

export const collection = ((parent: any, ...paths: string[]) => {
  const basePath = parent?.path;
  const fullPath = joinPath(basePath, paths);
  return makeRef(parent?.firestore || parent, fullPath, 'query', []);
}) as any;

export const doc = ((parent: any, ...paths: string[]) => {
  const basePath = parent?.path;
  const fullPath = joinPath(basePath, paths);
  return makeRef(parent?.firestore || parent, fullPath, 'document');
}) as any;

export const where = ((field: any, op: string, value: unknown) => ({
  type: 'where',
  field: typeof field === 'string' ? field : '__name__',
  op,
  value,
})) as any;

export const orderBy = ((field: any, direction: 'asc' | 'desc' = 'asc') => ({
  type: 'orderBy',
  field: typeof field === 'string' ? field : '__name__',
  direction,
})) as any;

export const limit = ((count: number) => ({ type: 'limit', count })) as any;

export const startAfter = ((...values: any[]) => ({ type: 'startAfter', values })) as any;

export const query = ((ref: any, ...constraints: any[]) => {
  const d = describe(ref);
  return makeRef(ref?.firestore, d.path, 'query', [...(d.constraints || []), ...constraints.filter(Boolean)]);
}) as any;

export const refEqual = ((a: any, b: any) => JSON.stringify(describe(a)) === JSON.stringify(describe(b))) as any;
export const queryEqual = refEqual;

const cache = new Map<string, any>();
let cacheToken = '';
function key(ref: any) {
  const token = sessionToken();
  if (cacheToken !== token) {
    cache.clear();
    cacheToken = token;
  }
  return JSON.stringify(describe(ref));
}

function clientSnapshot(ref: any, records: any[], changes: any[] = [], fromCache = false): any {
  const d = describe(ref);
  const parent = d.kind === 'document' ? d.path.split('/').slice(0, -1).join('/') : d.path;
  const docs = records.map((r) => ({
    id: r.id,
    ref: makeRef(ref?.firestore, joinPath(parent, [r.id]), 'document'),
    exists: () => r.data !== null,
    data: () => (r.data === null ? undefined : r.data),
    get: (f: string) => r.data?.[f],
    metadata: { fromCache, hasPendingWrites: false },
  }));
  if (d.kind === 'document') {
    return (
      docs[0] || {
        id: d.path.split('/').at(-1),
        ref,
        exists: () => false,
        data: () => undefined,
        metadata: { fromCache, hasPendingWrites: false },
      }
    );
  }
  return {
    docs,
    size: docs.length,
    empty: !docs.length,
    metadata: { fromCache, hasPendingWrites: false },
    forEach: (fn: any) => docs.forEach(fn),
    docChanges: () =>
      changes.length
        ? changes.map((c) => ({
            ...c,
            doc: docs.find((x: any) => x.id === c.id) || {
              id: c.id,
              data: () => c.data,
              ref: makeRef(ref?.firestore, joinPath(d.path, [c.id]), 'document'),
            },
          }))
        : docs.map((docSnap: any, i: number) => ({
            type: 'added',
            doc: docSnap,
            oldIndex: -1,
            newIndex: i,
          })),
  };
}

async function read(ref: any) {
  const result = await dataRequest('/api/data/read', describe(ref));
  cache.set(key(ref), result.docs);
  return clientSnapshot(ref, result.docs);
}

export const getDoc = ((ref: any) => read(ref)) as any;
export const getDocFromServer = getDoc;
export const getDocs = getDoc;
export const getDocsFromServer = getDoc;
export const getDocsFromCache = ((ref: any) =>
  Promise.resolve(clientSnapshot(ref, cache.get(key(ref)) || [], [], true))) as any;

export const setDoc = ((ref: any, data: any, options?: any) =>
  dataRequest('/api/data/write', {
    writes: [{ path: ref.path, data, options, type: 'set' }],
  }).then(() => undefined)) as any;

export const updateDoc = ((ref: any, data: any) =>
  dataRequest('/api/data/write', {
    writes: [{ path: ref.path, data, type: 'update' }],
  }).then(() => undefined)) as any;

export const deleteDoc = ((ref: any) =>
  dataRequest('/api/data/write', {
    writes: [{ path: ref.path, type: 'delete' }],
  }).then(() => undefined)) as any;

export const writeBatch = ((_db: any) => {
  const writes: any[] = [];
  const batch = {
    set: (ref: any, data: any, options?: any) => {
      writes.push({ path: ref.path, data, options, type: 'set' });
      return batch;
    },
    update: (ref: any, data: any) => {
      writes.push({ path: ref.path, data, type: 'update' });
      return batch;
    },
    delete: (ref: any) => {
      writes.push({ path: ref.path, type: 'delete' });
      return batch;
    },
    commit: () => dataRequest('/api/data/write', { writes }).then(() => undefined),
  };
  return batch;
}) as any;

export const runTransaction = ((_db: any, _update: any, _options?: any) => {
  throw new Error('La transacción debe ejecutarse mediante la operación autorizada del servidor.');
}) as any;

export const onSnapshot = ((ref: any, ...args: any[]) => {
  const next = typeof args[0] === 'function' ? args[0] : args[1];
  const error = typeof args[0] === 'function' ? args[1] : args[2];
  let records: any[] = [];
  return getDataViewPoller().subscribe(
    describe(ref),
    (message) => {
      if (message.docs) {
        const previous = records;
        records = message.docs;
        const currentIds = new Set(records.map((r) => r.id));
        const previousById = new Map(previous.map((r, i) => [r.id, { ...r, index: i }]));
        const changes = previous
          .filter((r) => !currentIds.has(r.id))
          .map((r) => ({
            type: 'removed',
            id: r.id,
            data: r.data,
            oldIndex: previousById.get(r.id)!.index,
            newIndex: -1,
          }));
        records.forEach((r, i) => {
          const old = previousById.get(r.id);
          if (!old || JSON.stringify(old.data) !== JSON.stringify(r.data)) {
            changes.push({
              type: old ? 'modified' : 'added',
              id: r.id,
              data: r.data,
              oldIndex: old?.index ?? -1,
              newIndex: i,
            });
          }
        });
        cache.set(key(ref), [...records]);
        next(clientSnapshot(ref, records, changes));
      }
    },
    (failure) => error?.(failure),
  );
}) as any;

let dataViewPoller: DataViewPoller | undefined;
function getDataViewPoller() {
  if (dataViewPoller) return dataViewPoller;
  const poller = new DataViewPoller(
    (queries, signal) => dataRequest('/api/data/listen-batch', { queries }, signal),
    sessionToken,
    () => document.visibilityState === 'visible',
  );
  dataViewPoller = poller;
  const channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('espacios-data-v1') : undefined;
  const changed = (e: Event) => {
    if (e instanceof StorageEvent && e.key !== 'espacios_auth_token_v2') return;
    cache.clear();
    poller.refresh(true);
  };
  const focus = () => {
    if (document.visibilityState === 'visible') poller.refresh();
  };
  const reservationProgress = (e: Event) => {
    const detail = (e as CustomEvent)?.detail;
    if (detail) poller.applyReservationProgress(detail);
  };
  channel?.addEventListener('message', focus);
  window.addEventListener('auth-session-changed', changed);
  window.addEventListener('storage', changed);
  window.addEventListener('data-changed', focus);
  window.addEventListener('reservation-write-progress', reservationProgress);
  window.addEventListener('focus', focus);
  document.addEventListener('visibilitychange', focus);
  return poller;
}
