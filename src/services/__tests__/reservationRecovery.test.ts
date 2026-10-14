// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import type { Reservation } from '../../types';
import { writeReservations } from '../reservationWriter';
import { readPendingOperations, updateOperationJournal } from '../reservationOperationJournal';
import { discardReservationOperation, resumeReservationOperation } from '../reservationService';
import { saveAuthUser } from '../authService';

const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../firebase/gateway', async original => ({
  ...await original<any>(), usesDataApi: () => true, reservationRequest: api.request,
}));
const row: Reservation = { id: 'one', fecha: '2026-10-15', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2', responsable: 'Vecino', tipoActividad: 'Taller', descripcion: 'Actividad de prueba', actividadRecurrente: 'No', version: 0 };
const operation = () => ({ id: 'pending', actor: 'test', reservations: [row], deletedIds: [], confirmedIds: [] as string[], allowConflictOverride: false });
const result = (confirmedIds: string[] = []) => ({ operationId: 'pending', confirmedIds, deletedIds: [], pendingIds: confirmedIds.length ? [] : [row.id], reservations: [] });
beforeEach(() => {
  localStorage.clear(); api.request.mockReset();
  saveAuthUser({ username: 'test', name: 'Test', role: 'Administrador', initials: 'T', avatarColor: 'blue' });
});

it('removes a definitively rejected HTTP write from durable recovery storage', async () => {
  api.request.mockResolvedValue({ result: result(), error: 'Conflicto de horario', discardPending: true });
  await expect(writeReservations({} as any, [row], r => r, { actor: 'test', intent: 'create' })).rejects.toThrow('Conflicto');
  expect(await readPendingOperations()).toEqual([]);
});

it('clears an old rejected retry after the server confirms it cannot be replayed', async () => {
  await updateOperationJournal(operation());
  api.request.mockResolvedValue({ result: result(), error: 'Versión desactualizada', discardPending: true });
  await expect(writeReservations({} as any, [row], r => r, { actor: 'test', operationId: 'pending' })).rejects.toThrow('Versión');
  expect(await readPendingOperations()).toEqual([]);
});

it('retains payload and operation ID when the HTTP acknowledgement is lost', async () => {
  api.request.mockRejectedValue(new Error('Se perdió la conexión'));
  await expect(writeReservations({} as any, [row], r => r, { actor: 'test', operationId: 'pending' })).rejects.toThrow('conexión');
  expect(await readPendingOperations()).toMatchObject([operation()]);
});

it('keeps a partial operation recoverable even if the remaining group is rejected', async () => {
  const other = { ...row, id: 'two', espacio: 'SALA 3' };
  await updateOperationJournal({ ...operation(), reservations: [row, other], confirmedIds: ['one'] });
  api.request.mockResolvedValue({ result: { ...result(['one']), pendingIds: ['two'] }, error: 'Conflicto', discardPending: true });
  await expect(writeReservations({} as any, [other], r => r, { actor: 'test', operationId: 'pending' })).rejects.toThrow('Conflicto');
  expect((await readPendingOperations())[0].confirmedIds).toEqual(['one']);
  expect(api.request.mock.calls[0][0].reservations.map((r: Reservation) => r.id)).toEqual(['one', 'two']);
});

it('removes an already confirmed journal entry on resume without requesting another write', async () => {
  await updateOperationJournal({ ...operation(), deletedIds: ['deleted'], confirmedIds: ['one', 'deleted'] });
  expect((await resumeReservationOperation('pending')).pendingIds).toEqual([]);
  expect(await readPendingOperations()).toEqual([]);
  expect(api.request).not.toHaveBeenCalled();
});

it('discards only the selected local retry and preserves the other pending entries', async () => {
  await updateOperationJournal(operation());
  await updateOperationJournal({ ...operation(), id: 'other' });
  await discardReservationOperation('pending');
  expect((await readPendingOperations()).map(o => o.id)).toEqual(['other']);
  expect(api.request).not.toHaveBeenCalled();
});

it('prevents discarding another account’s pending operation', async () => {
  await updateOperationJournal({ ...operation(), actor: 'other' });
  await expect(discardReservationOperation('pending')).rejects.toThrow('permisos');
  expect(await readPendingOperations()).toHaveLength(1);
});
