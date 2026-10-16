import crypto from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { expect, it, vi } from 'vitest';
import { AppSessions } from '../appSession';
import { registerDataApi } from '../dataApi';
import type { UserAccount } from '../../src/services/authService';

const account: UserAccount = { username: 'batch-test', name: 'Batch Test', role: 'Administrador', initials: 'BT', avatarColor: 'blue',
  passwordHash: 'scrypt$' + '01'.repeat(16) + '$' + crypto.scryptSync('password', '01'.repeat(16), 64).toString('hex') };

async function withApi(run: (context: { post: (queries: unknown, token?: string) => Promise<any>; reads: ReturnType<typeof vi.fn>; listens: ReturnType<typeof vi.fn> }) => Promise<void>) {
  const reads = vi.fn(async () => account);
  const listens = vi.fn();
  const reference = (path: string) => {
    const ref: any = { where: () => ref, orderBy: () => ref, limit: () => ref,
      onSnapshot: (next: (snapshot: any) => void) => {
        listens(path);
        queueMicrotask(() => next(path.includes('/') ? { id: path.split('/').at(-1), exists: true, data: () => ({ name: path }) }
          : { docs: [{ id: 'one', data: () => path === 'usuarios_sistema' ? account : { name: path } }] }));
        return vi.fn();
      } };
    return ref;
  };
  const app = express(); app.use(express.json());
  const sessions = new AppSessions(reads, 'batch-test-secret-longer-than-32-characters');
  sessions.register(app);
  const stop = registerDataApi(app, { doc: reference, collection: reference } as any, sessions);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const login = await (await fetch(base + '/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: account.username, password: 'password' }) })).json();
  const post = async (queries: unknown, token = login.token) => {
    const response = await fetch(base + '/api/data/listen-batch', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ queries }) });
    return { status: response.status, ...await response.json() };
  };
  try { await run({ post, reads, listens }); }
  finally { stop(); await new Promise<void>(resolve => server.close(() => resolve())); }
}

it('verifies access once for seven views and reuses conditional snapshots without new database listeners', async () => {
  await withApi(async ({ post, reads, listens }) => {
    const queries = ['reservas', 'usuarios_sistema', 'bloqueos_espacios', 'calificaciones_espacios', 'fcm_notificaciones', 'configuracion_sistema/espacios', 'configuracion_sistema/equipamiento']
      .map(path => ({ path, kind: path.includes('/') ? 'document' : 'query' }));
    const first = await post(queries);
    expect(first.status).toBe(200);
    expect(first.results).toHaveLength(7);
    expect(reads).toHaveBeenCalledTimes(2); // Login plus one check for the whole batch.
    expect(listens).toHaveBeenCalledTimes(7);
    expect(first.results[1].docs[0].data.passwordHash).toBe('');
    const second = await post(queries.map((query, index) => ({ ...query, version: first.results[index].version })));
    expect(second.results.every((result: any) => result.unchanged && !result.docs)).toBe(true);
    expect(reads).toHaveBeenCalledTimes(3);
    expect(listens).toHaveBeenCalledTimes(7);
  });
});

it('checks permissions on cached views and isolates forbidden queries without exposing their data', async () => {
  await withApi(async ({ post, reads, listens }) => {
    const audit = { path: 'audit_logs', kind: 'query' };
    await post([audit]);
    reads.mockResolvedValue({ ...account, role: 'Auxiliar', canCreateReservations: false, canEditReservations: false, canDeleteReservations: false });
    const response = await post([audit, { path: 'reservas', kind: 'query' }]);
    expect(response.results[0]).toMatchObject({ status: 403 });
    expect(response.results[0]).not.toHaveProperty('docs');
    expect(response.results[1].docs).toHaveLength(1);
    expect(listens).toHaveBeenCalledTimes(2);
  });
});

it('rejects invalid sessions, oversized batches and private configuration references', async () => {
  await withApi(async ({ post, listens }) => {
    expect((await post([{ path: 'reservas', kind: 'query' }], 'forged')).status).toBe(401);
    expect((await post(Array(51).fill({ path: 'reservas', kind: 'query' }))).status).toBe(400);
    expect((await post([])).status).toBe(400);
    const response = await post([{ path: 'configuracion_sistema/gmail_oauth_credentials', kind: 'document' }]);
    expect(response.results[0].status).toBe(403);
    expect(listens).not.toHaveBeenCalled();
  });
});
