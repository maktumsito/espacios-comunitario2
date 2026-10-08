// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Reservation } from '../../types';
import { buildReplacementBatch } from '../../utils/reservationReplacement';

const memory = vi.hoisted(() => ({ rows: new Map<string, any>(), fail: false, loseAck: false, beforeCommit: undefined as (() => void) | undefined, commits: 0 }));
vi.mock('firebase/firestore', async original => {
  const sdk = await original<any>();
  const snapshot = (path: string) => ({ id: path.split('/').at(-1), exists: () => memory.rows.has(path), data: () => structuredClone(memory.rows.get(path)) });
  return { ...sdk, doc: (_db: any, collection: string, id: string) => `${collection}/${id}`,
    getDoc: async (path: string) => snapshot(path),
    runTransaction: async (_db: any, callback: any) => {
      memory.beforeCommit?.();
      const writes = new Map<string, any>();
      const deleted = new Set<string>();
      const value = await callback({ get: async (path: string) => snapshot(path), set: (path: string, row: any) => writes.set(path, structuredClone(row)),
        update: (path: string, patch: any) => writes.set(path, { ...memory.rows.get(path), ...structuredClone(patch) }), delete: (path: string) => deleted.add(path) });
      if (memory.fail) throw new Error('Sin conexión');
      writes.forEach((row, path) => memory.rows.set(path, row));
      deleted.forEach(path => memory.rows.delete(path));
      memory.commits++;
      if (memory.loseAck) { memory.loseAck = false; throw new Error('Confirmación perdida'); }
      return value;
    },
  };
});

