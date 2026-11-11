import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DataViewPoller, type DataViewQuery } from '../dataViewPoller';

const queries: DataViewQuery[] = ['reservas', 'calificaciones_espacios', 'usuarios_sistema', 'bloqueos_espacios', 'configuracion_sistema/espacios', 'configuracion_sistema/equipamiento', 'fcm_notificaciones']
  .map(path => ({ path, kind: path.includes('/') ? 'document' : 'query' }));
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function setup() {
  let visible = true, token = 'session';
  const request = vi.fn(async (batch: DataViewQuery[]) => ({ results: batch.map(q => q.version
    ? { unchanged: true, version: q.version } : { docs: [{ id: q.path, data: {} }], version: `v-${q.path}` }) }));
  const poller = new DataViewPoller(request, () => token, () => visible);
  const next = vi.fn(), error = vi.fn();
  const stops = queries.map(query => poller.subscribe(query, next, error));
  return { poller, request, next, error, stop: () => stops.forEach(stop => stop()), hide: () => { visible = false; }, show: () => { visible = true; }, setToken: (value: string) => { token = value; } };
}

it('groups seven views into one request per minute and sends conditional versions without a refresh loop', async () => {
  const p = setup();
  await vi.advanceTimersByTimeAsync(25);
  expect(p.request).toHaveBeenCalledTimes(1);
  expect(p.request.mock.calls[0][0]).toHaveLength(7);
  expect(p.next).toHaveBeenCalledTimes(7);
  await vi.advanceTimersByTimeAsync(59_999);
  expect(p.request).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(p.request).toHaveBeenCalledTimes(2);
  expect(p.request.mock.calls[1][0].every(query => query.version)).toBe(true);
  expect(p.next).toHaveBeenCalledTimes(7);
  p.stop();
});

it('shares duplicate views and pauses hidden tabs until they are visible again', async () => {
  const p = setup();
  const duplicate = vi.fn();
  const stopDuplicate = p.poller.subscribe(queries[0], duplicate, p.error);
  await vi.advanceTimersByTimeAsync(25);
  expect(p.request.mock.calls[0][0]).toHaveLength(7);
  expect(duplicate).toHaveBeenCalledOnce();
  p.hide();
  await vi.advanceTimersByTimeAsync(600_000);
  expect(p.request).toHaveBeenCalledOnce();
  p.show(); p.poller.refresh();
  await vi.advanceTimersByTimeAsync(50);
  expect(p.request).toHaveBeenCalledTimes(2);
  stopDuplicate(); p.stop();
});

it('honors quota cooldown even after repeated focus or write notifications and retains subscribers for recovery', async () => {
  const p = setup();
  p.request.mockRejectedValueOnce(Object.assign(new Error('Cuota agotada'), { status: 503, retryAfterMs: 120_000 }));
  await vi.advanceTimersByTimeAsync(25);
  expect(p.error).toHaveBeenCalledTimes(7);
  for (let i = 0; i < 10; i++) { p.poller.refresh(); await vi.advanceTimersByTimeAsync(1000); }
  expect(p.request).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(110_000);
  expect(p.request).toHaveBeenCalledTimes(2);
  expect(p.next).toHaveBeenCalledTimes(7);
  p.stop();
});

it('rejects expired sessions without retrying and drops late responses from the previous account', async () => {
  const p = setup();
  p.request.mockRejectedValueOnce(Object.assign(new Error('Sesión vencida'), { status: 401 }));
  await vi.advanceTimersByTimeAsync(25);
  p.poller.refresh();
  await vi.advanceTimersByTimeAsync(600_000);
  expect(p.request).toHaveBeenCalledOnce();
  let resolve!: (value: any) => void;
  p.request.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  p.poller.refresh(true);
  await vi.advanceTimersByTimeAsync(50);
  p.setToken('new-session'); p.poller.refresh(true);
  resolve({ results: queries.map(() => ({ docs: [{ id: 'old-account' }], version: 'old' })) });
  await vi.advanceTimersByTimeAsync(50);
  expect(p.next).toHaveBeenCalledTimes(7);
  expect(p.next.mock.calls.some(([message]) => message.version === 'old')).toBe(false);
  p.stop();
});

it('does not deliver or schedule work after the last view is removed during a request', async () => {
  const p = setup();
  let resolve!: (value: any) => void;
  p.request.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await vi.advanceTimersByTimeAsync(25);
  p.stop();
  resolve({ results: queries.map(() => ({ docs: [], version: 'late' })) });
  await vi.advanceTimersByTimeAsync(600_000);
  expect(p.request).toHaveBeenCalledOnce();
  expect(p.next).not.toHaveBeenCalled();
});

it('reconciles cached reservation views in place when reservation write progress arrives', async () => {
  const query: DataViewQuery = {
    path: 'reservas',
    kind: 'query',
    constraints: [
      { type: 'where', field: 'fecha', op: '>=', value: '2026-10-01' },
      { type: 'where', field: 'fecha', op: '<=', value: '2026-10-31' },
    ],
  };
  const request = vi.fn(async () => ({
    results: [{
      docs: [
        { id: 'r1', data: { id: 'r1', fecha: '2026-10-10', horaInicio: '10:00', descripcion: 'Inicial' } },
        { id: 'r2', data: { id: 'r2', fecha: '2026-10-12', horaInicio: '09:00', descripcion: 'Mantener' } },
      ],
      version: 'v1',
    }],
  }));
  const poller = new DataViewPoller(request, () => 'session', () => true);
  const next = vi.fn();
  const stop = poller.subscribe(query, next, vi.fn());
  await vi.advanceTimersByTimeAsync(25);
  expect(next).toHaveBeenCalledTimes(1);

  poller.applyReservationProgress({
    reservations: [
      { id: 'r1', fecha: '2026-10-15', horaInicio: '11:00', descripcion: 'Editada' },
    ],
    deletedIds: ['r2'],
  });

  expect(next).toHaveBeenCalledTimes(2);
  expect(next.mock.calls[1][0].docs).toEqual([
    { id: 'r1', data: { id: 'r1', fecha: '2026-10-15', horaInicio: '11:00', descripcion: 'Editada' } },
  ]);
  expect(request).toHaveBeenCalledTimes(1);
  stop();
});
