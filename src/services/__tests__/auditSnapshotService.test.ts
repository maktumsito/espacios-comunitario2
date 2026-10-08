import { beforeEach, expect, it, vi } from 'vitest';
import type { AuditChangeLogEntry } from '../../types';

const memory = vi.hoisted(() => ({ rows: new Map<string, any>(), commits: 0, fail: false, published: false }));
vi.mock('../../firebase/config', () => ({ getDb: () => ({}) }));
vi.mock('../reservationService', () => ({ cleanForFirestore: (data: any) => JSON.parse(JSON.stringify(data)) }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: any, ...path: string[]) => path.join('/'),
  getDocFromServer: async (path: string) => ({ exists: () => memory.rows.has(path), data: () => memory.rows.get(path) }),
  setDoc: async (path: string, data: any) => { memory.published = true; memory.rows.set(path, data); },
  writeBatch: () => {
    const writes = new Map<string, any>();
    return { set: (path: string, data: any) => writes.set(path, data), commit: async () => {
      if (memory.fail) throw new Error('Sin conexión');
      expect(memory.published).toBe(false);
      writes.forEach((data, path) => memory.rows.set(path, data)); memory.commits++;
    } };
  }
}));
import { fetchFullAuditEntry, persistAuditEntry } from '../auditSnapshotService';
const entry = (): AuditChangeLogEntry => ({ id: 'audit', timestamp: '2026-10-08T14:00:00Z', user: 'Admin', action: 'DELETE_SERIES',
  description: 'Eliminación', reservaId: 'series', snapshotVersion: 2, previousState: Array.from({ length: 60 }, (_, i) => ({
    id: String(i), descripcion: '漢字'.repeat(5000), cartaCompromisoAdjunta: { dataUrl: 'data:application/pdf;base64,ABC' }
  })) as any });
beforeEach(() => { memory.rows.clear(); memory.commits = 0; memory.fail = false; memory.published = false; });
it('round-trips oversized snapshots with every row and attachment using bounded parts', async () => {
  const original = entry();
  await persistAuditEntry(original);
  const manifest = memory.rows.get('audit_logs/audit');
  expect(manifest.snapshotParts).toBeGreaterThan(1);
  expect(manifest.previousState).toBeUndefined();
  for (const [path, data] of memory.rows) if (path.includes('/partes/')) expect(new TextEncoder().encode(JSON.stringify(data)).byteLength).toBeLessThan(900_000);
  expect((await fetchFullAuditEntry('audit')).previousState).toEqual(original.previousState);
});
it('does not publish a restorable manifest when snapshot persistence fails', async () => {
  memory.fail = true;
  await expect(persistAuditEntry(entry())).rejects.toThrow('Sin conexión');
  expect(memory.rows.has('audit_logs/audit')).toBe(false);
});
it('rejects missing or reordered parts instead of silently restoring partial data', async () => {
  await persistAuditEntry(entry());
  memory.rows.get('audit_logs/audit/partes/0').index = 5;
  await expect(fetchFullAuditEntry('audit')).rejects.toThrow(/incompleto/);
});
it('keeps small snapshots in one document', async () => {
  const small = { ...entry(), previousState: undefined };
  await persistAuditEntry(small);
  expect(memory.commits).toBe(0);
  expect((await fetchFullAuditEntry('audit')).id).toBe('audit');
});
