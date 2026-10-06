// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ next: undefined as any, stop: vi.fn(), hydrate: vi.fn() }));
vi.mock('../../firebase/sharedSnapshot', () => ({
  sharedOnSnapshot: (_query: unknown, next: any) => { sdk.next = next; return sdk.stop; },
}));
vi.mock('../../utils/indexedDbStorage', () => ({
  getIndexedDbReservations: sdk.hydrate, setIndexedDbReservations: async () => {},
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
