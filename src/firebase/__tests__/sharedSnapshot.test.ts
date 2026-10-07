import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ next: undefined as any, error: undefined as any, stop: vi.fn(), listen: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  onSnapshot: sdk.listen,
  queryEqual: (a: any, b: any) => a.key === b.key,
  refEqual: (a: any, b: any) => a.key === b.key,
}));
vi.mock('../../utils/firestoreTracker', () => ({ recordFirestoreRead: vi.fn() }));
import { sharedOnSnapshot } from '../sharedSnapshot';
import { recordFirestoreRead } from '../../utils/firestoreTracker';

const queryRef = { type: 'query', key: 'reservas' } as any;
function snapshot(size: number, changes: number, fromCache = false, hasPendingWrites = false) {
  return { docs: [], size, metadata: { fromCache, hasPendingWrites }, docChanges: () => Array(changes).fill({}) };
}
describe('shared Firestore subscriptions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    sdk.listen.mockImplementation((_ref, _options, next, error) => {
      sdk.next = next; sdk.error = error; return sdk.stop;
    });
  });
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers(); });

  it('shares a query, replays its latest snapshot and survives a brief remount', () => {
    const first = vi.fn(), second = vi.fn();
    const stopFirst = sharedOnSnapshot(queryRef, first);
    const data = snapshot(100, 100);
    sdk.next(data);
    const stopSecond = sharedOnSnapshot({ ...queryRef }, second);
    expect(sdk.listen).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(data);
    stopFirst(); stopSecond();
    vi.advanceTimersByTime(500);
    const stopThird = sharedOnSnapshot(queryRef, vi.fn());
    expect(sdk.listen).toHaveBeenCalledTimes(1);
    expect(sdk.stop).not.toHaveBeenCalled();
    stopThird(); vi.advanceTimersByTime(1000);
    expect(sdk.stop).toHaveBeenCalledTimes(1);
  });

  it('ignores cache/pending writes and estimates changes instead of the whole result on updates', () => {
    const stop = sharedOnSnapshot(queryRef, vi.fn());
    sdk.next(snapshot(100, 100, true));
    sdk.next(snapshot(100, 1, false, true));
    expect(recordFirestoreRead).not.toHaveBeenCalled();
    sdk.next(snapshot(100, 0)); // Metadata transition to the first server confirmation.
    sdk.next(snapshot(100, 1));
    sdk.next(snapshot(100, 0));
    expect(vi.mocked(recordFirestoreRead).mock.calls.map(call => call[1])).toEqual([100, 1, 0]);
    stop();
  });

  it('counts an empty server query and forwards terminal errors without retrying', () => {
    const error = vi.fn();
    const stop = sharedOnSnapshot(queryRef, vi.fn(), error);
    sdk.next(snapshot(0, 0));
    expect(recordFirestoreRead).toHaveBeenCalledWith('consultas_en_vivo', 1);
    sdk.error({ code: 'resource-exhausted' });
    expect(error).toHaveBeenCalledWith({ code: 'resource-exhausted' });
    const secondError = vi.fn();
    const stopSecond = sharedOnSnapshot(queryRef, vi.fn(), secondError);
    expect(secondError).toHaveBeenCalledWith({ code: 'resource-exhausted' });
    expect(sdk.listen).toHaveBeenCalledTimes(1);
    stop(); stopSecond();
  });

  it('allows an explicit resubscription after a terminal error when no consumers remain', () => {
    const stop = sharedOnSnapshot(queryRef, vi.fn(), vi.fn());
    sdk.error({ code: 'unavailable' });
    stop();
    const stopRetry = sharedOnSnapshot(queryRef, vi.fn(), vi.fn());
    expect(sdk.listen).toHaveBeenCalledTimes(2);
    stopRetry();
  });
});
