// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReservationsState } from '../useReservationsState';
import type { Reservation } from '../../types';

const mock = vi.hoisted(() => ({ full: vi.fn(), range: vi.fn(), stops: [] as ReturnType<typeof vi.fn>[],
  listeners: [] as { next: (...args: any[]) => void; error: (error: unknown) => void }[], migration: vi.fn() }));
vi.mock('../../services/reservationService', () => ({
  subscribeToReservations: mock.full, subscribeToReservationsByDateRange: mock.range,
  getLocalCache: () => [], getLastSyncTime: () => null,
  loadHistoricalReservationsMonth: vi.fn(), loadHistoricalReservationsRange: vi.fn(),
}));
vi.mock('../../services/migrations/cleanMinuteConflictsMigration', () => ({
  hasMinuteConflictMigrationRun: () => false, executeMinuteConflictCleanupMigration: mock.migration,
}));
vi.mock('../../services/toastNotificationService', () => ({ triggerSonnerToast: vi.fn() }));
const october = { startDate: '2026-10-01', endDate: '2026-10-31' };
const november = { startDate: '2026-11-01', endDate: '2026-11-30' };
beforeEach(() => {
  vi.clearAllMocks(); mock.stops = []; mock.listeners = [];
  const listen = (next: any, error: any) => {
    const stop = vi.fn(); mock.stops.push(stop); mock.listeners.push({ next, error }); next([], false, true); return stop;
  };
  mock.full.mockImplementation(listen);
  mock.range.mockImplementation((_start, _end, next, error) => listen(next, error));
  mock.migration.mockResolvedValue(undefined);
});
afterEach(cleanup);

it('creates no reservation listener or maintenance writes before login', () => {
  renderHook(() => useReservationsState({ enabled: false }));
  expect(mock.full).not.toHaveBeenCalled(); expect(mock.range).not.toHaveBeenCalled();
  expect(mock.migration).not.toHaveBeenCalled();
});

it('switches months without duplicating listeners and ignores late callbacks from the previous month', () => {
  const { result, rerender, unmount } = renderHook(({ dateRange }) => useReservationsState({ dateRange, allowMaintenance: false }),
    { initialProps: { dateRange: october } });
  expect(mock.full).not.toHaveBeenCalled(); expect(mock.range).toHaveBeenCalledWith(october.startDate, october.endDate, expect.any(Function), expect.any(Function));
  rerender({ dateRange: { ...october } }); expect(mock.range).toHaveBeenCalledTimes(1);
  act(() => mock.listeners[0].next([{ id: 'a' }], true, false));
  expect(result.current.isReadScopeReady).toBe(true);
  rerender({ dateRange: november }); expect(mock.stops[0]).toHaveBeenCalledOnce();
  expect(result.current.isReadScopeReady).toBe(false);
  act(() => mock.listeners[0].next([{ id: 'stale' }], true, false));
  expect(result.current.reservations).toEqual([]);
  act(() => mock.listeners[1].next([{ id: 'new' }], true, false));
  expect(result.current.reservations.map(r => r.id)).toEqual(['new']);
  expect(mock.migration).not.toHaveBeenCalled();
  unmount(); expect(mock.stops[1]).toHaveBeenCalledOnce();
});

it('waits for confirmation after expanding to the editor/general subscription and supports retry', () => {
  const { result, rerender } = renderHook((props: { dateRange?: typeof october }) => useReservationsState({ ...props, allowMaintenance: false }),
    { initialProps: { dateRange: october } as { dateRange?: typeof october } });
  act(() => mock.listeners[0].next([], true, false));
  rerender({}); expect(mock.full).toHaveBeenCalledOnce(); expect(result.current.isReadScopeReady).toBe(false);
  act(() => mock.listeners[1].error(new Error('offline')));
  expect(result.current.readError).toBe(true);
  act(() => result.current.retryRead());
  expect(mock.full).toHaveBeenCalledTimes(2); expect(result.current.readError).toBe(false);
  act(() => mock.listeners[2].next([], true, false));
  expect(result.current.isReadScopeReady).toBe(true);
});

it('keeps local write events inside the reader scope and removes reservations moved out of it', () => {
  const { result } = renderHook(() => useReservationsState({ dateRange: october, allowMaintenance: false }));
  const row = { id: 'a', fecha: '2026-10-07' } as Reservation;
  act(() => mock.listeners[0].next([row], true, false));
  act(() => window.dispatchEvent(new CustomEvent('reservation-write-progress', {
    detail: { deletedIds: [], reservations: [{ ...row, fecha: '2026-11-07' }] },
  })));
  expect(result.current.reservations).toEqual([]);
});
