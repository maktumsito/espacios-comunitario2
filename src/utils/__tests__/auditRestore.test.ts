import { describe, expect, it } from 'vitest';
import type { AuditChangeLogEntry, Reservation } from '../../types';
import { buildAuditRestorePlan, canRestoreAuditEntry } from '../auditRestore';

const row = (id: string, version = 1): Reservation => ({ id, version, fecha: '2026-10-06', horaInicio: '10:00',
  horaFin: '11:00', espacio: 'SALA 2', responsable: 'Vecino', descripcion: 'Taller', tipoActividad: 'Taller', actividadRecurrente: 'No' });
const log = (extra: Partial<AuditChangeLogEntry>): AuditChangeLogEntry => ({ id: 'audit', timestamp: '2026-10-08T14:00:00Z',
  user: 'Admin', action: 'UPDATE', description: 'Cambio', reservaId: 'a', snapshotVersion: 2, ...extra });

describe('exact audit restoration scope', () => {
  it('recovers every deleted reservation, resetting persistence versions and preserving attachments', () => {
    const rows = Array.from({ length: 60 }, (_, i) => row(String(i), 8));
    rows[0].cartaCompromisoAdjunta = { name: 'carta.pdf', dataUrl: 'data:application/pdf;base64,ABC', type: 'application/pdf', size: 3, uploadedAt: '2026-10-08' };
    const plan = buildAuditRestorePlan(log({ action: 'DELETE_SERIES', previousState: rows }), new Map());
    expect(plan.reservations).toHaveLength(60);
    expect(plan.reservations[0]).toMatchObject({ version: 0, restoredStateVersion: 8, cartaCompromisoAdjunta: rows[0].cartaCompromisoAdjunta });
    expect(plan.expectedVersions['0']).toBe(-1);
  });
  it('restores an edit with the current persistence version', () => {
    const current = row('a', 2);
    const plan = buildAuditRestorePlan(log({ previousState: row('a'), newState: current }), new Map([['a', current]]));
    expect(plan.reservations[0]).toMatchObject({ version: 2, restoredStateVersion: 1 });
    expect(plan.expectedVersions).toEqual({ a: 2 });
  });
  it('reverses mixed series changes, restoring shortened sessions and deleting only the added sessions', () => {
    const current = [row('a', 2), row('new')];
    const plan = buildAuditRestorePlan(log({ previousState: [row('a'), row('removed')], newState: current }), new Map(current.map(r => [r.id, r])));
    expect(plan.deletedIds).toEqual(['new']);
    expect(plan.reservations.map(r => r.id)).toEqual(['a', 'removed']);
    expect(plan.expectedVersions).toEqual({ a: 2, removed: -1, new: 1 });
  });
  it('undoes an import by restoring overwritten rows and deleting only newly imported rows', () => {
    const current = [row('existing', 4), row('new')];
    const plan = buildAuditRestorePlan(log({ action: 'BULK_IMPORT', previousState: [row('existing', 3)], newState: current }), new Map(current.map(r => [r.id, r])));
    expect(plan.deletedIds).toEqual(['new']);
    expect(plan.reservations[0]).toMatchObject({ id: 'existing', version: 4, restoredStateVersion: 3 });
  });
  it('undoes a creation without expanding its scope to other series members', () => {
    const original = { ...row('a'), serieRecurrente: 'series' };
    const later = { ...row('later'), serieRecurrente: 'series' };
    const plan = buildAuditRestorePlan(log({ action: 'CREATE', newState: original }), new Map([['a', original], ['later', later]]));
    expect(plan.deletedIds).toEqual(['a']);
  });
  it('blocks later edits and later deletions', () => {
    const entry = log({ previousState: row('a'), newState: row('a', 2) });
    expect(() => buildAuditRestorePlan(entry, new Map([['a', row('a', 3)]]))).toThrow(/posteriores/);
    expect(() => buildAuditRestorePlan(entry, new Map())).toThrow(/eliminada posteriormente/);
  });
  it('checks legacy state content so a confirmed legacy snapshot cannot overwrite the next edit', () => {
    const entry = log({ snapshotVersion: undefined, previousState: row('a'), newState: row('a', 2) });
    expect(() => buildAuditRestorePlan(entry, new Map([['a', { ...row('a', 3), descripcion: 'Cambio posterior' }]]))).toThrow(/posteriores/);
    expect(buildAuditRestorePlan(entry, new Map([['a', row('a', 2)]])).expectedVersions).toEqual({ a: 2 });
  });
  it('allows sequential undo using restored state lineage while guarding the actual live version', () => {
    const live = { ...row('a', 4), restoredStateVersion: 2 };
    const plan = buildAuditRestorePlan(log({ previousState: row('a'), newState: row('a', 2) }), new Map([['a', live]]));
    expect(plan.expectedVersions).toEqual({ a: 4 });
    expect(plan.reservations[0]).toMatchObject({ version: 4, restoredStateVersion: 1 });
  });
  it('blocks recovery when a deleted ID is occupied again', () => {
    expect(() => buildAuditRestorePlan(log({ action: 'DELETE', previousState: row('a') }), new Map([['a', row('a')]]))).toThrow(/ya existe/);
  });
  it('supports authorized deletions and rejects baseline and unsupported records', () => {
    expect(buildAuditRestorePlan(log({ action: 'AUTHORIZE_DELETE', previousState: [row('a'), row('b')] }), new Map()).affectedCount).toBe(2);
    expect(canRestoreAuditEntry(log({ id: 'AUDIT_BASELINE_a', action: 'BULK_IMPORT' }))).toBe(false);
    expect(canRestoreAuditEntry(log({ action: 'REQUEST_DELETE' }))).toBe(false);
    expect(canRestoreAuditEntry(log({ reservaId: 'GMAIL_DISPATCH', affectedCount: 0 }))).toBe(false);
    expect(canRestoreAuditEntry(log({ isReverted: true }))).toBe(false);
  });
  it('rejects incomplete legacy arrays, missing snapshots and placeholder attachments', () => {
    expect(() => buildAuditRestorePlan(log({ snapshotVersion: undefined, action: 'DELETE_SERIES', previousState: Array.from({ length: 25 }, (_, i) => row(String(i))) }), new Map())).toThrow(/incompleto/);
    expect(() => buildAuditRestorePlan(log({ previousState: row('a') }), new Map())).toThrow(/respaldo completo/);
    const attached = { ...row('a'), cartaCompromisoAdjunta: { dataUrl: '[ATTACHMENT_carta.pdf]' } } as Reservation;
    expect(() => buildAuditRestorePlan(log({ action: 'DELETE', snapshotVersion: undefined, previousState: attached }), new Map())).toThrow(/incompleto/);
  });
});
