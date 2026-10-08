import crypto from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { AppSessions, requireReservationWriter } from '../appSession';
import type { UserAccount } from '../../src/services/authService';

const account = { username: 'reader', role: 'Auxiliar', email: 'reader@example.com',
  passwordHash: 'scrypt$'+'01'.repeat(16)+'$'+crypto.scryptSync('password','01'.repeat(16),64).toString('hex'),
  canCreateReservations: false, canEditReservations: false, canDeleteReservations: false } as UserAccount;
afterEach(() => vi.useRealTimers());
async function withSession(run: (base: string, read: ReturnType<typeof vi.fn>) => Promise<void>, google?: (token: string) => Promise<string | null>) {
  const read = vi.fn(async () => account);
  const sessions = new AppSessions(read, 'test-session-key-at-least-32-characters', google);
  const app = express(); app.use(express.json()); sessions.register(app);
  app.get('/protected', sessions.requireAuth, (req, res) => res.json((req as any).user));
  app.post('/write', sessions.requireAuth, requireReservationWriter, (_req, res) => res.json({ success: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, read); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
const login = async (base: string, password = 'password') => {
  const response = await fetch(`${base}/api/auth/session`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'reader', password, role: 'Administrador' }) });
  return { status: response.status, ...await response.json() };
};

it('rejects legacy client tokens and tampering, and never treats a password hash as the password', async () => {
  await withSession(async base => {
    const forged = Buffer.from(JSON.stringify({ u: 'reader', r: 'Administrador', t: Date.now() })).toString('base64');
    for (const token of [forged, 'arbitrary-long-token-with-more-than-20-characters']) {
      expect((await fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(401);
    }
    expect((await login(base, account.passwordHash)).status).toBe(401);
    const session = await login(base);
    expect(session.user).not.toHaveProperty('passwordHash');
    expect((await fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${session.token}tampered` } })).status).toBe(401);
    expect((await fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${session.token}` } })).status).toBe(200);
    expect((await fetch(`${base}/write`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}` } })).status).toBe(403);
  });
});

it('deduplicates account reads, rechecks revocation and expires sessions', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  await withSession(async (base, read) => {
    const session = await login(base);
    read.mockImplementation(async () => { await new Promise(resolve => setTimeout(resolve, 30)); return account; });
    await Promise.all(Array.from({ length: 6 }, () => fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${session.token}` } })));
    expect(read).toHaveBeenCalledTimes(2);
    read.mockResolvedValueOnce(null as any);
    expect((await fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${session.token}` } })).status).toBe(401);
    vi.advanceTimersByTime(60 * 60_000);
    expect((await fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${session.token}` } })).status).toBe(401);
    expect(read).toHaveBeenCalledTimes(3);
  });
});

it('limits repeated failed passwords on the server', async () => {
  await withSession(async base => {
    for (let count = 0; count < 5; count++) expect((await login(base, 'wrong')).status).toBe(401);
    expect((await login(base)).status).toBe(429);
  });
});

it('renews a verified session without extending its absolute twelve-hour ceiling', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  await withSession(async base => {
    let { token } = await login(base);
    let expiresAt = 0;
    for (let count = 0; count < 14; count++) {
      vi.advanceTimersByTime(50 * 60_000);
      const response = await fetch(`${base}/api/auth/session/refresh`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      expect(response.status).toBe(200);
      ({ token, expiresAt } = await response.json());
    }
    expect(expiresAt - Date.now()).toBe(20 * 60_000);
    vi.advanceTimersByTime(21 * 60_000);
    expect((await fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(401);
  });
});

it('issues Google sessions only for verified identities with the registered exact email', async () => {
  const verify = vi.fn().mockResolvedValueOnce('attacker@example.com').mockResolvedValueOnce('reader@example.com');
  await withSession(async base => {
    const request = () => fetch(`${base}/api/auth/google-session`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'reader', idToken: 'verified-by-provider' }) });
    expect((await request()).status).toBe(403);
    const confirmed = await (await request()).json();
    expect(confirmed.user.canEditReservations).toBe(false);
    expect(confirmed.user).not.toHaveProperty('passwordHash');
    expect(confirmed.token).toContain('.');
  }, verify);
});
