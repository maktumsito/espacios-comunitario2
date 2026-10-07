import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { Reservation } from '../../types';
const state = vi.hoisted(() => ({ rows: new Map<string, any>(), commits: 0, fail: false }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: any, collection: string, id: string) => `${collection}/${id}`,
  runTransaction: async (_db: any, callback: any) => {
    const changes = new Map<string, any>();
    const value = await callback({
      get: async (path: string) => ({ id: path.split('/').at(-1), exists: () => state.rows.has(path), data: () => structuredClone(state.rows.get(path)) }),
      update: (path: string, patch: any) => changes.set(path, { ...state.rows.get(path), ...patch }),
      set: (path: string, value: any) => changes.set(path, value),
    });
    if (state.fail) throw new Error('Sin conexión');
    if (changes.size) state.commits++;
    changes.forEach((value, path) => state.rows.set(path, structuredClone(value)));
    return value;
  },
}));
import { planIndependentReservationGroups, applyIndependentReservationGroup, groupingPatch } from '../migrations/groupIndependentReservations';

const first: Reservation = { id: 'first', fecha: '2026-10-13', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2',
  responsable: 'Vecino', descripcion: 'Taller semanal', tipoActividad: 'Taller', actividadRecurrente: 'No', estado: 'activa', version: 2,
  googleEventId: 'google-first', cartaCompromisoAdjunta: { name: 'carta', type: 'application/pdf', size: 10, dataUrl: 'adjunto', uploadedAt: 'fecha' } };
const second: Reservation = { ...first, id: 'second', fecha: '2026-10-27', espacio: 'SALA 3', responsable: 'Otra persona', googleEventId: 'google-second' };
const plan = (rows: Reservation[]) => planIndependentReservationGroups(rows, '2026-10-06', () => 'SER_group');
beforeEach(() => { state.rows.clear(); state.commits = 0; state.fail = false; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-06T15:00:00Z')); });
afterEach(() => vi.useRealTimers());
it('groups matching names, weekdays and both hours across dates, preserving gaps and different rooms', () => {
  const group = plan([second, first])[0];
  expect(group.reservations.map(row => row.id)).toEqual(['first', 'second']);
  expect(groupingPatch(group, second)).toMatchObject({ actividadRecurrente: 'Sí', serieRecurrente: 'SER_group', recurrenteId: 'SER_group',
    tipoRecurrencia: 'especificas', diasSemana: 'martes', totalEnSerie: 2, indiceEnSerie: 2, fechaInicioRecurrencia: first.fecha, fechaFinRecurrencia: second.fecha });
});
it('normalizes capitalization and whitespace without equating different activity names', () => {
  expect(plan([first, { ...second, descripcion: '  TALLER   SEMANAL  ' }])).toHaveLength(1);
  expect(plan([first, { ...second, descripcion: 'Taller semanal avanzado' }])).toHaveLength(0);
});
it('groups accents, punctuation and minor spelling variations without merging levels or qualifiers', () => {
  expect(plan([{ ...first, descripcion: 'Taller de Música' }, { ...second, descripcion: 'TALLER DE MUSICA.' }])).toHaveLength(1);
  expect(plan([first, { ...second, descripcion: 'Taller semnal' }])).toHaveLength(1);
  expect(plan([{ ...first, descripcion: 'Taller nivel 1' }, { ...second, descripcion: 'Taller nivel 2' }])).toEqual([]);
  expect(plan([{ ...first, descripcion: 'Yoga' }, { ...second, descripcion: 'Yoda' }])).toEqual([]);
});
it('supports reservations ending at midnight and produces stable groups in any input order', () => {
  const rows = [first, second].map(row => ({ ...row, horaInicio: '22:00', horaFin: '24:00' }));
  expect(plan(rows)).toHaveLength(1);
  expect(plan(rows)).toEqual(plan([...rows].reverse()));
});
it('does not group reservations just because they share the same exact date', () => {
  expect(plan([first, { ...second, fecha: first.fecha }])).toEqual([]);
});
it('separates different weekdays, end times and overnight schedules', () => {
  expect(plan([first, { ...second, fecha: '2026-10-28' }])).toEqual([]);
  expect(plan([first, { ...second, horaFin: '12:00' }])).toEqual([]);
  expect(plan([first, { ...second, terminaDiaSiguiente: true }])).toEqual([]);
});
it('preserves past records, established series, replacements, cancellations and deletion requests', () => {
  for (const patch of [{ fecha: '2026-09-29' },
    { estado: 'cancelada' }, { reemplazaReservaId: 'original' }, { reemplazadaPorReservaId: 'replacement' },
    { solicitudEliminacion: {} }, { tipoRecurrencia: 'doble_espacio' }]) {
    expect(plan([first, { ...second, ...patch } as Reservation])).toEqual([]);
  }
});
it('repairs one-member imported series while preserving genuine series including their past members', () => {
  const source = { ...first, actividadRecurrente: 'Sí', serieRecurrente: 'single-first' };
  const later = { ...second, actividadRecurrente: 'Sí', serieRecurrente: 'single-second' };
  expect(plan([source, later])).toHaveLength(1);
  const past = { ...source, id: 'past', fecha: '2026-09-29' };
  expect(plan([source, later, past])).toEqual([]);
});
it('updates only series metadata in one transaction with its audit entry', async () => {
  const group = plan([first, second])[0];
  [first, second].forEach(row => state.rows.set(`reservas/${row.id}`, row));
  state.rows.set('schedule_slots/existing', { bookings: ['first', 'second'] });
  expect(await applyIndependentReservationGroup({} as any, group, 'Solicitante')).toBe(true);
  expect(state.commits).toBe(1);
  expect(state.rows.get('reservas/second')).toMatchObject({ ...second, ...groupingPatch(group, second), version: 3 });
  expect(state.rows.get('schedule_slots/existing')).toEqual({ bookings: ['first', 'second'] });
  expect(state.rows.get('audit_logs/GROUP_SER_group').groupedReservationIds).toEqual(['first', 'second']);
  expect(await applyIndependentReservationGroup({} as any, group, 'Solicitante')).toBe(false);
  expect(state.commits).toBe(1);
});
it('rejects a changed legacy record even if it has no version', async () => {
  const rows = [first, second].map(row => ({ ...row, version: undefined }));
  const group = plan(rows)[0];
  rows.forEach(row => state.rows.set(`reservas/${row.id}`, row));
  state.rows.set('reservas/second', { ...rows[1], responsable: 'Edición ajena' });
  await expect(applyIndependentReservationGroup({} as any, group, 'Solicitante')).rejects.toThrow(/cambió/);
  expect(state.rows.get('reservas/first').serieRecurrente).toBeUndefined(); expect(state.commits).toBe(0);
});
it('does not create half a series or its audit record if commit fails', async () => {
  [first, second].forEach(row => state.rows.set(`reservas/${row.id}`, row)); state.fail = true;
  await expect(applyIndependentReservationGroup({} as any, plan([first, second])[0], 'Solicitante')).rejects.toThrow('Sin conexión');
  expect(state.rows.get('reservas/first')).toEqual(first); expect(state.rows.get('reservas/second')).toEqual(second);
  expect(state.rows.has('audit_logs/GROUP_SER_group')).toBe(false);
});
