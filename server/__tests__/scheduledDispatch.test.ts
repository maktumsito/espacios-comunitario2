import express from 'express';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { registerScheduledCheck, singleFlight, scheduledRetryGate, type ScheduledDispatchResult } from '../scheduledDispatch';

const secret = 'test-scheduler-token-32-characters-minimum';
async function withRoute(configured: string | undefined, execute: (force: boolean) => Promise<ScheduledDispatchResult>, run: (url: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  registerScheduledCheck(app, () => configured, execute);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/email/scheduled-check`); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

describe('external scheduled dispatch', () => {
  it('backs off delivery failures but does not cache normal skips or successful checks', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const execute = vi.fn().mockResolvedValueOnce({ success: false, message: 'Delivery failed' })
        .mockResolvedValueOnce({ success: false, skipped: true, message: 'Not due' })
        .mockResolvedValue({ success: true, message: 'Delivered' });
      const check = scheduledRetryGate(execute);
      await check();
      vi.advanceTimersByTime(60_000);
      await check();
      expect(execute).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(4 * 60_000);
      await check(); await check();
      expect(execute).toHaveBeenCalledTimes(3);
    } finally { vi.useRealTimers(); }
  });
  it('fails closed when unconfigured or unauthenticated', async () => {
    const execute = vi.fn();
    await withRoute(undefined, execute, async url => {
      expect((await fetch(url, { method: 'POST' })).status).toBe(503);
    });
    await withRoute(secret, execute, async url => {
      for (const supplied of ['', 'wrong', `${secret}extra`]) {
        expect((await fetch(url, { method: 'POST', headers: { 'X-Scheduler-Token': supplied } })).status).toBe(401);
      }
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('always respects saved schedule and acknowledges normal skips without exposing recipients', async () => {
    const execute = vi.fn(async () => ({ success: false, skipped: true, message: 'Aún no es la hora.', recipients: ['private@example.com'] }));
    await withRoute(secret, execute, async url => {
      const response = await fetch(url, { method: 'POST', headers: { 'X-Scheduler-Token': secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }) });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: false, skipped: true, message: 'Aún no es la hora.' });
      expect(response.headers.get('cache-control')).toBe('no-store');
    });
    expect(execute).toHaveBeenCalledWith(false);
  });

  it('waits for completion and tells the scheduler to retry actual delivery failures', async () => {
    let completed = false;
    await withRoute(secret, async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      completed = true;
      return { success: true, message: 'Enviado.' };
    }, async url => {
      expect((await fetch(url, { method: 'POST', headers: { 'X-Scheduler-Token': secret } })).status).toBe(200);
      expect(completed).toBe(true);
    });
    await withRoute(secret, async () => ({ success: false, message: 'Gmail no disponible.' }), async url => {
      expect((await fetch(url, { method: 'POST', headers: { 'X-Scheduler-Token': secret } })).status).toBe(503);
    });
    await withRoute(secret, async () => { throw new Error(secret); }, async url => {
      const response = await fetch(url, { method: 'POST', headers: { 'X-Scheduler-Token': secret } });
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain(secret);
    });
  });

  it('merges overlapping timer/HTTP checks and releases the lock on failure', async () => {
    let release!: () => void;
    const execute = vi.fn(async () => { await new Promise<void>(resolve => { release = resolve; }); return 'done'; });
    const check = singleFlight(execute);
    const first = check();
    const second = check();
    expect(second).toBe(first);
    await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(1);
    release();
    expect(await second).toBe('done');
    const third = check();
    await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(2);
    release();
    await third;
    const fail = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('ok');
    const retry = singleFlight(fail);
    await expect(retry()).rejects.toThrow('offline');
    expect(await retry()).toBe('ok');
  });
});