function restoreOptions(logId = 'audit') {
  memory.rows.set(`audit_logs/${logId}`, { id: logId, isReverted: false });
  return { requireAtomic: true, operationId: `RESTORE_${logId}`,
    auditRestore: { logId, actor: 'Admin', timestamp: '2026-10-08T14:00:00Z',
      log: { id: `RESTORE_LOG_${logId}`, timestamp: '2026-10-08T14:00:00Z', user: 'Admin', action: 'RESTORE' as const,
        description: 'Restauración', reservaId: original.id } } };
}
describe('atomic audit restoration', () => {
  it('recovers a deleted row and its availability together with audit status', async () => {
    await writeReservations({} as any, [], clean, { deletedIds: [original.id] });
    await writeReservations({} as any, [{ ...original, version: 0, restoredStateVersion: 1 }], clean,
      { ...restoreOptions(), expectedVersions: { original: -1 } });
    expect(memory.rows.get('reservas/original')).toMatchObject({ version: 1, restoredStateVersion: 1 });
    expect(memory.rows.get('audit_logs/audit')).toMatchObject({ isReverted: true, restoreOperationId: 'RESTORE_audit' });
    expect(memory.rows.get('audit_logs/RESTORE_LOG_audit').action).toBe('RESTORE');
    expect(memory.rows.get('schedule_slots/2026-10-06_SALA%202').bookings.map((b: any) => b.id)).toEqual(['original']);
  });
  it('does not mark audit reverted or modify reservations when persistence fails', async () => {
    const options = restoreOptions(); memory.fail = true;
    await expect(writeReservations({} as any, [{ ...original, descripcion: 'Restaurado' }], clean, options)).rejects.toThrow('Sin conexión');
    expect(memory.rows.get('audit_logs/audit').isReverted).toBe(false);
    expect(getPendingOperations()).toHaveLength(1);
    expect(memory.rows.has('audit_logs/RESTORE_LOG_audit')).toBe(false);
    expect(memory.rows.get('reservas/original')).toEqual(original);
  });
  it('blocks a recovery when another session reclaimed a deleted ID, even with version zero', async () => {
    memory.rows.delete('reservas/original');
    const options = { ...restoreOptions(), expectedVersions: { original: -1 } };
    memory.beforeCommit = () => memory.rows.set('reservas/original', { ...original, version: 0, descripcion: 'Ajena' });
    await expect(writeReservations({} as any, [{ ...original, version: 0 }], clean, options)).rejects.toThrow(/otro usuario/);
    expect(memory.rows.get('reservas/original').descripcion).toBe('Ajena');
    expect(memory.rows.get('audit_logs/audit').isReverted).toBe(false);
    expect(getPendingOperations()).toEqual([]);
  });
  it('undoes a replacement by deleting its exceptional booking and reactivating only the source', async () => {
    await writeReservations({} as any, batch(), clean);
    const source = memory.rows.get('reservas/original');
    const replacement = memory.rows.get('reservas/replacement');
    await writeReservations({} as any, [{ ...original, version: source.version }], clean,
      { ...restoreOptions(), deletedIds: ['replacement'], expectedVersions: { original: source.version, replacement: replacement.version } });
    expect(memory.rows.get('reservas/original')).toMatchObject({ estado: 'activa', version: 3 });
    expect(memory.rows.get('reservas/original').reemplazadaPorReservaId).toBeUndefined();
    expect(memory.rows.has('reservas/replacement')).toBe(false);
    expect(memory.rows.get('schedule_slots/2026-10-06_SALA%202').bookings.map((b: any) => b.id)).toEqual(['original']);
  });
  it('recovers a deleted linked pair without breaking replacement integrity', async () => {
    const created = (await writeReservations({} as any, batch(), clean)).reservations;
    await writeReservations({} as any, [], clean, { deletedIds: created.map(r => r.id) });
    await writeReservations({} as any, created.map(r => ({ ...r, version: 0 })), clean,
      { ...restoreOptions(), expectedVersions: { original: -1, replacement: -1 } });
    expect(memory.rows.get('reservas/original')).toMatchObject({ estado: 'cancelada', reemplazadaPorReservaId: 'replacement' });
    expect(memory.rows.get('reservas/replacement')).toMatchObject({ reemplazaReservaId: 'original', estado: 'activa' });
  });
  it('retries a lost acknowledgement for a deletion-only restore without duplicating audit writes', async () => {
    const options = { ...restoreOptions(), deletedIds: [original.id], expectedVersions: { original: 1 } };
    memory.loseAck = true;
    await expect(writeReservations({} as any, [], clean, options)).rejects.toThrow('Confirmación perdida');
    await writeReservations({} as any, [], clean, options);
    expect(memory.rows.has('reservas/original')).toBe(false);
    expect(memory.rows.get('audit_logs/audit').isReverted).toBe(true);
    expect(getPendingOperations()).toEqual([]);
  });
  it('rejects a competing restoration before modifying any reservation', async () => {
    const options = restoreOptions();
    memory.beforeCommit = () => memory.rows.set('audit_logs/audit', { isReverted: true, restoreOperationId: 'foreign' });
    await expect(writeReservations({} as any, [{ ...original, descripcion: 'Restaurado' }], clean, options)).rejects.toThrow(/otra sesión/);
    expect(memory.rows.get('reservas/original')).toEqual(original);
    expect(getPendingOperations()).toEqual([]);
  });
  it('keeps a later recreated row in the returned cache state when acknowledging a completed restore', async () => {
    const options = { ...restoreOptions(), deletedIds: [original.id], expectedVersions: { original: 1 } };
    memory.loseAck = true;
    await expect(writeReservations({} as any, [], clean, options)).rejects.toThrow('Confirmación perdida');
    seed({ ...original, descripcion: 'Reserva posterior' });
    const result = await writeReservations({} as any, [], clean, options);
    expect(result.reservations[0].descripcion).toBe('Reserva posterior');
    expect(memory.rows.get('reservas/original').descripcion).toBe('Reserva posterior');
  });
  it('clears restored lineage after an ordinary edit so older undo cannot overwrite it', async () => {
    memory.rows.set('reservas/original', { ...original, restoredStateVersion: 0 });
    await writeReservations({} as any, [{ ...original, restoredStateVersion: 0, descripcion: 'Edición posterior' }], clean);
    expect(memory.rows.get('reservas/original').restoredStateVersion).toBeUndefined();
  });
});
import { getPendingOperations, reservationSlots, writeReservations } from '../reservationWriter';

