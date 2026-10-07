import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { AuthUser, UserAccount } from '../src/services/authService';

const SALT = 'espacios_community_salt_2026';
const SESSION_MS = 60 * 60_000;

export const requireReservationWriter: RequestHandler = (req, res, next) => {
  const user = (req as any).user as AuthUser | undefined;
  const flags = [user?.canCreateReservations, user?.canEditReservations, user?.canDeleteReservations];
  const allowed = !!user && (flags.some(flag => flag === true) ||
    (flags.every(flag => typeof flag !== 'boolean') && (user.isMasterAdmin === true ||
      ['administrador', 'coordinador', 'recepción', 'gestión'].includes((user.role || '').trim().toLowerCase()))));
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
  private attempts = new Map<string, { count: number; expiresAt: number }>();

  constructor(private readAccount: (username: string) => Promise<UserAccount | null>, secret?: string,
    private verifyGoogleToken?: (token: string) => Promise<string | null>) {
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
    const pending = this.pendingAccounts.get(name);
    if (pending) return pending;
    const request = this.readAccount(name).then(value => {
      // Keep this small even when callers submit arbitrary usernames.
      if (this.accounts.size >= 100) this.accounts.delete(this.accounts.keys().next().value!);
      // Positive permissions/passwords are rechecked for every protected request.
      if (value === null) this.accounts.set(name, { value, expiresAt: Date.now() + 60_000 });
      else this.accounts.delete(name);
      return value;
    });
    this.pendingAccounts.set(name, request);
    try { return await request; }
    finally { this.pendingAccounts.delete(name); }
  }

  private issue(user: AuthUser, startedAt = Date.now()): string {
    const body = Buffer.from(JSON.stringify({ u: user.username, startedAt,
      exp: Math.min(Date.now() + SESSION_MS, startedAt + 12 * SESSION_MS) })).toString('base64url');
    const signature = crypto.createHmac('sha256', this.key).update(body).digest('base64url');
    return `${body}.${signature}`;
  }

  private verify(token: string): { username: string; startedAt: number } | null {
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra || token.length > 2048) return null;
    if (!equal(signature, crypto.createHmac('sha256', this.key).update(body).digest('base64url'))) return null;
    try {
      const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      return typeof claims.u === 'string' && typeof claims.exp === 'number' && claims.exp > Date.now() &&
        typeof claims.startedAt === 'number' && claims.startedAt <= Date.now() && Date.now() < claims.startedAt + 12 * SESSION_MS
        ? { username: claims.u, startedAt: claims.startedAt } : null;
    } catch { return null; }
  }

  readonly requireAuth: RequestHandler = async (req, res, next) => {
    const header = req.get('authorization') || req.get('x-auth-session') || '';
    const claims = this.verify(header.replace(/^Bearer\s+/i, '').trim());
    if (!claims) { res.status(401).json({ success: false, error: 'Sesión no válida o vencida. Inicia sesión nuevamente.' }); return; }
    try {
      const account = await this.account(claims.username);
      if (!account) { res.status(401).json({ success: false, error: 'La cuenta ya no tiene acceso.' }); return; }
      const { passwordHash: _password, ...user } = account;
      (req as any).user = { ...user, u: user.username, r: user.role };
      (req as any).sessionStartedAt = claims.startedAt;
      next();
    } catch { res.status(503).json({ success: false, error: 'No se pudo verificar el acceso. Intenta nuevamente.' }); }
  };

  register(app: Express) {
    app.post('/api/auth/session/refresh', this.requireAuth, (req, res) => {
      res.set('Cache-Control', 'no-store');
      const { u: _username, r: _role, ...user } = (req as any).user;
      const startedAt = (req as any).sessionStartedAt;
      res.json({ success: true, user, token: this.issue(user, startedAt),
        expiresAt: Math.min(Date.now() + SESSION_MS, startedAt + 12 * SESSION_MS) });
    });
    app.post('/api/auth/google-session', async (req, res) => {
      res.set('Cache-Control', 'no-store');
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
        const { passwordHash: _password, ...user } = account;
        res.json({ success: true, user, token: this.issue(user) });
      } catch { res.status(503).json({ success: false, error: 'No se pudo verificar la cuenta de Google.' }); }
    });
    app.post('/api/auth/session', async (req, res) => {
      res.set('Cache-Control', 'no-store');
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
        const account = await this.account(username);
        const hash = crypto.createHash('sha256').update(`${SALT}:${password}`).digest('hex');
        const stored = account?.passwordHash || '';
        const valid = account && (equal(hash, stored) || (!/^[a-f\d]{64}$/i.test(stored) && equal(password, stored)));
        if (!valid) {
          this.attempts.set(key, { count: (attempt?.count || 0) + 1, expiresAt: attempt?.expiresAt || now + 60_000 });
          res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos.' }); return;
        }
        this.attempts.delete(key);
        const { passwordHash: _password, ...user } = account;
        res.json({ success: true, user, token: this.issue(user) });
      } catch { res.status(503).json({ success: false, error: 'No se pudo verificar la cuenta. Intenta nuevamente.' }); }
    });
  }
}
