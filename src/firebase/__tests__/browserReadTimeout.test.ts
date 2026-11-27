// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { dataRequest } from '../gateway.browser';
import { bindBrowserSession, releaseBrowserSession } from '../../services/browserSession';
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.setItem('espacios_auth_user', JSON.stringify({ username: 'test' }));
  localStorage.setItem('espacios_auth_token_v2', 'synthetic-session');
  bindBrowserSession();
});
afterEach(() => { localStorage.clear(); releaseBrowserSession(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('bounds the response body read as well as the initial fetch at thirty seconds', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_path, options) => ({ ok: true, status: 200,
    text: () => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted')))) })));
  const result = expect(dataRequest('/api/data/listen-batch', { queries: [] })).rejects.toMatchObject({ code: 'deadline-exceeded', status: 504 });
  await vi.advanceTimersByTimeAsync(30_000);
  await result;
});
