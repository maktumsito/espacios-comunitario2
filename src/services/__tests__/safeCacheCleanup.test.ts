// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const journal = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../reservationOperationJournal', () => ({readPendingOperations: journal.read}));
import { getCleanableCacheEntries, purgeLocalStorageCache } from '../storageService';
beforeEach(() => {localStorage.clear(); journal.read.mockResolvedValue([]);});

it('previews and removes only disposable cache keys, preserving current data, credentials, drafts, imports and audit', async () => {
  const preserved = ['espacios_auth_user','espacios_auth_token_v2','reservation_pending_operations_v1','reservation_draft_new',
    'reservas_comunitarias_cache_v6','cc_audit_changelog_v1','cc_temp_import_cache','other_application'];
  preserved.forEach(key => localStorage.setItem(key, 'preserve'));
  localStorage.setItem('reservations_cache', 'redundant cache');
  expect(getCleanableCacheEntries().map(entry => entry.key)).toEqual(['reservations_cache']);
  const result = await purgeLocalStorageCache();
  expect(result.freedBytes).toBeGreaterThan(0);
  expect(localStorage.getItem('reservations_cache')).toBeNull();
  preserved.forEach(key => expect(localStorage.getItem(key)).toBe('preserve'));
});

it('refuses cleanup when pending writes exist or the journal cannot be read', async () => {
  localStorage.setItem('reservations_cache','preserve until checked');
  journal.read.mockResolvedValueOnce([{id:'pending'}]);
  await expect(purgeLocalStorageCache()).rejects.toThrow('pendientes');
  journal.read.mockRejectedValueOnce(new Error('IndexedDB unavailable'));
  await expect(purgeLocalStorageCache()).rejects.toThrow('IndexedDB unavailable');
  expect(localStorage.getItem('reservations_cache')).toBe('preserve until checked');
});
