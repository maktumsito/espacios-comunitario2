// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ next: undefined as any, stop: vi.fn(), hydrate: vi.fn() }));
vi.mock('../../firebase/sharedSnapshot', () => ({
  sharedOnSnapshot: (_query: unknown, next: any) => { sdk.next = next; return sdk.stop; },
}));
vi.mock('../../firebase/config', () => ({ getDb: () => ({}) }));
vi.mock('../../utils/indexedDbStorage', () => ({
  getIndexedDbReservations: sdk.hydrate, setIndexedDbReservations: async () => {},
}));
vi.mock('../reservationWriter', async importOriginal => ({
  ...await importOriginal<typeof import('../reservationWriter')>(),
  writeReservations: vi.fn(async (_db, rows, _clean, options) => {
    const result = { reservations: rows, deletedIds: [], confirmedIds: rows.map((r: any) => r.id), pendingIds: [] };
    options.onProgress(result);
    return result;
  }),
}));
vi.mock('firebase/firestore', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/firestore')>(),
  collection: (_db: unknown, path: string) => ({ path }),
  query: (ref: unknown) => ref,
}));

const row = (id: string, fecha: string) => ({
  id, fecha, horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 1',
  responsable: 'Vecino', tipoActividad: 'TALLER', descripcion: 'Taller', actividadRecurrente: 'No', estado: 'activa',
}) as any;
function snapshot(rows: any[], fromCache = false) {
  const docs = rows.map(r => ({ id: r.id, data: () => r }));
  return { docs, empty: docs.length === 0, metadata: { fromCache, hasPendingWrites: false }, forEach: (fn: any) => docs.forEach(fn) };
}
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
  sdk.hydrate.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

it('preserves local data for cache events, then removes remote deletions while retaining history', async () => {
  const service = await import('../reservationService');
  service.setLocalCache([row('historical', '2025-11-03'), row('active', '2026-10-05')]);
  const stop = service.subscribeToReservations(vi.fn(), vi.fn());
  sdk.next(snapshot([], true));
  expect(service.getLocalCache().map(r => r.id).sort()).toEqual(['active', 'historical']);
  sdk.next(snapshot([]));
  expect(service.getLocalCache().map(r => r.id)).toEqual(['historical']);
  stop();
});

it('keeps a confirmed empty cache empty and prevents delayed IndexedDB hydration from resurrecting data', async () => {
  let resolve!: (rows: any[]) => void;
  sdk.hydrate.mockReturnValue(new Promise<any[]>(done => { resolve = done; }));
  const service = await import('../reservationService');
  service.setLocalCache([]);
  const onData = vi.fn();
  const stop = service.subscribeToReservations(onData, vi.fn());
  sdk.next(snapshot([]));
  resolve([row('stale', '2026-10-05')]);
  await Promise.resolve();
  expect(service.getLocalCache()).toEqual([]);
  expect(onData.mock.calls.at(-1)?.[0]).toEqual([]);
  stop();
});

it('reconciles additions, edits and removals inside a live date range while preserving other cached months', async () => {
  const service = await import('../reservationService');
  service.setLocalCache([row('old', '2026-10-05'), row('future', '2027-01-04')]);
  const onData = vi.fn();
  const stop = service.subscribeToReservationsByDateRange('2026-10-01', '2026-10-31', onData, vi.fn());
  expect(onData.mock.calls.at(-1)?.[0].map((r: any) => r.id)).toEqual(['old']);
  sdk.next(snapshot([row('new', '2026-10-07')]));
  expect(onData.mock.calls.at(-1)?.[0].map((r: any) => r.id)).toEqual(['new']);
  expect(service.getLocalCache().map(r => r.id).sort()).toEqual(['future', 'new']);
  sdk.next(snapshot([{ ...row('new', '2026-10-07'), descripcion: 'Cambio remoto' }]));
  expect(onData.mock.calls.at(-1)?.[0][0].descripcion).toBe('Cambio remoto');
  sdk.next(snapshot([]));
  expect(onData.mock.calls.at(-1)?.[0]).toEqual([]);
  expect(service.getLocalCache().map(r => r.id)).toEqual(['future']);
  stop();
});

it.each(['active', 'date range'])('keeps the original slot available after a confirmed move and a late %s snapshot', async scope => {
  const service = await import('../reservationService');
  const { checkSingleConflict } = await import('../../utils/conflictDetector');
  const original = { ...row('moved', '2026-10-07'), version: 1, createdAt: '2026-10-06T09:00:00Z' };
  const moved = { ...original, espacio: 'SALA 2', version: 2 };
  const onData = vi.fn();
  const stop = scope === 'active'
    ? service.subscribeToReservations(onData, vi.fn())
    : service.subscribeToReservationsByDateRange('2026-10-01', '2026-10-31', onData, vi.fn());
  sdk.next(snapshot([original]));

  await service.commitReservationChanges([moved], { intent: 'update' });
  sdk.next(snapshot([original]));

  const latest = onData.mock.calls.at(-1)?.[0];
  const booking = { ...original, id: 'new-booking' };
  expect(checkSingleConflict(booking, latest)).toEqual([]);
  expect(checkSingleConflict({ ...booking, espacio: moved.espacio }, latest).map(r => r.id)).toEqual([moved.id]);
  expect(service.getLocalCache()).toMatchObject([{ id: moved.id, espacio: moved.espacio, version: moved.version }]);

  sdk.next(snapshot([{ ...moved, espacio: 'SALA 3', version: 3 }]));
  expect(onData.mock.calls.at(-1)?.[0]).toMatchObject([{ id: moved.id, espacio: 'SALA 3', version: 3 }]);
  sdk.next(snapshot([{ ...original, createdAt: '2026-10-06T12:00:00Z' }]));
  expect(onData.mock.calls.at(-1)?.[0]).toMatchObject([{ id: original.id, espacio: original.espacio, version: 1 }]);
  sdk.next(snapshot([]));
  expect(onData.mock.calls.at(-1)?.[0]).toEqual([]);
  stop();
});
