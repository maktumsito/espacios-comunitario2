import express from 'express';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { AppSessions, requireReservationWriter } from '../appSession';
import { accountId, registerDataApi, reservationPermission, validateUserPermissions } from '../dataApi';
import { hashPassword, verifyPassword } from '../passwords';

const initialPassword = 'Fixture-only-123!';
async function withUsers(run: (context: any) => Promise<void>) {
  const passwordHash = await hashPassword(initialPassword);
  const rows = new Map<string, any>([
    ['cristian shute', 'Administrador', true], ['master', 'Administrador', true],
    ['coordinator', 'Coordinador', false], ['reader', 'Auxiliar', false],
  ].map(([username, role, isMasterAdmin]) => [`usuarios_sistema/${accountId(String(username))}`,
    { username, name: username, role, isMasterAdmin, passwordHash, sessionVersion: 1 }]));
  const snapshot = (path: string): any => ({ id: path.split('/').at(-1), ref: { path }, exists: rows.has(path),
    data: () => rows.get(path), get: (key: string) => rows.get(path)?.[key] });
  const read = async (ref: any) => ref.path.split('/').length % 2 === 0 ? snapshot(ref.path) :
    { docs: [...rows.keys()].filter(path => path.startsWith(ref.path + '/')).map(snapshot) };
  const db: any = {
    doc: (path: string) => ({ path, id: path.split('/').at(-1), get: () => read({ path }) }),
    collection: (path: string) => ({ path, get: () => read({ path }) }),
    runTransaction: async (callback: any) => {
      const writes: (() => void)[] = [];
      const result = await callback({ get: read,
        set: (ref: any, data: any) => writes.push(() => { rows.set(ref.path, data); }),
        update: (ref: any, data: any) => writes.push(() => { rows.set(ref.path, { ...rows.get(ref.path), ...data }); }),
        delete: (ref: any) => writes.push(() => { rows.delete(ref.path); }),
      });
      writes.forEach(write => write());
      return result;
    },
    batch: () => ({ commit: async () => { throw new Error('Unexpected direct write'); } }),
  };
  const sessions = new AppSessions(async name => rows.get(`usuarios_sistema/${accountId(name)}`) || null,
    'fixture-session-secret-at-least-32-characters');
  const app = express(); app.use(express.json());
  sessions.register(app, async () => [...rows.values()]);
  const stop = registerDataApi(app, db, sessions);
  app.post('/check/:permission', sessions.requireAuth, requireReservationWriter, (req, res) => {
    res.sendStatus(reservationPermission((req as any).user, req.params.permission as any) ? 200 : 403);
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (path: string, body: any, token = '') => {
    const response = await fetch(base + path, { method: 'POST', headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
    }, body: JSON.stringify(body) });
    const content = await response.text();
    return { status: response.status, ...(content.startsWith('{') ? JSON.parse(content) : {}) };
  };
  const login = (username: string, password = initialPassword) => post('/api/auth/session', { username, password });
  try { await run({ post, login, rows }); }
  finally { stop(); await new Promise<void>(resolve => server.close(() => resolve())); }
}

it('creates an account with protected credentials and the exact permissions selected by Cristian', async () => {
  await withUsers(async ({ post, login, rows }) => {
    const { token } = await login('cristian shute');
    const user = { username: 'new.user', name: 'Nuevo usuario', role: 'Auxiliar',
      canCreateReservations: true, canEditReservations: false, canDeleteReservations: true };
    const created = await post('/api/users/save', { user, password: 'Assigned-only-123!' }, token);
    expect(created.status).toBe(200);
    expect((await post('/api/users/save', { user: { ...user, username: 'new_user' }, password: 'Other-only-123!' }, token)).status).toBe(409);
    const stored = rows.get('usuarios_sistema/new_user');
    expect(stored).toMatchObject(user);
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
    expect(await verifyPassword('Assigned-only-123!', stored.passwordHash)).toBe(true);
    expect(JSON.stringify(created)).not.toContain(stored.passwordHash);
    expect(JSON.stringify(created)).not.toContain('Assigned-only-123!');
    const session = await login('new.user', 'Assigned-only-123!');
    expect(session.status).toBe(200);
    expect(session.user).toMatchObject(user);
    expect(session.user).not.toHaveProperty('passwordHash');
    for (const [key, allowed] of Object.entries({ canCreateReservations: true, canEditReservations: false, canDeleteReservations: true }))
      expect((await post(`/check/${key}`, {}, session.token)).status).toBe(allowed ? 200 : 403);
    expect((await post('/api/users/save', { user: { ...user, name: 'Intruso' } }, session.token)).status).toBe(403);
  });
});

it('keeps a password when editing, assigns a new one and invalidates the old session', async () => {
  await withUsers(async ({ post, login, rows }) => {
    const { token } = await login('coordinator');
    const readerSession = await login('reader');
    const profile = { username: 'reader', name: 'Nombre actualizado', role: 'Auxiliar',
      canCreateReservations: false, canEditReservations: false, canDeleteReservations: false };
    const original = rows.get('usuarios_sistema/reader').passwordHash;
    expect((await post('/api/users/save', { user: profile, password: '' }, token)).status).toBe(200);
    expect(rows.get('usuarios_sistema/reader').passwordHash).toBe(original);
    expect((await post('/check/canCreateReservations', {}, readerSession.token)).status).toBe(403);
    expect((await post('/api/users/save', { user: profile, password: 'Reassigned-123!' }, token)).status).toBe(200);
    expect((await post('/check/canCreateReservations', {}, readerSession.token)).status).toBe(401);
    expect((await login('reader')).status).toBe(401);
    expect((await login('reader', 'Reassigned-123!')).status).toBe(200);
  });
});

it('rejects permission changes by other managers and forged master status, including direct writes', async () => {
  await withUsers(async ({ post, login, rows }) => {
    for (const actor of ['coordinator', 'master']) {
      const { token } = await login(actor);
      const user = { username: 'reader', name: 'Reader', role: 'Auxiliar' };
      for (const key of ['canCreateReservations', 'canEditReservations', 'canDeleteReservations'])
        expect((await post('/api/users/save', { user: { ...user, [key]: true } }, token)).status).toBe(403);
      expect((await post('/api/data/write', { writes: [{ type: 'update', path: 'usuarios_sistema/reader', data: { canEditReservations: true } }] }, token)).status).toBe(403);
    }
    const { token } = await login('coordinator');
    expect((await post('/api/users/save', { user: { username: 'reader', name: 'Reader', role: 'Auxiliar', isMasterAdmin: true } }, token)).status).toBe(403);
    const user = { username: 'new-reader', name: 'Nuevo lector', role: 'Auxiliar', canEditReservations: true };
    expect((await post('/api/users/save', { user, password: initialPassword }, token)).status).toBe(403);
    expect(rows.has('usuarios_sistema/new-reader')).toBe(false);
    expect((await post('/api/users/save', { user: { ...user, canEditReservations: false }, password: initialPassword }, token)).status).toBe(200);
    expect(rows.get('usuarios_sistema/new-reader')).toMatchObject({ canCreateReservations: false, canEditReservations: false, canDeleteReservations: false });
  });
});

it('validates password length, boolean permissions and role before saving', async () => {
  await withUsers(async ({ post, login, rows }) => {
    const { token } = await login('cristian shute');
    const user = { username: 'new', name: 'Nuevo', role: 'Auxiliar' };
    for (const password of ['', '1234567', '        ', 'a'.repeat(257), 12345678])
      expect((await post('/api/users/save', { user, password }, token)).status).toBe(400);
    for (const value of ['false', 0, null])
      expect((await post('/api/users/save', { user: { ...user, canCreateReservations: value }, password: initialPassword }, token)).status).toBe(400);
    expect((await post('/api/users/save', { user: { ...user, role: 'Superusuario' }, password: initialPassword }, token)).status).toBe(400);
    expect((await post('/api/users/save', { user: { ...user, name: '   ' }, password: initialPassword }, token)).status).toBe(400);
    expect(rows.has('usuarios_sistema/new')).toBe(false);
    expect((await post('/api/users/save', { user, password: '12345678' }, token)).status).toBe(200);
  });
});

it.each([
  ['Administrador', true, true], ['Coordinador', true, true],
  ['Recepción', true, false], ['Gestión', true, false], ['Auxiliar', false, false],
])('creates a %s account with the default permissions shown in the form', async (role, create, edit) => {
  await withUsers(async ({ post, login }) => {
    const manager = await login('coordinator');
    const user = { username: 'new-account', name: 'Cuenta de prueba', role,
      canCreateReservations: create, canEditReservations: edit, canDeleteReservations: false };
    expect((await post('/api/users/save', { user, password: initialPassword }, manager.token)).status).toBe(200);
    const session = await login('new-account');
    expect(session.status).toBe(200);
    expect(session.user).toMatchObject(user);
  });
});

it('revokes individual permissions on active sessions and preserves unspecified role permissions', async () => {
  await withUsers(async ({ post, login }) => {
    const master = await login('cristian shute');
    const coordinator = await login('coordinator');
    expect((await post('/api/users/save', { user: { username: 'coordinator', name: 'Coordinador', role: 'Coordinador', canDeleteReservations: false } }, master.token)).status).toBe(200);
    expect((await post('/check/canCreateReservations', {}, coordinator.token)).status).toBe(200);
    expect((await post('/check/canEditReservations', {}, coordinator.token)).status).toBe(200);
    expect((await post('/check/canDeleteReservations', {}, coordinator.token)).status).toBe(403);
    expect((await post('/api/users/save', { user: { username: 'coordinator', name: 'Coordinador', role: 'Coordinador', canCreateReservations: false, canEditReservations: false, canDeleteReservations: false } }, master.token)).status).toBe(200);
    expect((await post('/check/canEditReservations', {}, coordinator.token)).status).toBe(403);
    expect((await post('/api/auth/session/refresh', {}, coordinator.token)).user).toMatchObject({ canCreateReservations: false, canEditReservations: false, canDeleteReservations: false });
  });
});

it('checks the current password for self changes and permits only masters to force resets', async () => {
  await withUsers(async ({ post, login }) => {
    const reader = await login('reader');
    const coordinator = await login('coordinator');
    const body = { username: 'reader', currentPassword: 'incorrect', newPassword: 'Changed-123!' };
    expect((await post('/api/users/password', body, reader.token)).status).toBe(403);
    expect((await post('/api/users/password', { ...body, override: true }, coordinator.token)).status).toBe(403);
    expect((await post('/api/users/password', { ...body, currentPassword: initialPassword, newPassword: '123' }, reader.token)).status).toBe(400);
    expect((await post('/api/users/password', { ...body, currentPassword: initialPassword, newPassword: '  Changed-123!  ' }, reader.token)).status).toBe(200);
    expect((await post('/api/auth/session/refresh', {}, reader.token)).status).toBe(401);
    expect((await login('reader')).status).toBe(401);
    expect((await login('reader', 'Changed-123!')).status).toBe(200);
    const master = await login('master');
    expect((await post('/api/users/password', { ...body, override: true }, master.token)).status).toBe(200);
    expect((await login('reader', body.newPassword)).status).toBe(200);
  });
});

it('also rejects unauthorized permission changes in backup profiles', () => {
  const existing = { username: 'reader', role: 'Auxiliar', canEditReservations: false };
  expect(() => validateUserPermissions({ username: 'master', isMasterAdmin: true }, { ...existing, canEditReservations: true }, existing)).toThrow('Solo Cristian Shute');
  expect(() => validateUserPermissions({ username: 'cristian shute', isMasterAdmin: true }, { ...existing, canEditReservations: true }, existing)).not.toThrow();
});

it('lets Cristian revoke and restore his own reservation permissions while keeping user administration', async () => {
  await withUsers(async ({ post, login, rows }) => {
    const { token } = await login('cristian shute');
    const keys = ['canCreateReservations', 'canEditReservations', 'canDeleteReservations'];
    for (const value of [false, true]) {
      const user = { username: 'cristian shute', name: 'Cristian Shute', role: 'Administrador', isMasterAdmin: true,
        ...Object.fromEntries(keys.map(key => [key, value])) };
      expect((await post('/api/users/save', { user, originalUsername: user.username }, token)).status).toBe(200);
      expect(rows.get(`usuarios_sistema/${accountId(user.username)}`)).toMatchObject(user);
      expect((await post('/api/auth/session/refresh', {}, token)).user).toMatchObject(user);
      for (const key of keys)
        expect((await post(`/check/${key}`, {}, token)).status).toBe(value ? 200 : 403);
    }
  });
});

it('lets Cristian deactivate and reactivate reservation permissions for every account, including all masters', async () => {
  await withUsers(async ({ post, login, rows }) => {
    const usernames = ['coordinator', 'reader', 'master', 'cristian shute'];
    const sessions = new Map<string, string>();
    for (const username of usernames) sessions.set(username, (await login(username)).token);
    for (const enabled of [false, true]) {
      for (const username of usernames) {
        const { passwordHash: _password, ...profile } = rows.get(`usuarios_sistema/${accountId(username)}`);
        const user = { ...profile, canCreateReservations: enabled, canEditReservations: enabled, canDeleteReservations: enabled };
        expect((await post('/api/users/save', { user, originalUsername: username }, sessions.get('cristian shute'))).status).toBe(200);
        for (const key of ['canCreateReservations', 'canEditReservations', 'canDeleteReservations'])
          expect((await post(`/check/${key}`, {}, sessions.get(username))).status).toBe(enabled ? 200 : 403);
      }
    }
  });
});
