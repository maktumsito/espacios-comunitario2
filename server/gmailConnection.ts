import crypto from 'node:crypto';
import type { Express, Request, Response, RequestHandler } from 'express';

const SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const SESSION_COOKIE = 'diaguitas_gmail';
const STATE_COOKIE = 'diaguitas_gmail_state';
type Credential = { accessToken: string; expiresAt: number; refreshToken?: string; email: string };
export interface GmailCredentialStore {
  read(): Promise<string | null>;
  write(value: string | null): Promise<void>;
}
export interface GmailConnectionOptions {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  encryptionSecret?: string;
  sender: string;
  store: GmailCredentialStore;
  fetch?: typeof fetch;
}

/** Tokens remain on the server or in authenticated, encrypted HttpOnly cookies. */
export class GmailConnection {
  private key: Buffer;
  private fetch: typeof fetch;
  private pendingRefresh: Promise<Credential | null> | null = null;
  private credentialCache?: { value: Credential | null; expiresAt: number };
  private pendingCredential: Promise<Credential | null> | null = null;
  private credentialGeneration = 0;
  readonly oauthConfigured: boolean;

  constructor(private options: GmailConnectionOptions) {
    this.key = crypto.createHash('sha256').update(options.encryptionSecret || options.clientSecret || crypto.randomBytes(32)).digest();
    this.fetch = options.fetch || fetch;
    this.oauthConfigured = Boolean(options.clientId && options.clientSecret && options.redirectUri);
  }

