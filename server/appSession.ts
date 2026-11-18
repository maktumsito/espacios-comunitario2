import crypto from 'node:crypto';
import type { Express, RequestHandler, Response } from 'express';
import type { AuthUser, UserAccount, LoginAccount } from '../src/services/authService';
import { publicProfile,verifyPassword, verifyLegacyPassword } from './passwords';
import { reservationPermission, reservationPermissionKeys } from '../src/utils/userPermissions';

const SESSION_MS = 60 * 60_000;
const sessionCookie = '__Host-espacios_session';
interface SessionRevocations {
  check: (id: string) => Promise<boolean>;
  revoke: (id: string, expiresAt: number) => Promise<void>;
}

function accountReadFailure(error: unknown) {
  const code = String((error as any)?.code ?? '').toLowerCase().replace(/_/g, '-');
  if (['8', 'resource-exhausted', '429'].includes(code)) return {
    code: 'auth-backend-quota-exceeded', retryAfter: 60,
    message: 'Firestore alcanzó su cuota de uso. No se pudo verificar el acceso; la operación sigue pendiente. Reintenta cuando se restablezca la cuota.',
  };
  if (['7', 'permission-denied', '16', 'unauthenticated'].includes(code)) return {
    code: 'auth-backend-permission-denied', retryAfter: 60,
    message: 'El servidor no puede acceder a la base de usuarios. Es necesario revisar sus credenciales y permisos de Firestore. La operación sigue pendiente.',
  };
  return {
    code: 'auth-verification-unavailable', retryAfter: 10,
    message: 'No se pudo verificar el acceso porque la base de usuarios no está disponible. La operación sigue pendiente; intenta nuevamente.',
  };
}

