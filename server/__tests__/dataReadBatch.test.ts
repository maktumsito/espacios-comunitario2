import crypto from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { expect, it, vi } from 'vitest';
import { AppSessions } from '../appSession';
import { registerDataApi } from '../dataApi';
import type { UserAccount } from '../../src/services/authService';

const account: UserAccount = { username: 'batch-test', name: 'Batch Test', role: 'Administrador', initials: 'BT', avatarColor: 'blue',
  passwordHash: 'scrypt$' + '01'.repeat(16) + '$' + crypto.scryptSync('password', '01'.repeat(16), 64).toString('hex') };

async function withApi(run: (context: { post: (queries: unknown, token?: string) => Promise<any>; reads: ReturnType<typeof vi.fn>; listens: ReturnType<typeof vi.fn> }) => Promise<void>, failure?: any) {
  const reads = vi.fn(async () => account);
  const listens = vi.fn();
  const reference = (path: string) => {
    const ref: any = { where: () => ref, orderBy: () => ref, limit: () => ref,
      onSnapshot: (next: (snapshot: any) => void, error: (error: any) => void) => {
        if (failure) { queueMicrotask(() => error(failure)); return vi.fn(); }
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

it('keeps a cold listener through HTTP warming and returns ready views in the batch', async () => {
  vi.useFakeTimers();
  const handlers = new Map<string, any>();
  const callbacks = new Map<string, (snapshot: any) => void>();
  const unsub = vi.fn();
  const ref = (path: string) => ({ onSnapshot: (next: any) => { callbacks.set(path, next); return unsub; } });
  const stop = registerDataApi({ post: (path: string, ...h: any[]) => handlers.set(path, h.at(-1)) } as any,
    { collection: ref, doc: ref } as any, { requireAuth: vi.fn() } as any);
  const request = (queries: any[]) => new Promise<any>(resolve => {
    const res: any = { set: () => res, vary: () => res, end: (body: Buffer) => resolve(JSON.parse(body.toString())), status: () => res };
    handlers.get('/api/data/listen-batch')({ body: { queries }, user: account, acceptsEncodings: () => 'identity' }, res);
  });
  try {
    const queries = [{ path: 'reservas', kind: 'query', light: true }, { path: 'bloqueos_espacios', kind: 'query' }];
    const first = request(queries);
    callbacks.get('bloqueos_espacios')!({ docs: [] });
    await vi.advanceTimersByTimeAsync(22_000);
    expect((await first).results).toMatchObject([{ code: 'view-warming', retryAfterMs: 4000 }, { docs: [] }]);
    expect(unsub).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    const dataUrl = 'data:application/pdf;base64,' + 'a'.repeat(600);
    const docs = Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, data: () => ({ descripcion: 'x'.repeat(200), cartaCompromisoAdjunta: { name: 'carta.pdf', dataUrl } }) }));
    callbacks.get('reservas')!({ docs });
    const second = await request(queries);
    expect(second.results[0].docs[0].data.cartaCompromisoAdjunta.dataUrl).toBe('');
    expect(callbacks.size).toBe(2);
    callbacks.get('reservas')!({ docs: docs.slice(1).reverse().map((doc, i) => i ? doc : { ...doc, data: () => ({ descripcion: 'Editada' }) }) });
    const incremental = await request([{ ...queries[0], delta: true, version: second.results[0].version }]);
    expect(incremental.results[0].delta).toMatchObject({ removedIds: ['r0'], upserts: [{ id: 'r19' }] });
    expect(incremental.results[0].delta.orderedIds[0]).toBe('r19');
    expect(Buffer.byteLength(JSON.stringify(incremental))).toBeLessThan(Buffer.byteLength(JSON.stringify(second)) / 2);
    const unknownEpoch = await request([{ ...queries[0], delta: true, version: 'previous-server:1' }]);
    expect(unknownEpoch.results[0].docs).toHaveLength(19);
    for (let i = 0; i < 33; i++) callbacks.get('reservas')!({ docs });
    const expired = await request([{ ...queries[0], delta: true, version: second.results[0].version }]);
    expect(expired.results[0].docs).toHaveLength(20);
    const full = request([{ path: 'reservas', kind: 'query' }]);
    callbacks.get('reservas')!({ docs: [{ id: 'r', data: () => ({ cartaCompromisoAdjunta: { name: 'carta.pdf', dataUrl } }) }] });
    expect((await full).results[0].docs[0].data.cartaCompromisoAdjunta.dataUrl).toBe(dataUrl);
    const stuckQuery = [{ path: 'calificaciones_espacios', kind: 'query' }];
    const stuck = request(stuckQuery);
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await stuck).results[0].code).toBe('view-warming');
    expect(unsub).toHaveBeenCalledOnce();
    const recovered = request(stuckQuery);
    callbacks.get('calificaciones_espacios')!({ docs: [] });
    expect((await recovered).results[0].docs).toEqual([]);
  } finally { stop(); vi.clearAllTimers(); vi.useRealTimers(); }
});

it('distinguishes native Firestore quota, deadline and server permission errors', async () => {
  for (const [code, expected] of [[8, 'resource-exhausted'], [4, 'deadline-exceeded'], [7, 'auth-backend-permission-denied']] as const) {
    await withApi(async ({ post }) => {
      const response = await post([{ path: 'reservas', kind: 'query' }]);
      expect(response.results[0]).toMatchObject({ status: 503, code: expected });
    }, { code, message: 'Native backend error' });
  }
});