const original: Reservation = { id: 'original', fecha: '2026-10-06', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2', responsable: 'Vecino', descripcion: 'Taller semanal', tipoActividad: 'Taller', actividadRecurrente: 'Sí', serieRecurrente: 'serie', estado: 'activa', version: 1 };
const clean = (row: Reservation) => JSON.parse(JSON.stringify(row));
const batch = () => buildReplacementBatch(original, { ...original, descripcion: 'Reunión excepcional' }, 'replacement', 'Reunión de vecinos').updatedReservations;
function seed(row: Reservation) {
  memory.rows.set(`reservas/${row.id}`, clean(row));
  for (const [key, slot] of reservationSlots(row)) {
    const path = `schedule_slots/${key}`;
    memory.rows.set(path, { ...slot, bookings: [...(memory.rows.get(path)?.bookings || []), ...slot.bookings] });
  }
}
beforeEach(() => { localStorage.clear(); memory.rows.clear(); memory.fail = false; memory.loseAck = false; memory.beforeCommit = undefined; memory.commits = 0; seed(original); });
describe('single occurrence replacement transaction', () => {
  it('does not start a cloud transaction when durable local recovery storage is unavailable', async () => {
    const existing = { id: 'other-pending', reservations: [original], deletedIds: [], confirmedIds: [], allowConflictOverride: false };
    localStorage.setItem('reservation_pending_operations_v1', JSON.stringify([existing]));
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    try {
      await expect(writeReservations({} as any, batch(), clean)).rejects.toThrow(/No hay espacio local/);
      expect(memory.commits).toBe(0);
      expect(memory.rows.get('reservas/original')).toEqual(original);
      expect(getPendingOperations()).toEqual([existing]);
    } finally { setItem.mockRestore(); }
  });
  it('rejects deletion if a session changed after the editor opened', async () => {
    const future = { ...original, id: 'future', fecha: '2026-10-13' }; seed(future);
    memory.rows.set('reservas/future', { ...future, descripcion: 'Edición ajena', version: 2 });
    await expect(writeReservations({} as any, [{ ...original, descripcion: 'Edición propia' }], clean,
      { deletedIds: [future.id], expectedVersions: { original: 1, future: 1 }, requireAtomic: true })).rejects.toThrow(/otro usuario/);
    expect(memory.rows.get('reservas/original')).toEqual(original);
    expect(memory.rows.get('reservas/future').descripcion).toBe('Edición ajena');
    expect(memory.commits).toBe(0);
  });
  it('guards the source version even when only other selected sessions are updated', async () => {
    const future = { ...original, id: 'future', fecha: '2026-10-13' }; seed(future);
    memory.beforeCommit = () => memory.rows.set('reservas/original', { ...original, version: 2 });
    await expect(writeReservations({} as any, [{ ...future, descripcion: 'Cambio' }], clean,
      { expectedVersions: { original: 1, future: 1 }, requireAtomic: true })).rejects.toThrow(/otro usuario/);
    expect(memory.rows.get('reservas/future')).toEqual(future);
    expect(memory.commits).toBe(0);
  });
  it('retries an acknowledged deletion safely without advancing the surviving version twice', async () => {
    const future = { ...original, id: 'future', fecha: '2026-10-13' }; seed(future);
    const rows = [{ ...original, descripcion: 'Actualizado' }];
    const options = { deletedIds: [future.id], expectedVersions: { original: 1, future: 1 }, requireAtomic: true };
    memory.loseAck = true;
    await expect(writeReservations({} as any, rows, clean, options)).rejects.toThrow('Confirmación perdida');
    await writeReservations({} as any, rows, clean, options);
    expect(memory.rows.get('reservas/original').version).toBe(2);
    expect(memory.rows.has('reservas/future')).toBe(false);
    expect(getPendingOperations()).toEqual([]);
  });
  it('does not recreate an already removed legacy occurrence during a movement', async () => {
    const removed = { ...original, id: 'removed', version: 0, espacio: 'SALA 3' };
    await expect(writeReservations({} as any,[removed],clean,{intent:'update',requireAtomic:true})).rejects.toThrow(/eliminada por otro usuario/);
    expect(memory.rows.has('reservas/removed')).toBe(false);
  });
  it('rejects an oversized atomic movement before any chunk is written', async () => {
    const rows=Array.from({length:500},(_,i)=>({...original,id:`move-${i}`,version:0,espacio:`ROOM ${i}`}));
    await expect(writeReservations({} as any,rows,clean,{requireAtomic:true})).rejects.toThrow(/atómico/);
    expect(memory.commits).toBe(0);expect(memory.rows.has('reservas/move-0')).toBe(false);
    expect(getPendingOperations()).toEqual([]);
  });
  it('suspends only the original, links both records and swaps availability in one commit', async () => {
    const future = { ...original, id: 'future', fecha: '2026-10-13' }; seed(future);
    await writeReservations({} as any, batch(), clean);
    expect(memory.commits).toBe(1);
    expect(memory.rows.get('reservas/original')).toMatchObject({ estado: 'cancelada', reemplazadaPorReservaId: 'replacement', version: 2 });
    expect(memory.rows.get('reservas/replacement')).toMatchObject({ estado: 'activa', reemplazaReservaId: 'original', actividadRecurrente: 'No', version: 1 });
    expect(memory.rows.get('reservas/replacement').serieRecurrente).toBeUndefined();
    expect(memory.rows.get('schedule_slots/2026-10-06_SALA%202').bookings.map((b: any) => b.id)).toEqual(['replacement']);
    expect(memory.rows.get('reservas/future')).toEqual(future);
    expect(getPendingOperations()).toEqual([]);
  });
  it('does not suspend the original if the transaction fails', async () => {
    memory.fail = true;
    await expect(writeReservations({} as any, batch(), clean)).rejects.toThrow('Sin conexión');
    expect(memory.rows.get('reservas/original')).toEqual(original);
    expect(memory.rows.has('reservas/replacement')).toBe(false);
    expect(getPendingOperations()).toHaveLength(1);
  });
  it('rejects another booking and preserves both source and availability', async () => {
    seed({ ...original, id: 'occupied', actividadRecurrente: 'No' });
    await expect(writeReservations({} as any, batch(), clean)).rejects.toThrow(/Conflicto/);
    expect(memory.rows.get('reservas/original').estado).toBe('activa');
    expect(memory.rows.has('reservas/replacement')).toBe(false);
  });
  it('rechecks the original version inside the transaction', async () => {
    memory.beforeCommit = () => memory.rows.set('reservas/original', { ...original, version: 2 });
    await expect(writeReservations({} as any, batch(), clean)).rejects.toThrow(/otro usuario/);
    expect(memory.rows.has('reservas/replacement')).toBe(false);
  });
  it('does not recreate a removed legacy source with version zero', async () => {
    memory.rows.delete('reservas/original');
    const rows = buildReplacementBatch({ ...original, version: 0 }, original, 'replacement', 'Motivo').updatedReservations;
    await expect(writeReservations({} as any, rows, clean)).rejects.toThrow(/suspensión|sesión activa/);
    expect(memory.rows.has('reservas/replacement')).toBe(false);
  });
  it('rejects a second replacement even when using the current source version', async () => {
    await writeReservations({} as any, batch(), clean);
    const rows = batch(); rows[0].version = 2; rows[0].reemplazadaPorReservaId = 'second'; rows[1].id = 'second';
    await expect(writeReservations({} as any, rows, clean)).rejects.toThrow(/vínculo|sesión activa/);
    expect(memory.rows.has('reservas/second')).toBe(false);
  });
  it('retries a lost acknowledgment without creating another replacement or duplicate slots', async () => {
    memory.loseAck = true;
    await expect(writeReservations({} as any, batch(), clean)).rejects.toThrow('Confirmación perdida');
    await writeReservations({} as any, batch(), clean);
    expect(memory.rows.size).toBe(3);
    expect(memory.rows.get('reservas/original').version).toBe(2);
    expect(memory.rows.get('schedule_slots/2026-10-06_SALA%202').bookings.map((b: any) => b.id)).toEqual(['replacement']);
    expect(getPendingOperations()).toEqual([]);
  });
  it('blocks reactivation even with conflict override, then allows it after cancellation of the replacement', async () => {
    await writeReservations({} as any, batch(), clean);
    const source = memory.rows.get('reservas/original');
    await expect(writeReservations({} as any, [{ ...source, estado: 'activa' }], clean, { allowConflictOverride: true })).rejects.toThrow(/horario sigue ocupado/);
    await writeReservations({} as any, [{ ...memory.rows.get('reservas/replacement'), estado: 'cancelada' }], clean);
    expect(memory.rows.get('reservas/original').estado).toBe('cancelada');
    await writeReservations({} as any, [{ ...source, estado: 'activa' }], clean);
    expect(memory.rows.get('reservas/original').estado).toBe('activa');
  });
  it('rejects suspension without its new replacement and disallows override during replacement', async () => {
    await expect(writeReservations({} as any, [batch()[0]], clean)).rejects.toThrow(/guardarse junto/);
    await expect(writeReservations({} as any, batch(), clean, { allowConflictOverride: true })).rejects.toThrow(/sin solapamientos/);
    expect(memory.rows.get('reservas/original').estado).toBe('activa');
  });
});
