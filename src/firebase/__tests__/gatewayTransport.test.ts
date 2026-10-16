// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { dataRequest, reservationRequest } from '../gateway';

beforeEach(() => localStorage.setItem('espacios_auth_token_v2', 'synthetic-test-session'));
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

it('does not broadcast a data change for a batch read and start a self-triggered refresh loop', async () => {
  const changed = vi.fn(); window.addEventListener('data-changed', changed);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, results: [] }) }));
  await dataRequest('/api/data/listen-batch', { queries: [] });
  expect(changed).not.toHaveBeenCalled();
  window.removeEventListener('data-changed', changed);
});

it('keeps the quota error code and retry delay on protected data reads and deletion requests', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({ ok: false, status: 503,
    headers: new Headers({ 'Retry-After': '60' }),
    json: async () => ({ error: 'Firestore alcanzó su cuota de uso.', code: 'auth-backend-quota-exceeded' }) })));
  for (const request of [() => dataRequest('/api/data/listen-batch', { queries: [] }),
    () => reservationRequest({ reservations: [], options: { deletedIds: ['yoga-test'] } }, async () => {})]) {
    await expect(request()).rejects.toMatchObject({ status: 503, code: 'auth-backend-quota-exceeded', retryAfterMs: 60_000 });
  }
});
