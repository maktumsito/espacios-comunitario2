import express from 'express';
import type { AddressInfo } from 'node:net';
import { expect, it, vi } from 'vitest';
import { registerDataApi } from '../dataApi';
import { prepareEquipmentAllocation } from '../equipmentAllocation';
import { claimDelivery, startDelivery } from '../deliveryLease';

async function withApi(run: (context: any) => Promise<void>) {
  const rows = new Map<string, any>([
    ['usuarios_sistema/admin', { username: 'admin', name: 'Admin', role: 'Administrador', passwordHash: 'private', sessionVersion: 1 }],
    ['usuarios_sistema/reader', { username: 'reader', name: 'Reader', role: 'Auxiliar', passwordHash: 'private', sessionVersion: 1 }],
    ['reservas/one', { id: 'one', descripcion: 'Actual' }],
  ]);
  let actor: any = { username: 'admin', role: 'Administrador', isMasterAdmin: true };
  const snapshot = (path: string): any => ({ id: path.split('/').at(-1), ref: { path }, exists: rows.has(path),
    data: () => rows.get(path), get: (field: string) => rows.get(path)?.[field] });
  const read = vi.fn(async (ref: any) => ref.path.split('/').length % 2 === 0 ? snapshot(ref.path)
    : { docs: [...rows.keys()].filter(path => path.startsWith(ref.path + '/')).map(snapshot) });
  const write = vi.fn();
  const db: any = {
    doc: (path: string) => ({ path, id: path.split('/').at(-1), get: () => read({ path }) }),
    collection: (path: string) => ({ path, get: () => read({ path }) }),
    runTransaction: async (callback: any) => {
      const writes: (() => void)[] = [];
      const result = await callback({ get: read, set: (ref: any, data: any) => writes.push(() => { write(ref.path); rows.set(ref.path, data); }),
        delete: (ref: any) => writes.push(() => { write(ref.path); rows.delete(ref.path); }) });
      writes.forEach(write => write()); return result;
    },
  };
  const sessions: any = { requireAuth: (req: any, _res: any, next: any) => { req.user = actor; next(); }, invalidateAccount: vi.fn() };
  const app = express(); app.use(express.json());
  const stop = registerDataApi(app, db, sessions);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (path: string, body: any) => {
    const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, ...await res.json() };
  };
  try { await run({ post, rows, read, write }); }
  finally { stop(); await new Promise<void>(resolve => server.close(() => resolve())); }
}

it('saves a profile with one collection read and returns sanitized committed profiles', async () => {
  await withApi(async ({ post, read, rows }: any) => {
    const result = await post('/api/users/save', { user: { username: 'reader', name: 'Renamed', role: 'Auxiliar' } });
    expect(result.status).toBe(200);
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.users).toHaveLength(2);
    expect(result.users.find((u: any) => u.username === 'reader')).toMatchObject({ name: 'Renamed', passwordHash: '' });
    expect(rows.get('usuarios_sistema/reader').passwordHash).toBe('private');
    expect(JSON.stringify(result.users)).not.toContain('private');
  });
});

it('does not write an unchanged profile but still commits password changes', async () => {
  await withApi(async ({ post, read, write, rows }: any) => {
    rows.set('usuarios_sistema/reader', { ...rows.get('usuarios_sistema/reader'), createdAt: '2026-01-01T00:00:00Z' });
    const body = { user: { username: 'reader', name: 'Reader', role: 'Auxiliar' } };
    expect((await post('/api/users/save', body)).status).toBe(200);
    expect(read).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
    expect((await post('/api/users/save', { ...body, password: 'Changed-only-123!' })).status).toBe(200);
    expect(write).toHaveBeenCalledTimes(1);
    expect(rows.get('usuarios_sistema/reader').sessionVersion).toBe(2);
  });
});

it('renames atomically, rejects duplicate names and preserves the last administrator', async () => {
  await withApi(async ({ post, rows }: any) => {
    const renamed = await post('/api/users/save', { originalUsername: 'reader', user: { username: 'renamed', name: 'Reader', role: 'Auxiliar' } });
    expect(renamed.status).toBe(200);
    expect(renamed.users.map((u: any) => u.username).sort()).toEqual(['admin', 'renamed']);
    expect(rows.has('usuarios_sistema/reader')).toBe(false);
    expect(rows.get('usuarios_sistema/renamed').sessionVersion).toBe(2);
    expect((await post('/api/users/save', { originalUsername: 'renamed', user: { username: 'admin', name: 'Duplicate', role: 'Auxiliar' } })).status).toBe(409);
    expect((await post('/api/users/save', { user: { username: 'admin', name: 'Admin', role: 'Auxiliar' } })).status).toBe(409);
    expect((await post('/api/users/delete', { username: 'admin' })).status).toBe(409);
  });
});

it('deletes a profile with one collection read and handles already missing accounts without a delete', async () => {
  await withApi(async ({ post, read, rows }: any) => {
    const deleted = await post('/api/users/delete', { username: 'reader' });
    expect(deleted.status).toBe(200);
    expect(deleted.users.map((u: any) => u.username)).toEqual(['admin']);
    expect(read).toHaveBeenCalledTimes(1);
    expect(rows.has('usuarios_sistema/reader')).toBe(false);
    expect((await post('/api/users/delete', { username: 'reader' })).users).toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(2);
  });
});

it('skips equipment_day_guards reads and writes when reservation edits do not alter equipment or schedule', async () => {
  const base: any = {
    id: 'r1',
    fecha: '2026-10-15',
    horaInicio: '10:00',
    horaFin: '11:00',
    espacio: 'SALA 2',
    estado: 'activa',
    equipamientoSolicitado: [{ equipmentId: 'EQ_PROYECTOR_HD', equipmentName: 'Proyector', quantity: 1 }],
  };
  const tx: any = { get: vi.fn(), getAll: vi.fn(), set: vi.fn() };
  const db: any = { doc: vi.fn(), collection: vi.fn() };
  const current = new Map([['r1', base]]);
  const saved = [{ ...base, realizada: 'Sí', comentarios: 'Asistencia completa', descripcion: 'Cambio de título' }];
  const commit = await prepareEquipmentAllocation(db, tx, current, saved, ['r1']);
  commit();
  expect(tx.get).not.toHaveBeenCalled();
  expect(tx.getAll).not.toHaveBeenCalled();
  expect(tx.set).not.toHaveBeenCalled();
});

it('acquires delivery_started in a single transaction when immediateStart is enabled', async () => {
  let transactions = 0;
  const store = new Map<string, any>();
  const db: any = {
    doc: (path: string) => ({ path }),
    runTransaction: async (fn: any) => {
      transactions++;
      return fn({
        get: async (ref: any) => ({ data: () => store.get(ref.path) }),
        set: (ref: any, data: any) => store.set(ref.path, data),
        update: (ref: any, data: any) => store.set(ref.path, { ...store.get(ref.path), ...data }),
      });
    },
  };
  const claim = await claimDelivery(db, '2026-10-28', Date.now(), true);
  expect(claim).toBeTruthy();
  await startDelivery(db, claim!);
  expect(transactions).toBe(1);
  expect(store.get('_email_dispatches/2026-10-28').status).toBe('delivery_started');
});