  seal(value: unknown): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
  }

  unseal<T>(value: string): T | null {
    try {
      const bytes = Buffer.from(value, 'base64url');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
    } catch { return null; }
  }

  private cookie<T>(req: Request, name: string): T | null {
    const value = req.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith(name + '='))?.slice(name.length + 1);
    return value ? this.unseal<T>(value) : null;
  }

  private setCookie(res: Response, name: string, value: unknown, maxAge: number) {
    res.cookie(name, this.seal(value), { httpOnly: true, sameSite: 'lax', secure: this.options.redirectUri?.startsWith('https:') || process.env.NODE_ENV === 'production', path: '/api/email', maxAge });
  }

  private async storedCredential(): Promise<Credential | null> {
    if (!this.oauthConfigured) return null;
    if (this.credentialCache && this.credentialCache.expiresAt > Date.now()) return this.credentialCache.value;
    if (this.pendingCredential) return this.pendingCredential;
    const generation = this.credentialGeneration;
    const request = (async () => {
      const encrypted = await this.options.store.read();
      const credential = encrypted ? this.unseal<Credential>(encrypted) : null;
      const value = credential?.email === this.options.sender && credential.refreshToken ? credential : null;
      if (generation !== this.credentialGeneration) return this.storedCredential();
      this.credentialCache = { value, expiresAt: Date.now() + 60_000 };
      return value;
    })();
    this.pendingCredential = request;
    try { return await request; }
    finally { if (this.pendingCredential === request) this.pendingCredential = null; }
  }

  private async writeCredential(value: Credential | null): Promise<void> {
    await this.options.store.write(value ? this.seal(value) : null);
    this.credentialGeneration++;
    this.pendingCredential = null;
    this.credentialCache = { value, expiresAt: Date.now() + 60_000 };
  }

  private async tokenExchange(parameters: Record<string, string>): Promise<Record<string, any>> {
    const response = await this.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...parameters, client_id: this.options.clientId!, client_secret: this.options.clientSecret! })
    });
    const data = await response.json();
    if (!response.ok) {
      if (data.error === 'invalid_grant' && parameters.grant_type === 'refresh_token') await this.writeCredential(null);
      const error = new Error(data.error === 'invalid_grant' ? 'La autorización de Google fue revocada o venció. Vuelve a conectar la cuenta.' : 'Google no pudo renovar la autorización de correo. Intenta nuevamente.');
      if (data.error === 'invalid_grant') error.name = 'GmailAuthorizationExpired';
      throw error;
    }
    if (!data.access_token || !(Number(data.expires_in) > 0)) throw new Error('Google devolvió una autorización incompleta.');
    return data;
  }

  private async verifySender(accessToken: string): Promise<string> {
    const response = await this.fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await response.json();
    if (!response.ok || data.email !== this.options.sender || data.email_verified !== true) {
      throw new Error(`Conecta la cuenta emisora oficial ${this.options.sender}.`);
    }
    return data.email;
  }

  async getAccessToken(forceRefresh = false): Promise<string | null> {
    if (!this.oauthConfigured) return null;
    if (this.pendingRefresh) return (await this.pendingRefresh)?.accessToken || null;
    this.pendingRefresh = (async () => {
      const credential = await this.storedCredential();
      if (!credential) return null;
      if (!forceRefresh && credential.expiresAt > Date.now() + 60_000) return credential;
      const data = await this.tokenExchange({ grant_type: 'refresh_token', refresh_token: credential.refreshToken! });
      const updated = { ...credential, accessToken: data.access_token, expiresAt: Date.now() + Number(data.expires_in) * 1000, refreshToken: data.refresh_token || credential.refreshToken };
      await this.writeCredential(updated);
      return updated;
    })();
    try { return (await this.pendingRefresh)?.accessToken || null; }
    finally { this.pendingRefresh = null; }
  }

  sessionAccessToken(req: Request): string | null {
    const session = this.cookie<Credential>(req, SESSION_COOKIE);
    return session?.email === this.options.sender && session.expiresAt > Date.now() ? session.accessToken || null : null;
  }

  clearSession(res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/api/email' });
  }

  async status(req: Request) {
    const persistent = Boolean(await this.storedCredential());
    const temporary = Boolean(this.sessionAccessToken(req));
    return { connected: persistent || temporary, persistent, oauthConfigured: this.oauthConfigured, email: this.options.sender };
  }

  private sameOrigin(req: Request): boolean {
    const origin = req.headers.origin;
    if (!origin) return true; // Non-browser authenticated API clients.
    const expected = this.options.redirectUri ? new URL(this.options.redirectUri).origin : `${req.protocol}://${req.get('host')}`;
    return origin === expected;
  }

  register(app: Express, requireAuth: RequestHandler) {
    app.use('/api/email/gmail', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    app.get('/api/email/gmail/status', async (req, res) => {
      try { res.json(await this.status(req)); }
      catch { res.status(503).json({ error: 'No se pudo comprobar la conexión de Gmail. Intenta nuevamente.' }); }
    });
    app.post('/api/email/gmail/session', requireAuth, async (req, res) => {
      if (!this.sameOrigin(req)) return res.sendStatus(403);
      try {
        if (typeof req.body.accessToken !== 'string') return res.sendStatus(400);
        const email = await this.verifySender(req.body.accessToken);
        // Compatibility with Firebase's short-lived Google token; never store it in web storage.
        const maxAge = 55 * 60_000;
        this.setCookie(res, SESSION_COOKIE, { email, accessToken: req.body.accessToken, expiresAt: Date.now() + maxAge }, maxAge);
        res.json({ success: true, persistent: false });
      } catch (error) { res.status(401).json({ error: (error as Error).message }); }
    });
    app.post('/api/email/gmail/connect', requireAuth, (req, res) => {
      if (!this.sameOrigin(req)) return res.sendStatus(403);
      if (!this.oauthConfigured) return res.status(503).json({ error: 'Falta configurar GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET y GMAIL_OAUTH_REDIRECT_URI en el servidor.' });
      const state = crypto.randomBytes(32).toString('base64url');
      const verifier = crypto.randomBytes(32).toString('base64url');
      this.setCookie(res, STATE_COOKIE, { state, verifier, expiresAt: Date.now() + 10 * 60_000 }, 10 * 60_000);
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id: this.options.clientId!, redirect_uri: this.options.redirectUri!, response_type: 'code', scope: `openid email ${SEND_SCOPE}`, access_type: 'offline', prompt: 'consent', login_hint: this.options.sender, state, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
      res.json({ url: url.toString() });
    });
    app.get('/api/email/gmail/callback', async (req, res) => {
      const authorization = this.cookie<{ state: string; verifier: string; expiresAt: number }>(req, STATE_COOKIE);
      res.clearCookie(STATE_COOKIE, { path: '/api/email' });
      if (!this.oauthConfigured || !authorization || authorization.expiresAt <= Date.now() || req.query.state !== authorization.state) {
        return res.status(400).send('La solicitud de conexión venció o no es válida. Vuelve a conectar desde la aplicación.');
      }
      let success = false;
      try {
        if (req.query.error || typeof req.query.code !== 'string') throw new Error('Google no autorizó la conexión.');
        const data = await this.tokenExchange({ grant_type: 'authorization_code', code: req.query.code, redirect_uri: this.options.redirectUri!, code_verifier: authorization.verifier });
        if (!String(data.scope || '').split(' ').includes(SEND_SCOPE)) throw new Error('Falta autorizar el envío de Gmail.');
        const email = await this.verifySender(data.access_token);
        const previous = await this.storedCredential();
        const credential = { email, accessToken: data.access_token, refreshToken: data.refresh_token || previous?.refreshToken, expiresAt: Date.now() + Number(data.expires_in) * 1000 };
        if (!credential.refreshToken) throw new Error('Google no entregó autorización permanente. Vuelve a conectar y acepta el permiso.');
        await this.writeCredential(credential);
        this.setCookie(res, SESSION_COOKIE, { email, manager: true, expiresAt: Date.now() + 30 * 24 * 3600_000 }, 30 * 24 * 3600_000);
        success = true;
      } catch { /* Do not expose authorization codes or token exchange responses in logs or HTML. */ }
      const origin = new URL(this.options.redirectUri!).origin;
      res.set('Cache-Control', 'no-store').type('html').send(`<!doctype html><meta charset="utf-8"><p>${success ? 'Gmail conectado. Puedes cerrar esta ventana.' : 'No se pudo conectar Gmail. Verifica la cuenta y los permisos, e intenta nuevamente.'}</p><script>if(window.opener){window.opener.postMessage({type:'gmail-oauth-complete',success:${success}},${JSON.stringify(origin)});window.close();}</script>`);
    });
    app.post('/api/email/gmail/disconnect', requireAuth, async (req, res) => {
      if (!this.sameOrigin(req)) return res.sendStatus(403);
      try {
        const session = this.cookie<{ manager?: boolean; email?: string; expiresAt: number }>(req, SESSION_COOKIE);
        if (await this.storedCredential()) {
          if (!session?.manager || session.email !== this.options.sender || session.expiresAt <= Date.now()) return res.status(403).json({ error: 'Desconecta la cuenta desde el navegador donde autorizaste la conexión permanente.' });
          await this.writeCredential(null);
        }
        res.clearCookie(SESSION_COOKIE, { path: '/api/email' });
        res.json({ success: true });
      } catch { res.status(503).json({ error: 'No se pudo desconectar Gmail. Intenta nuevamente.' }); }
    });
  }
}
