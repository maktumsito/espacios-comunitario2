import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Request } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GmailConnection, type GmailConnectionOptions } from '../gmailConnection';

const email = 'cristianshute@gmail.com';
const options = (): GmailConnectionOptions => {
  let encrypted: string | null = null;
  return {
    sender: email, clientId: 'client-id', clientSecret: 'test-secret', redirectUri: 'https://app.example/api/email/gmail/callback',
    store: { read: async () => encrypted, write: async value => { encrypted = value; } }, fetch: vi.fn()
  };
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

async function withRoutes(connection: GmailConnection, run: (base: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  connection.register(app, (_req, _res, next) => next());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

describe('Gmail server authorization', () => {
  it('shares credential reads across browsers, caches absence, and revalidates after 60 seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const config = options();
    const read = vi.spyOn(config.store, 'read');
    const connection = new GmailConnection(config);
    const req = { headers: {} } as Request;
    await Promise.all(Array.from({ length: 50 }, () => connection.status(req)));
    expect(read).toHaveBeenCalledTimes(1);
    await connection.status(req);
    expect(read).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    await config.store.write(connection.seal({ email, accessToken: 'valid', refreshToken: 'refresh', expiresAt: Date.now() + 3600_000 }));
    expect((await connection.status(req)).persistent).toBe(true);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('does not cache failed credential reads as a disconnected state', async () => {
    const config = options();
    const read = vi.spyOn(config.store, 'read').mockRejectedValueOnce(new Error('offline'));
    const connection = new GmailConnection(config);
    await expect(connection.status({ headers: {} } as Request)).rejects.toThrow('offline');
    expect((await connection.status({ headers: {} } as Request)).persistent).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('does not treat an unverified SMTP password as an OAuth authorization', async () => {
    vi.stubEnv('SMTP_PASS', 'unverified-password');
    vi.stubEnv('SMTP_USER', email);
    expect(await new GmailConnection(options()).status({ headers: {} } as Request))
      .toMatchObject({ connected: false, persistent: false, oauthConfigured: true });
  });

  it('recovers encrypted credentials after a server restart and renews expired tokens once for concurrent sends', async () => {
    const config = options();
    const original = new GmailConnection(config);
    await config.store.write(original.seal({ email, accessToken: 'expired-access', expiresAt: 1, refreshToken: 'permanent-refresh' }));
    expect(await config.store.read()).not.toContain('permanent-refresh');
    vi.mocked(config.fetch!).mockResolvedValue(json({ access_token: 'renewed-access', expires_in: 3600 }));
    const restarted = new GmailConnection(config);
    expect(await Promise.all([restarted.getAccessToken(), restarted.getAccessToken()])).toEqual(['renewed-access', 'renewed-access']);
    expect(config.fetch).toHaveBeenCalledOnce();
    expect(String(vi.mocked(config.fetch!).mock.calls[0][1]?.body)).toContain('grant_type=refresh_token');
    expect(await new GmailConnection(config).getAccessToken()).toBe('renewed-access');
    expect(config.fetch).toHaveBeenCalledOnce();
  });

  it('handles a revoked refresh token without leaving a false connected state', async () => {
    const config = options();
    const connection = new GmailConnection(config);
    await config.store.write(connection.seal({ email, accessToken: 'expired', expiresAt: 1, refreshToken: 'revoked' }));
    vi.mocked(config.fetch!).mockResolvedValue(json({ error: 'invalid_grant' }, 400));
    await expect(connection.getAccessToken()).rejects.toThrow('revocada');
    expect(await config.store.read()).toBeNull();
    expect((await connection.status({ headers: {} } as Request)).connected).toBe(false);
  });

  it('preserves credentials on temporary Google failures so recovery can be retried', async () => {
    const config = options();
    const connection = new GmailConnection(config);
    await config.store.write(connection.seal({ email, accessToken: 'expired', expiresAt: 1, refreshToken: 'valid-refresh' }));
    vi.mocked(config.fetch!).mockResolvedValueOnce(json({ error: 'temporarily_unavailable' }, 503)).mockResolvedValueOnce(json({ access_token: 'recovered', expires_in: 3600 }));
    await expect(connection.getAccessToken()).rejects.toThrow();
    expect(await config.store.read()).not.toBeNull();
    expect(await connection.getAccessToken()).toBe('recovered');
  });

  it('rejects ciphertext tampering and does not decrypt credentials under a different key', () => {
    const connection = new GmailConnection(options());
    const sealed = connection.seal({ refreshToken: 'secret' });
    expect(connection.unseal(sealed)).toEqual({ refreshToken: 'secret' });
    const bytes = Buffer.from(sealed, 'base64url'); bytes[30] ^= 1;
    expect(connection.unseal(bytes.toString('base64url'))).toBeNull();
    expect(new GmailConnection({ ...options(), clientSecret: 'different-secret' }).unseal(sealed)).toBeNull();
  });

  it('requests offline access and PKCE, rejects forged callbacks, and keeps refresh tokens out of browser responses', async () => {
    const config = { ...options(), redirectUri: 'http://localhost/api/email/gmail/callback' };
    const connection = new GmailConnection(config);
    vi.mocked(config.fetch!).mockResolvedValueOnce(json({ access_token: 'google-access', refresh_token: 'google-refresh', expires_in: 3600, scope: 'openid email https://www.googleapis.com/auth/gmail.send' })).mockResolvedValueOnce(json({ email, email_verified: true }));
    await withRoutes(connection, async base => {
      const start = await fetch(base + '/api/email/gmail/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const { url } = await start.json();
      const params = new URL(url).searchParams;
      expect(params.get('access_type')).toBe('offline');
      expect(params.get('code_challenge_method')).toBe('S256');
      const cookie = start.headers.get('set-cookie')!.split(';')[0];
      const forged = await fetch(base + '/api/email/gmail/callback?state=forged&code=test-code', { headers: { Cookie: cookie } });
      expect(forged.status).toBe(400);
      expect(config.fetch).not.toHaveBeenCalled();
      const result = await fetch(base + '/api/email/gmail/callback?state=' + params.get('state') + '&code=test-code', { headers: { Cookie: cookie } });
      const html = await result.text();
      expect(html).toContain('success:true');
      expect(html).not.toContain('google-refresh');
      expect(html).not.toContain('google-access');
      expect(result.headers.get('set-cookie')).toContain('HttpOnly');
      expect(await connection.getAccessToken()).toBe('google-access');
    });
  });

  it('recovers a temporary Firebase session after page reload and expires it accurately', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T15:00:00Z'));
    const config = { ...options(), clientId: undefined, clientSecret: undefined, redirectUri: undefined, encryptionSecret: 'stable-server-key' };
    vi.mocked(config.fetch!).mockResolvedValue(json({ email, email_verified: true }));
    const connection = new GmailConnection(config);
    await withRoutes(connection, async base => {
      const result = await fetch(base + '/api/email/gmail/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: 'firebase-google-token' }) });
      expect(result.status).toBe(200);
      const cookie = result.headers.get('set-cookie')!.split(';')[0];
      expect(cookie).not.toContain('firebase-google-token');
      const reloaded = new GmailConnection(config);
      const req = { headers: { cookie } } as Request;
      expect(reloaded.sessionAccessToken(req)).toBe('firebase-google-token');
      expect(await reloaded.status(req)).toMatchObject({ connected: true, persistent: false });
      vi.setSystemTime(new Date('2026-10-01T16:00:00Z'));
      expect(reloaded.sessionAccessToken(req)).toBeNull();
      expect(await reloaded.status(req)).toMatchObject({ connected: false });
    });
  });

  it('rejects authorization from another account and prevents cross-origin changes', async () => {
    const config = options();
    vi.mocked(config.fetch!).mockResolvedValue(json({ email: 'other@example.com', email_verified: true }));
    await withRoutes(new GmailConnection(config), async base => {
      const rejected = await fetch(base + '/api/email/gmail/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: 'wrong-account-token' }) });
      expect(rejected.status).toBe(401);
      expect(rejected.headers.get('set-cookie')).toBeNull();
      const crossOrigin = await fetch(base + '/api/email/gmail/connect', { method: 'POST', headers: { Origin: 'https://other.example' } });
      expect(crossOrigin.status).toBe(403);
    });
  });
});
