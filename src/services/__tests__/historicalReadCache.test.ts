// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ getDocs: vi.fn() }));
vi.mock('firebase/firestore', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/firestore')>(), getDocs: sdk.getDocs,
  collection: (_db: unknown, path: string) => ({ type: 'collection', path }),
  query: (ref: unknown, ...constraints: unknown[]) => ({ type: 'query', ref, constraints }),
}));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
  sdk.getDocs.mockResolvedValue({ metadata: { fromCache: false }, docs: [], size: 0 });
});
afterEach(() => vi.useRealTimers());

it('deduplicates simultaneous month/range requests, caches empty results and refreshes after TTL', async () => {
  const service = await import('../reservationService');
  await Promise.all([
    service.loadHistoricalReservationsMonth(2025, 11),
    service.loadHistoricalReservationsRange('2025-11-01', '2025-11-30'),
  ]);
  expect(sdk.getDocs).toHaveBeenCalledTimes(1);
  expect(service.isHistoricalMonthLoaded('2025-11')).toBe(true);
  await service.loadHistoricalReservationsMonth(2025, 11);
  expect(sdk.getDocs).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(60 * 60_000);
  expect(service.isHistoricalMonthLoaded('2025-11')).toBe(false);
  await service.loadHistoricalReservationsMonth(2025, 11);
  expect(sdk.getDocs).toHaveBeenCalledTimes(2);
});

it('reuses confirmed history after reload without another server query', async () => {
  const first = await import('../reservationService');
  await first.loadHistoricalReservationsMonth(2025, 11);
  vi.resetModules();
  const reloaded = await import('../reservationService');
  await reloaded.loadHistoricalReservationsMonth(2025, 11);
  expect(sdk.getDocs).toHaveBeenCalledTimes(1);
});

it('does not mark failed or offline queries as synchronized and allows retry', async () => {
  const service = await import('../reservationService');
  sdk.getDocs.mockRejectedValueOnce(new Error('offline'));
  await service.loadHistoricalReservationsMonth(2025, 11);
  expect(service.isHistoricalMonthLoaded('2025-11')).toBe(false);
  sdk.getDocs.mockResolvedValueOnce({ metadata: { fromCache: true }, docs: [], size: 0 });
  await service.loadHistoricalReservationsMonth(2025, 11);
  expect(service.isHistoricalMonthLoaded('2025-11')).toBe(false);
  await service.loadHistoricalReservationsMonth(2025, 11);
  expect(service.isHistoricalMonthLoaded('2025-11')).toBe(true);
  expect(sdk.getDocs).toHaveBeenCalledTimes(3);
});