export const requireReservationWriter: RequestHandler = (req, res, next) => {
  const user = (req as any).user as AuthUser | undefined;
  const allowed = reservationPermissionKeys.some(key => reservationPermission(user, key));
  if (!allowed) { res.status(403).json({ success: false, error: 'Esta cuenta tiene acceso de solo lectura.' }); return; }
  next();
};
const equal = (left: string, right: string) => {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/** API authorization is issued after password verification, not decoded from client claims. */
export class AppSessions {
  private key: string;
  private accounts = new Map<string, { value: UserAccount | null; expiresAt: number }>();
  private pendingAccounts = new Map<string, Promise<UserAccount | null>>();
  private accountFailures = new Map<string, { error: unknown; expiresAt: number }>();
  private attempts = new Map<string, { count: number; expiresAt: number }>();

  constructor(private readAccount: (username: string) => Promise<UserAccount | null>, secret?: string,
    private verifyGoogleToken?: (token: string) => Promise<string | null>,
    private migrateLegacyPassword?: (account: UserAccount, password: string) => Promise<UserAccount>,
    private revocations?: SessionRevocations) {
    if (secret && secret.trim().length > 0) {
      this.key = secret.length >= 32 ? secret : crypto.createHash('sha256').update(secret).digest('hex');
    } else {
      this.key = crypto.randomBytes(32).toString('base64url');
    }
  }

  async account(username: string): Promise<UserAccount | null> {
    const name = username.trim().toLowerCase();
    const cached = this.accounts.get(name);
    if (cached?.value === null && cached.expiresAt > Date.now()) return null;
    const failure = this.accountFailures.get(name);
    if (failure && failure.expiresAt > Date.now()) throw failure.error;
    const pending = this.pendingAccounts.get(name);
    if (pending) return pending;
    const request = this.readAccount(name).then(value => {
      this.accountFailures.delete(name);
      // Keep this small even when callers submit arbitrary usernames.
      if (this.accounts.size >= 100) this.accounts.delete(this.accounts.keys().next().value!);
      // Positive permissions/passwords are rechecked for every protected request.
      if (value === null) this.accounts.set(name, { value, expiresAt: Date.now() + 60_000 });
      else this.accounts.delete(name);
      return value;
    }).catch(error => {
      const failure = accountReadFailure(error);
      if (this.accountFailures.size >= 100) this.accountFailures.delete(this.accountFailures.keys().next().value!);
      this.accountFailures.set(name, { error, expiresAt: Date.now() + failure.retryAfter * 1000 });
      console.error('[Auth] Account verification read failed', { code: (error as any)?.code, message: (error as any)?.message });
      throw error;
    });
    this.pendingAccounts.set(name, request);
    try { return await request; }
    finally { this.pendingAccounts.delete(name); }
  }

  private binding(account: UserAccount): string {
    return crypto.createHmac('sha256',this.key).update(`${account.username}:${account.passwordHash}:${(account as any).sessionVersion||0}`).digest('base64url');
  }
  private issue(user: AuthUser, startedAt = Date.now(), version: string, id: string): string {
    const body = Buffer.from(JSON.stringify({ u: user.username, startedAt, v: version, sid: id,
      exp: Date.now() + SESSION_MS })).toString('base64url');
    const signature = crypto.createHmac('sha256', this.key).update(body).digest('base64url');
    return `${body}.${signature}`;
  }

  private verify(token: string): { username: string; startedAt: number; version: string; id: string; expiresAt: number } | null {
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra || token.length > 2048) return null;
    if (!equal(signature, crypto.createHmac('sha256', this.key).update(body).digest('base64url'))) return null;
    try {
      const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      return typeof claims.u === 'string' && typeof claims.v === 'string' && typeof claims.exp === 'number' && claims.exp > Date.now() &&
        typeof claims.startedAt === 'number' && claims.startedAt <= Date.now()
        ? { username: claims.u, startedAt: claims.startedAt, version: claims.v, expiresAt: claims.exp,
            id: typeof claims.sid === 'string' && /^[0-9a-f-]{36}$/.test(claims.sid) ? claims.sid :
              crypto.createHmac('sha256', this.key).update(JSON.stringify([claims.u, claims.startedAt, claims.v])).digest('hex') } : null;
    } catch { return null; }
  }

  private sendSession(res: Response, user: AuthUser, startedAt: number, version: string, id: string = crypto.randomUUID()) {
    const token = this.issue(user, startedAt, version, id);
    if (this.revocations) {
      res.cookie(sessionCookie, token, { secure: true, httpOnly: true, sameSite: 'strict', path: '/', maxAge: SESSION_MS });
    }
    res.json({ success: true, user, token: this.revocations ? `cookie.${id}` : token, expiresAt: Date.now() + SESSION_MS });
  }
  invalidateAccount(username: string) {
    const name = username.trim().toLowerCase();
    this.accounts.delete(name);
    this.accountFailures.delete(name);
  }
  acceptsAccount(token: string, account: UserAccount | null): boolean {
    const claims=this.verify(token.replace(/^Bearer\s+/i,'').trim());
    return !!claims && !!account && account.username===claims.username && equal(claims.version,this.binding(account));
  }

  readonly requireAuth: RequestHandler = async (req, res, next) => {
    const header = req.get('authorization') || req.get('x-auth-session') || '';
    const submitted = header.replace(/^Bearer\s+/i, '').trim();
    const marker = submitted.startsWith('cookie.') ? submitted.slice(7) : null;
    const cookie = marker && this.revocations && req.get('cookie')?.split(';').map(part => part.trim())
      .find(part => part.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1);
    const token = marker ? cookie || '' : submitted;
    const claims = this.verify(token);
    if (marker && req.get('sec-fetch-site') && req.get('sec-fetch-site') !== 'same-origin') {
      res.status(403).json({ success: false, error: 'Origen de la solicitud no autorizado.' }); return;
    }
    if (!claims || (marker && claims.id !== marker)) { res.status(401).json({ success: false, error: 'Sesión no válida o vencida. Inicia sesión nuevamente.' }); return; }
    try {
      const [account, revoked] = await Promise.all([this.account(claims.username), this.revocations?.check(claims.id)]);
      if (revoked) { res.status(401).json({ success: false, error: 'La sesión se cerró.' }); return; }
      if (!account || !equal(claims.version,this.binding(account))) { res.status(401).json({ success: false, error: 'La cuenta o sus credenciales cambiaron. Inicia sesión nuevamente.' }); return; }
      const {passwordHash:_password,...user}=publicProfile(account);
      (req as any).user = { ...user, u: user.username, r: user.role };
      (req as any).sessionStartedAt = claims.startedAt;
      (req as any).sessionBinding = claims.version;
      (req as any).sessionId = claims.id;
      if (marker) req.headers.authorization = `Bearer ${token}`;
      next();
    } catch (error) {
      const failure = accountReadFailure(error);
      res.set('Retry-After', String(failure.retryAfter)).status(503).json({ success: false, error: failure.message, code: failure.code });
    }
  };

  register(app: Express, readLoginAccounts?: () => Promise<LoginAccount[]>) {
    if (readLoginAccounts) app.get('/api/auth/users', async (_req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        const accounts = await readLoginAccounts();
        const users = accounts.map(({ username, name, role, initials, avatarColor }) =>
          ({ username, name, role, initials, avatarColor }));
        users.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        res.json({ success: true, users });
      } catch {
        res.status(503).json({ success: false, error: 'No se pudo cargar la lista de usuarios. Intenta nuevamente.' });
      }
    });
    app.post('/api/auth/session/refresh', this.requireAuth, (req, res) => {
      res.set('Cache-Control', 'no-store');
      const { u: _username, r: _role, ...user } = (req as any).user;
      const startedAt = (req as any).sessionStartedAt;
      this.sendSession(res, user, startedAt, (req as any).sessionBinding, (req as any).sessionId);
    });
    if (this.revocations) app.post('/api/auth/session/logout', this.requireAuth, async (req, res) => {
      try {
        await this.revocations!.revoke((req as any).sessionId, Date.now() + SESSION_MS);
        res.clearCookie(sessionCookie, { secure: true, httpOnly: true, sameSite: 'strict', path: '/' });
        res.set('Cache-Control', 'no-store').json({ success: true });
      } catch {
        res.status(503).json({ success: false, error: 'No se pudo cerrar la sesión en el servidor.' });
      }
    });
    app.post('/api/auth/google-session', async (req, res) => {
      res.set('Cache-Control', 'no-store');
      if (this.revocations && !req.is('application/json')) { res.sendStatus(415); return; }
      const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
      const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken : '';
      if (!username || username.length > 150 || !idToken || idToken.length > 10_000) {
        res.status(400).json({ success: false, error: 'Identidad de Google no válida.' }); return;
      }
      if (!this.verifyGoogleToken) { res.status(503).json({ success: false, error: 'Verificación de Google no disponible.' }); return; }
      try {
        const email = await this.verifyGoogleToken(idToken);
        if (!email) { res.status(401).json({ success: false, error: 'Google no confirmó la identidad.' }); return; }
        const account = await this.account(username);
        if (!account || (account.email || account.username).trim().toLowerCase() !== email.trim().toLowerCase()) {
          res.status(403).json({ success: false, error: 'La cuenta de Google no tiene acceso asignado.' }); return;
        }
        const { passwordHash: _password, ...user } = publicProfile(account);
        this.sendSession(res, user, Date.now(), this.binding(account));
      } catch { res.status(503).json({ success: false, error: 'No se pudo verificar la cuenta de Google.' }); }
    });
    app.post('/api/auth/session', async (req, res) => {
      res.set('Cache-Control', 'no-store');
      if (this.revocations && !req.is('application/json')) { res.sendStatus(415); return; }
      const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
      if (!username || username.length > 150 || !password || password.length > 256) {
        res.status(400).json({ success: false, error: 'Usuario y contraseña son obligatorios.' }); return;
      }
      const key = `${req.ip}:${username}`;
      const now = Date.now();
      // Prune expired limits; do not grow the map indefinitely under invalid requests.
      for (const [name, attempt] of this.attempts) if (attempt.expiresAt <= now) this.attempts.delete(name);
      const attempt = this.attempts.get(key);
      if ((attempt?.count || 0) >= 5 || this.attempts.size >= 1000) {
        res.status(429).json({ success: false, error: 'Demasiados intentos. Espera un minuto.', remainingSeconds: 60 }); return;
      }
      try {
        let account = await this.account(username);
        const stored = account?.passwordHash || '';
        const legacy = account && this.migrateLegacyPassword && verifyLegacyPassword(password, stored);
        const valid = account && (await verifyPassword(password,stored) || legacy);
        if (!valid) {
          this.attempts.set(key, { count: (attempt?.count || 0) + 1, expiresAt: attempt?.expiresAt || now + 60_000 });
          res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos.' }); return;
        }
        // Never issue a legacy session: persistence must confirm the upgrade first.
        if (legacy) account = await this.migrateLegacyPassword!(account!, password);
        this.attempts.delete(key);
        const { passwordHash: _password, ...user } = publicProfile(account);
        this.sendSession(res, user, Date.now(), this.binding(account!));
      } catch { res.status(503).json({ success: false, error: 'No se pudo verificar la cuenta. Intenta nuevamente.' }); }
    });
  }
}
