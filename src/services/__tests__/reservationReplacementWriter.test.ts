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
      const value = await callback({ get: async (path: string) => snapshot(path), set: (path: string, row: any) => writes.set(path, structuredClone(row)), delete: (path: string) => deleted.add(path) });
      if (memory.fail) throw new Error('Sin conexión');
      writes.forEach((row, path) => memory.rows.set(path, row));
      deleted.forEach(path => memory.rows.delete(path));
      memory.commits++;
      if (memory.loseAck) { memory.loseAck = false; throw new Error('Confirmación perdida'); }
      return value;
    },
  };
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
