import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { ReservationWriteError } from '../../src/services/reservationWriter';
import { commitTrusted, registerReservationApi } from '../reservationApi';

const writer = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/reservationWriter', async original => ({ ...await original<any>(), writeReservations: writer }));
const rows = [{ id: 'one' }, { id: 'two' }] as any;
const actor = { username: 'test', name: 'Test' };
const result = () => ({ operationId: 'pending', confirmedIds: [], deletedIds: [], pendingIds: ['two'], reservations: [] });
beforeEach(() => { writer.mockReset(); });

it('preserves confirmed IDs from a previous server receipt when the remaining write is rejected', async () => {
  const options = { operationId: 'pending' };
  const fingerprint = createHash('sha256').update(JSON.stringify({ rows, deletedIds: [], expectedVersions: {}, override: false })).digest('hex');
  const db = { doc: () => ({ get: async () => ({ data: () => ({ operationActor: 'test', fingerprint, confirmedIds: ['one'] }) }) }) };
  const error = new ReservationWriteError('Conflicto', result(), undefined, true);
  writer.mockRejectedValue(error);
  await expect(commitTrusted(db as any, {} as any, 'token', actor, rows, options)).rejects.toBe(error);
  expect(error.discardPending).toBe(false);
  expect(error.result.confirmedIds).toEqual(['one']);
  expect(writer.mock.calls[0][1].map((r: any) => r.id)).toEqual(['two']);
});

it('includes definitive rejection metadata in the streamed server reply', async () => {
  const handlers = new Map<string, any>();
  const app = { post: (path: string, ...callbacks: any[]) => handlers.set(path, callbacks.at(-1)) };
  const db = { doc: () => ({ get: async () => ({ data: () => undefined }) }) };
  registerReservationApi(app as any, db as any, { requireAuth: vi.fn() } as any);
  writer.mockRejectedValue(new ReservationWriteError('Conflicto', result(), undefined, true));
  const reply = vi.fn();
  const res = { set: vi.fn(), flushHeaders: vi.fn(), end: reply, headersSent: true };
  const req = { body: { reservations: rows, options: { operationId: 'pending' } }, user: actor,
    get: (name: string) => name === 'accept' ? 'application/x-ndjson' : 'token' };
  await handlers.get('/api/reservations/commit')(req, res);
  expect(JSON.parse(reply.mock.calls[0][0])).toMatchObject({ success: true, error: 'Conflicto', discardPending: true });
});
