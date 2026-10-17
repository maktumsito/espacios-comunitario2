// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionExpiry } from '../useSessionExpiry';
import { AUTH_SESSION_EXPIRY_KEY, AUTH_SESSION_START_KEY, clearAuthUser, getAuthSessionToken, getSessionRemainingMs,
  AUTH_SESSION_STORAGE_KEY, getStoredAuthUser, isSessionExpired, refreshSession, saveAuthUser, SESSION_DURATION_MS, updateStoredAuthUser } from '../../services/authService';
import { AUTH_SESSION_ID_KEY, SESSION_CREDENTIAL_STORAGE_KEY } from '../../services/browserSession';
import { sessionToken } from '../../firebase/gateway';
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

function externalLogin(username = 'beatriz') {
  const user = { ...account, username, name: username };
  localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(user));
  localStorage.setItem(AUTH_SESSION_START_KEY, String(Date.now()));
  localStorage.setItem(AUTH_SESSION_EXPIRY_KEY, String(Date.now() + SESSION_DURATION_MS));
  localStorage.setItem(AUTH_SESSION_ID_KEY, 'new-login');
  const identity = JSON.stringify([username, String(Date.now()), 'new-login']);
  localStorage.setItem(SESSION_CREDENTIAL_STORAGE_KEY, JSON.stringify({ identity, token: 'new.token' }));
  localStorage.setItem('espacios_auth_token_v2', 'new.token');
}

it.each(['beatriz', 'ana'])('requires selecting an account after another tab starts a new login for %s, without clearing that login', username => {
  saveAuthUser(account, SESSION_DURATION_MS, { token: 'original.token' });
  sessionStorage.setItem('espacios_auth_token_v2', 'stale.token');
  const expire = vi.fn(() => clearAuthUser());
  renderHook(() => useSessionExpiry(true, expire));
  externalLogin(username);
  // Requests are blocked even before the storage event reaches the UI.
  expect(getAuthSessionToken()).toBe('');
  expect(sessionToken()).toBe('');
  expect(getStoredAuthUser()).toBeNull();
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: AUTH_SESSION_ID_KEY })));
  expect(expire).toHaveBeenCalledExactlyOnceWith('changed');
  expect(JSON.parse(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)!).username).toBe(username);
  expect(localStorage.getItem('espacios_auth_token_v2')).toBe('new.token');
  expect(sessionStorage.getItem('espacios_auth_token_v2')).toBeNull();
  expect(getAuthSessionToken()).toBe('');
});

it('uses a renewal from another tab without preferring a stale per-tab token or resetting the account', () => {
  saveAuthUser(account, SESSION_DURATION_MS, { token: 'original.token' });
  const expire = vi.fn(); renderHook(() => useSessionExpiry(true, expire));
  act(() => vi.advanceTimersByTime(30 * 60_000));
  sessionStorage.setItem('espacios_auth_token_v2', 'stale.token');
  const credential = JSON.parse(localStorage.getItem(SESSION_CREDENTIAL_STORAGE_KEY)!);
  localStorage.setItem(SESSION_CREDENTIAL_STORAGE_KEY, JSON.stringify({ ...credential, token: 'renewed.token' }));
  localStorage.setItem(AUTH_SESSION_EXPIRY_KEY, String(Date.now() + SESSION_DURATION_MS));
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: AUTH_SESSION_EXPIRY_KEY })));
  expect(getAuthSessionToken()).toBe('renewed.token');
  expect(sessionToken()).toBe('renewed.token');
  act(() => vi.advanceTimersByTime(30 * 60_000));
  expect(expire).not.toHaveBeenCalled();
  expect(getStoredAuthUser()?.username).toBe('ana');
  act(() => vi.advanceTimersByTime(30 * 60_000));
  expect(expire).toHaveBeenCalledExactlyOnceWith('expired');
});

it('closes the tab when another tab logs out and requires a fresh selection', () => {
  saveAuthUser(account, SESSION_DURATION_MS, { token: 'original.token' });
  const expire = vi.fn(); renderHook(() => useSessionExpiry(true, expire));
  localStorage.clear();
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })));
  expect(expire).toHaveBeenCalledExactlyOnceWith('changed');
  expect(getAuthSessionToken()).toBe('');
});

it('ignores a late renewal for the old account after a login in another tab', async () => {
  saveAuthUser(account, SESSION_DURATION_MS, { token: 'original.token' });
  let respond!: (response: unknown) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { respond = resolve; })));
  const renewal = refreshSession();
  externalLogin();
  respond({ ok: true, json: async () => ({ success: true, user: account, token: 'late.token' }) });
  await expect(renewal).rejects.toThrow();
  expect(localStorage.getItem('espacios_auth_token_v2')).toBe('new.token');
  expect(JSON.parse(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)!).username).toBe('beatriz');
});
