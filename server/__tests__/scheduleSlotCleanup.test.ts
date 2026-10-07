import { expect, it, vi } from 'vitest';
import { isPurgeableScheduleSlot, guardedSlotCleanup } from '../scheduleSlotCleanup';
it('purges only old, explicitly empty availability indices',()=> {
  expect(isPurgeableScheduleSlot('2026-08-01_SALA%202',{bookings:[]},'2026-09-01')).toBe(true);
  expect(isPurgeableScheduleSlot('2026-08-01_SALA%202',{bookings:[{id:'historic'}]},'2026-09-01')).toBe(false);
  expect(isPurgeableScheduleSlot('2026-08-01_SALA%202',{},'2026-09-01')).toBe(false);
  expect(isPurgeableScheduleSlot('2026-10-01_SALA%202',{bookings:[]},'2026-09-01')).toBe(false);
});

it('shares cleanup between editors and timer, skips repeated scans and retries failures', async () => {
  const run = vi.fn().mockResolvedValue({ purgedCount: 4, message: 'done' });
  const check = guardedSlotCleanup(run);
  await Promise.all([check(), check(), check()]);
  expect(run).toHaveBeenCalledTimes(1);
  expect((await check()).purgedCount).toBe(0);
  expect(run).toHaveBeenCalledTimes(1);
  await expect(check(-1)).rejects.toThrow('1 y 365');
  const failing = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ purgedCount: 0, message: 'done' });
  const retry = guardedSlotCleanup(failing);
  await expect(retry()).rejects.toThrow('offline');
  await retry(); expect(failing).toHaveBeenCalledTimes(2);
});
