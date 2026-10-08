// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import type { AuditChangeLogEntry, Reservation } from '../../types';

const mocks = vi.hoisted(() => ({ getStored: vi.fn(), setStored: vi.fn(), persist: vi.fn(), fetch: vi.fn(), commit: vi.fn(),
  rows: new Map<string, Reservation>(), onSnapshot: undefined as any }));
vi.mock('../../firebase/config', () => ({ getDb: () => ({}) }));
vi.mock('../../firebase/sharedSnapshot', () => ({ sharedOnSnapshot: (_q: any, callback: any) => { mocks.onSnapshot = callback; return () => {}; } }));
vi.mock('firebase/firestore', () => ({ doc: (_db: any, collection: string, id: string) => `${collection}/${id}`,
  getDocFromServer: async (path: string) => {
    const id = path.split('/').at(-1)!;
    return { id, exists: () => mocks.rows.has(id), data: () => mocks.rows.get(id) };
  }, collection: vi.fn(), query: vi.fn(), orderBy: vi.fn(), limit: vi.fn() }));
vi.mock('../authService', () => ({ getCurrentUser: () => null, isCoordinatorOrAdmin: (u: any) => ['Administrador', 'Coordinador'].includes(u?.role) }));
vi.mock('../reservationService', () => ({ commitReservationChanges: mocks.commit, cleanForFirestore: (data: any) => JSON.parse(JSON.stringify(data)) }));
vi.mock('../auditSnapshotService', () => ({ fetchFullAuditEntry: mocks.fetch, persistAuditEntry: mocks.persist, AuditNotSyncedError: class extends Error {} }));
vi.mock('../../utils/indexedDbStorage', () => ({ getIndexedDbAuditLogs: mocks.getStored, setIndexedDbAuditLogs: mocks.setStored }));

const admin = { username: 'admin', name: 'Admin', role: 'Administrador', initials: 'A', avatarColor: 'blue' };
const row: Reservation = { id: 'a', version: 3, fecha: '2026-10-06', horaInicio: '10:00', horaFin: '11:00',
  espacio: 'SALA 2', responsable: 'Vecino', descripcion: 'Taller', tipoActividad: 'Taller', actividadRecurrente: 'No' };
const entry = (extra: Partial<AuditChangeLogEntry> = {}): AuditChangeLogEntry => ({ id: 'audit', timestamp: '2026-10-08T14:00:00Z',
  user: 'Admin', action: 'DELETE', description: 'Eliminación', reservaId: 'a', snapshotVersion: 2, previousState: row, ...extra });
let service: typeof import('../auditLogService');
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear(); mocks.rows.clear();
  mocks.getStored.mockResolvedValue([]); mocks.setStored.mockResolvedValue(undefined); mocks.persist.mockResolvedValue(undefined);
  mocks.commit.mockResolvedValue({}); mocks.fetch.mockResolvedValue(entry());
  service = await import('../auditLogService');
});
it('preserves all existing history and complete snapshots while keeping localStorage small', async () => {
  const old = Array.from({ length: 100 }, (_, i) => entry({ id: `old-${i}` }));
  mocks.getStored.mockResolvedValue(old);
  const rows = Array.from({ length: 60 }, (_, i) => ({ ...row, id: String(i), cartaCompromisoAdjunta: {
    name: 'carta.pdf', dataUrl: 'data:application/pdf;base64,ABC', type: 'application/pdf', size: 3, uploadedAt: '2026-10-08'
  } }));
  const recorded = await service.recordAuditEntry({ action: 'DELETE_SERIES', description: 'Serie', reservaId: 'series', previousState: rows });
  expect(service.getAuditHistory()).toHaveLength(101);
  expect(recorded.previousState).toEqual(rows);
  expect(mocks.persist).toHaveBeenCalledWith(recorded);
  const local = JSON.parse(localStorage.getItem('cc_audit_changelog_v1')!);
  expect(local).toHaveLength(15);
  expect(local.some((r: any) => r.previousState)).toBe(false);
});
it('merges remote summaries without losing full local snapshots or revert flags', async () => {
  service.saveAuditHistory([entry({ isReverted: true, revertedBy: 'Admin' }), entry({ id: 'older' })]);
  service.subscribeToAuditLogs(vi.fn());
  mocks.onSnapshot({ empty: false, forEach: (callback: any) => callback({ id: 'audit', data: () => entry({ previousState: undefined, isReverted: false }) }) });
  expect(service.getAuditHistory()).toHaveLength(2);
  expect(service.getAuditHistory().find(r => r.id === 'audit')).toMatchObject({ previousState: row, isReverted: true, revertedBy: 'Admin' });
});
it('checks authorization at service level before consulting or modifying records', async () => {
  const result = await service.restoreAuditChange('audit', { ...admin, role: 'Auxiliar' });
  expect(result.success).toBe(false);
  expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled();
});
it('recovers a deleted version and commits its audit status in the same atomic operation', async () => {
  const result = await service.restoreAuditChange('audit', admin);
  expect(result).toMatchObject({ success: true, restoredCount: 1 });
  expect(mocks.commit).toHaveBeenCalledWith([expect.objectContaining({ id: 'a', version: 0 })], expect.objectContaining({
    requireAtomic: true, operationId: 'RESTORE_audit', expectedVersions: { a: -1 },
    auditRestore: expect.objectContaining({ logId: 'audit', actor: 'Admin', log: expect.objectContaining({ action: 'RESTORE' }) })
  }));
  expect(service.getAuditHistory().find(r => r.id === 'audit')?.isReverted).toBe(true);
});
it('never marks restoration successful or reverted when the transaction fails', async () => {
  mocks.commit.mockRejectedValue(new Error('Conflicto de disponibilidad'));
  expect((await service.restoreAuditChange('audit', admin)).success).toBe(false);
  expect(service.getAuditHistory().find(r => r.id === 'audit')?.isReverted).toBe(false);
  expect(service.getAuditHistory().some(r => r.action === 'RESTORE')).toBe(false);
});
it('blocks duplicate clicks and retains new audit records arriving during a restoration', async () => {
  let release!: () => void;
  mocks.commit.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
  const first = service.restoreAuditChange('audit', admin);
  await vi.waitFor(() => expect(mocks.commit).toHaveBeenCalled());
  expect((await service.restoreAuditChange('audit', admin)).message).toContain('en curso');
  service.saveAuditHistory([...service.getAuditHistory(), entry({ id: 'concurrent' })]);
  release();
  expect((await first).success).toBe(true);
  expect(service.getAuditHistory().some(r => r.id === 'concurrent')).toBe(true);
});
