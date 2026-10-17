import { readBrowserSessionToken } from './browserSession';

export interface GmailServerStatus {
  connected: boolean;
  persistent: boolean;
  oauthConfigured: boolean;
  email: string;
}

export async function gmailServerRequest(path: string, body?: unknown): Promise<any> {
  const token = readBrowserSessionToken();
  const response = await fetch(`/api/email/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo conectar con el servidor de correo.');
  return data;
}

export function waitForGmailPopup(popup: Window): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      window.removeEventListener('message', receive);
      clearInterval(closed);
      clearTimeout(timeout);
      if (!popup.closed) popup.close();
      error ? reject(error) : resolve();
    };
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== popup || event.data?.type !== 'gmail-oauth-complete') return;
      finish(event.data.success ? undefined : new Error('No se pudo autorizar Gmail. Verifica la cuenta y acepta el permiso de envío.'));
    };
    const closed = setInterval(() => { if (popup.closed) finish(new Error('Se cerró la conexión de Google antes de completarla.')); }, 500);
    const timeout = setTimeout(() => finish(new Error('La conexión de Google venció. Intenta nuevamente.')), 10 * 60_000);
    window.addEventListener('message', receive);
  });
}
