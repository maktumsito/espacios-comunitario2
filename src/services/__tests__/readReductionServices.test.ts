// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ listen: vi.fn(), stop: vi.fn(), read: vi.fn() }));
vi.mock('../../firebase/config', () => ({ getDb: () => ({}) }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ type: 'collection', path }),
  doc: (_db: unknown, collection: string, id: string) => ({ type: 'document', path: `${collection}/${id}` }),
  query: (ref: any, ...constraints: any[]) => ({ ...ref, type: 'query', constraints }),
  where: (field: unknown, op: unknown, value: unknown) => ({ field, op, value }), documentId: () => '__name__',
  queryEqual: (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b), refEqual: (a: any, b: any) => a.path === b.path,
  onSnapshot: sdk.listen, getDocs: sdk.read,
}));
import { subscribeToAdminConfig } from '../adminConfigService';
import { subscribeToSpaceBlocks } from '../spaceBlockService';
import { purgeAuditLogs } from '../auditLogService';
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); sdk.listen.mockReturnValue(sdk.stop); });
afterEach(() => { vi.runAllTimers(); vi.useRealTimers(); });

it('subscribes only to the three catalogue documents and releases the shared listener', () => {
  const stop = subscribeToAdminConfig(vi.fn());
  expect(sdk.listen.mock.calls[0][0]).toMatchObject({ path: 'configuracion_sistema', constraints: [
    { field: '__name__', op: 'in', value: ['espacios', 'tipos_prestamo', 'tipos_actividad'] },
  ] });
  stop(); vi.advanceTimersByTime(1000); expect(sdk.stop).toHaveBeenCalledOnce();
});

it('retains spanning blocks by querying their end date, while administration can still load history', () => {
  const stopRange = subscribeToSpaceBlocks(vi.fn(), undefined, '2026-10-06');
  const stopAll = subscribeToSpaceBlocks(vi.fn());
  expect(sdk.listen.mock.calls[0][0]).toMatchObject({ constraints: [{ field: 'fechaFin', op: '>=', value: '2026-10-06' }] });
  expect(sdk.listen.mock.calls[1][0]).toEqual({ type: 'collection', path: 'bloqueos_espacios' });
  stopRange(); stopAll();
});

it('rejects immutable audit deletion without reading or clearing the remote log collection', async () => {
  await expect(purgeAuditLogs()).rejects.toThrow('no pueden eliminarse');
  expect(sdk.read).not.toHaveBeenCalled();
});
