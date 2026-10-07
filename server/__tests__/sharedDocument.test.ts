import { afterEach, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ next: undefined as any, error: undefined as any, stop: vi.fn(), listen: vi.fn() }));
vi.mock('firebase/firestore', () => ({ onSnapshot: sdk.listen }));
import { SharedServerDocument } from '../sharedDocument';
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
const snapshot = (value: any, fromCache = false, hasPendingWrites = false) => ({
  exists: () => value !== undefined, data: () => value, metadata: { fromCache, hasPendingWrites },
});
function document() {
  sdk.listen.mockImplementation((_ref, _options, next, error) => {
    sdk.next = next; sdk.error = error; return sdk.stop;
  });
  return new SharedServerDocument({} as any);
}

it('serves repeated scheduler checks from one live document and follows remote changes/deletion', async () => {
  const config = document();
  const first = config.read(), second = config.read();
  sdk.next(snapshot({ data: { schedule: { enabled: true } } }));
  expect(await first).toEqual(await second);
  for (let count = 0; count < 1440; count++) await config.read();
  expect(sdk.listen).toHaveBeenCalledTimes(1);
  sdk.next(snapshot({ data: { schedule: { enabled: false } } }));
  expect(await config.read()).toMatchObject({ data: { schedule: { enabled: false } } });
  sdk.next(snapshot(undefined));
  expect(await config.read()).toBeUndefined();
  config.close(); expect(sdk.stop).toHaveBeenCalledOnce();
});

it('does not dispatch using cached/offline configuration and recovers a confirmed stream', async () => {
  vi.useFakeTimers();
  const config = document();
  const pending = config.read();
  sdk.next(snapshot({ data: 'old' }, true));
  const rejection = expect(pending).rejects.toThrow('confirmada');
  await vi.advanceTimersByTimeAsync(5000); await rejection;
  sdk.next(snapshot({ data: 'fresh' }));
  expect(await config.read()).toEqual({ data: 'fresh' });
  sdk.next(snapshot({ data: 'fresh' }, true));
  const offline = expect(config.read()).rejects.toThrow('confirmada');
  await vi.advanceTimersByTimeAsync(5000); await offline;
  config.close();
});

it('bounds retries on a terminal error and ignores callbacks after closing', async () => {
  vi.useFakeTimers();
  const config = document();
  const pending = config.read();
  sdk.error(new Error('permission denied'));
  await expect(pending).rejects.toThrow('permission');
  await expect(config.read()).rejects.toThrow('permission');
  expect(sdk.listen).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(60_000);
  const next = config.read(); sdk.next(snapshot({ data: 'ready' })); await next;
  expect(sdk.listen).toHaveBeenCalledTimes(2);
  config.close(); sdk.next(snapshot({ data: 'late' }));
  const reopened = config.read();
  sdk.next(snapshot({ data: 'new stream' }));
  expect(await reopened).toEqual({ data: 'new stream' });
  config.close();
});
