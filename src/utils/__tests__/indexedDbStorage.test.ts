// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

it('reopens the existing cache after a rollback without deleting reservations or audit data', async () => {
  const cached = [{ id: 'fixture', fecha: '2026-11-18' }];
  const get = vi.fn(() => {
    const request = { result: cached, onsuccess: null as null | (() => void) };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  });
  const db = { objectStoreNames: { contains: (name: string) => ['reservas_store', 'audit_logs_store'].includes(name) },
    transaction: vi.fn(() => ({ objectStore: () => ({ get }) })), close: vi.fn() };
  const open = vi.fn((_name: string, version?: number) => {
    const request = { result: db, error: null as DOMException | null, onsuccess: null as null | (() => void),
      onerror: null as null | (() => void) };
    queueMicrotask(() => {
      if (version === 2) {
        request.error = new DOMException('Existing version is higher', 'VersionError');
        request.onerror?.();
      } else request.onsuccess?.();
    });
    return request;
  });
  const deleteDatabase = vi.fn();
  vi.stubGlobal('indexedDB', { open, deleteDatabase });
  const { getIndexedDbReservations } = await import('../indexedDbStorage');
  expect(await getIndexedDbReservations()).toEqual(cached);
  expect(open.mock.calls).toEqual([['EspaciosComunitariosDB', 2], ['EspaciosComunitariosDB']]);
  expect(db.transaction).toHaveBeenCalledWith('reservas_store', 'readonly');
  expect(deleteDatabase).not.toHaveBeenCalled();
});
