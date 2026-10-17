// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionExpiry } from '../useSessionExpiry';
import { AUTH_SESSION_EXPIRY_KEY, AUTH_SESSION_START_KEY, clearAuthUser, getAuthSessionToken, getSessionRemainingMs,
  isSessionExpired, refreshSession, saveAuthUser, SESSION_DURATION_MS, updateStoredAuthUser } from '../../services/authService';
import { LoginScreen } from '../../components/LoginScreen';

const account = { username: 'ana', name: 'Ana', role: 'Coordinador', initials: 'A', avatarColor: 'blue' };
vi.mock('../useLoginAccounts', () => ({ useLoginAccounts: () => ({ users: [account], loading: false, error: null, retry: vi.fn() }) }));
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
  clearAuthUser(); localStorage.clear(); sessionStorage.clear();
});
afterEach(() => { cleanup(); clearAuthUser(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('automatically clears credentials and requires selecting an account again at the exact deadline', () => {
  saveAuthUser(account);
  localStorage.setItem('espacios_auth_token_v2', 'test.token'); sessionStorage.setItem('espacios_auth_token_v2', 'test.token');
  function Access() {
    const [active, setActive] = useState(true);
    useSessionExpiry(active, () => { clearAuthUser(); setActive(false); });
    return active ? <p>Agenda</p> : <LoginScreen sessionExpired onLoginSuccess={vi.fn()} />;
  }
  render(<Access />);
  act(() => vi.advanceTimersByTime(SESSION_DURATION_MS - 1));
  expect(screen.getByText('Agenda')).toBeTruthy();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByText('Agenda')).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('Tu sesión venció');
  expect(screen.getByRole('button', { name: 'Ana' }).getAttribute('aria-pressed')).toBe('false');
  expect((screen.getByLabelText(/^2\./) as HTMLInputElement).disabled).toBe(true);
  expect(getAuthSessionToken()).toBe('');
});

it.each(['focus', 'pageshow', 'visibilitychange', 'storage'])('checks immediately on %s after a suspended tab resumes', event => {
  saveAuthUser(account);
  const expire = vi.fn();
  renderHook(() => useSessionExpiry(true, expire));
  vi.setSystemTime(Date.now() + SESSION_DURATION_MS);
  act(() => (event === 'visibilitychange' ? document : window).dispatchEvent(new Event(event)));
  expect(expire).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(SESSION_DURATION_MS));
  expect(expire).toHaveBeenCalledOnce();
});

it('reschedules the deadline after explicit renewal and does not extend it for permission updates', async () => {
  saveAuthUser(account);
  const expire = vi.fn(); renderHook(() => useSessionExpiry(true, expire));
  act(() => vi.advanceTimersByTime(30 * 60_000));
  updateStoredAuthUser({ ...account, name: 'Ana actualizada' });
  expect(getSessionRemainingMs()).toBe(30 * 60_000);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, user: account, token: 'renewed.token', expiresAt: Date.now() + SESSION_DURATION_MS }) }));
  await act(async () => { await refreshSession(); });
  act(() => vi.advanceTimersByTime(30 * 60_000));
  expect(expire).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(30 * 60_000));
  expect(expire).toHaveBeenCalledOnce();
});

it('honors the absolute ceiling and rejects invalid deadlines', () => {
  saveAuthUser(account);
  localStorage.setItem(AUTH_SESSION_START_KEY, String(Date.now() - 12 * SESSION_DURATION_MS + 1000));
  expect(getSessionRemainingMs()).toBe(1000);
  act(() => vi.advanceTimersByTime(1000));
  expect(isSessionExpired()).toBe(true);
  for (const invalid of ['Infinity', 'NaN', '123junk', '']) {
    localStorage.setItem(AUTH_SESSION_EXPIRY_KEY, invalid);
    expect(isSessionExpired()).toBe(true);
  }
});

it('does not report a successful renewal after expiry and removes listeners on unmount', async () => {
  saveAuthUser(account, 60_000);
  const expire = vi.fn(); const { unmount } = renderHook(() => useSessionExpiry(true, expire));
  unmount();
  act(() => vi.advanceTimersByTime(60_000));
  fireEvent.focus(window);
  expect(expire).not.toHaveBeenCalled();
  await expect(refreshSession()).rejects.toThrow('La sesión venció');
});

it('discards a late renewal response after logout', async () => {
  saveAuthUser(account);
  localStorage.setItem('espacios_auth_token_v2', 'original.token');
  let respond!: (response: unknown) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { respond = resolve; })));
  const renewal = refreshSession();
  clearAuthUser();
  respond({ ok: true, json: async () => ({ success: true, user: account, token: 'late.token', expiresAt: Date.now() + SESSION_DURATION_MS }) });
  await expect(renewal).rejects.toThrow('La sesión venció');
  expect(getAuthSessionToken()).toBe('');
  expect(isSessionExpired()).toBe(true);
});
