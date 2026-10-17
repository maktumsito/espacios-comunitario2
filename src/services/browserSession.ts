// A tab stays bound to the login it opened. Shared credentials must never be
// used with the previous account's UI while a storage event is still pending.
export const SESSION_TOKEN_STORAGE_KEY = 'espacios_auth_token_v2';
export const AUTH_SESSION_ID_KEY = 'espacios_auth_session_id_v1';
export const SESSION_CREDENTIAL_STORAGE_KEY = 'espacios_auth_credential_v1';
let boundIdentity: string | null | undefined;

function sharedIdentity(): string | null {
  try {
    const user = JSON.parse(localStorage.getItem('espacios_auth_user') || 'null');
    if (typeof user?.username !== 'string') return null;
    return JSON.stringify([user.username, localStorage.getItem('espacios_auth_session_start_v1'),
      localStorage.getItem(AUTH_SESSION_ID_KEY)]);
  } catch {
    return null;
  }
}

export function bindBrowserSession(): void {
  boundIdentity = sharedIdentity();
}

export function hasBrowserSessionChanged(): boolean {
  if (boundIdentity === undefined) bindBrowserSession();
  return boundIdentity !== sharedIdentity();
}

export function releaseBrowserSession(): void {
  boundIdentity = null;
  try { sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY); } catch { /* Storage may be disabled. */ }
}

export function storeBrowserSessionToken(token: string): void {
  if (hasBrowserSessionChanged() || !boundIdentity) throw new Error('La sesión cambió. Inicia sesión nuevamente.');
  localStorage.setItem(SESSION_CREDENTIAL_STORAGE_KEY, JSON.stringify({ identity: boundIdentity, token }));
  localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
}

export function readBrowserSessionToken(): string {
  if (typeof localStorage === 'undefined' || hasBrowserSessionChanged() || !boundIdentity) return '';
  try {
    // Renewals in another tab replace the shared token. Never prefer a stale
    // sessionStorage or in-memory copy over the current shared credential.
    const credential = localStorage.getItem(SESSION_CREDENTIAL_STORAGE_KEY);
    if (credential) {
      const parsed = JSON.parse(credential);
      return parsed.identity === boundIdentity && typeof parsed.token === 'string' ? parsed.token : '';
    }
    // Sessions opened before this update can keep working until their deadline.
    return localStorage.getItem(SESSION_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}
