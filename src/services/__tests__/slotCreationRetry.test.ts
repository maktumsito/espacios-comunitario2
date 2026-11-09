// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import type { Reservation } from '../../types';

const state = vi.hoisted(() => ({ attempts: 0, failures: 0, code: 6, creates: 0, updates: [] as any[], rows: new Map<string, any>() }));
vi.mock('../../firebase/gateway', async original => {
  const actual = await original<typeof import('../../firebase/gateway')>();
  const snapshot = (path: string) => ({ id: path.split('/').at(-1), exists: () => state.rows.has(path), data: () => structuredClone(state.rows.get(path)),
    __native: { updateTime: state.rows.has(path) ? { seconds: 1, nanoseconds: 0 } : undefined } });
  return { ...actual, usesDataApi: () => false,
    doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
    getDoc: async (path: string) => snapshot(path),
    runTransaction: async (_db: unknown, callback: any) => {
      state.attempts++;
      const writes = new Map<string, any>();
      const result = await callback({
        get: async (path: string) => snapshot(path),
        set: (path: string, value: any) => writes.set(path, structuredClone(value)),
        __native: {
          create: (path: string, value: any) => { state.creates++; writes.set(path, structuredClone(value)); },
          update: (path: string, value: any, precondition: any) => { state.updates.push(precondition); writes.set(path, { ...state.rows.get(path), ...structuredClone(value) }); },
        },
      });
      if (state.failures-- > 0) throw Object.assign(new Error('Commit rejected'), { code: state.code });
      writes.forEach((value, path) => state.rows.set(path, value));
      return result;
    },
  };
});
vi.mock('../reservationOperationJournal', () => ({ readPendingOperations: async () => [], updateOperationJournal: async () => {}, getPendingOperations: () => [] }));
import { writeReservations } from '../reservationWriter';
const row: Reservation = { id: 'new', fecha: '2026-11-10', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2',
  responsable: 'Persona', descripcion: 'Actividad', tipoActividad: 'Taller', actividadRecurrente: 'No', estado: 'activa', version: 0 };
beforeEach(() => { state.attempts = 0; state.failures = 0; state.code = 6; state.creates = 0; state.updates = []; state.rows.clear(); localStorage.clear(); });
it('retries the whole transaction after an atomic slot creation collision', async () => {
  state.failures = 1;
  const progress = vi.fn();
  const result = await writeReservations({} as any, [row], value => value, { onProgress: progress });
  expect(state.attempts).toBe(2);
  expect(state.creates).toBe(2);
  expect(result.confirmedIds).toEqual(['new']);
  expect(state.rows.get('reservas/new').version).toBe(1);
  expect(state.rows.get('schedule_slots/2026-11-10_SALA%202').bookings.map((booking: any) => booking.id)).toEqual(['new']);
  expect(progress).toHaveBeenCalledOnce();
});
it('bounds slot creation retries without publishing unconfirmed reservations', async () => {
  state.failures = Infinity;
  const progress = vi.fn();
  await expect(writeReservations({} as any, [row], value => value, { onProgress: progress })).rejects.toThrow('Commit rejected');
  expect(state.attempts).toBe(5);
  expect(state.rows.size).toBe(0);
  expect(progress).not.toHaveBeenCalled();
});
it('does not add retries for unrelated transaction failures', async () => {
  state.failures = 1; state.code = 14;
  await expect(writeReservations({} as any, [row], value => value)).rejects.toThrow('Commit rejected');
  expect(state.attempts).toBe(1);
  expect(state.rows.size).toBe(0);
});
it.each([5, 9])('retries an existing slot whose write precondition fails with code %s', async code => {
  state.rows.set('schedule_slots/2026-11-10_SALA%202', { fecha: row.fecha, espacio: row.espacio, bookings: [] });
  state.failures = 1; state.code = code;
  await writeReservations({} as any, [row], value => value);
  expect(state.attempts).toBe(2);
  expect(state.creates).toBe(0);
  expect(state.updates).toEqual(Array.from({ length: 2 }, () => ({ lastUpdateTime: { seconds: 1, nanoseconds: 0 } })));
  expect(state.rows.get('reservas/new').version).toBe(1);
});
