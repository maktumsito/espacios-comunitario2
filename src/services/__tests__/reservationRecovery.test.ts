// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import type { Reservation } from '../../types';
import { writeReservations } from '../reservationWriter';
import { readPendingOperations, updateOperationJournal } from '../reservationOperationJournal';
import { discardReservationOperation, resumeReservationOperation } from '../reservationService';
import { saveAuthUser } from '../authService';
import { DataApiError } from '../../firebase/gateway';

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

it('releases an atomic distribution retry after a definitive HTTP permission rejection', async () => {
  api.request.mockRejectedValue(new DataApiError('No tienes permiso para esta operación.', 403));
  await expect(writeReservations({} as any, [row], r => r, { actor: 'test', operationId: 'distribution-rejected', requireAtomic: true, distributionDate: row.fecha, expectedVersions: { [row.id]: -1 } })).rejects.toMatchObject({ discardPending: true });
  expect(await readPendingOperations()).toEqual([]);
});

it('retains previously confirmed groups if a later HTTP request loses permission', async () => {
  const other = { ...row, id: 'two', espacio: 'SALA 3' };
  await updateOperationJournal({ ...operation(), reservations: [row, other], confirmedIds: ['one'] });
  api.request.mockRejectedValue(new DataApiError('No tienes permiso para esta operación.', 403));
  await expect(writeReservations({} as any, [other], r => r, { actor: 'test', operationId: 'pending' })).rejects.toMatchObject({ discardPending: false });
  expect((await readPendingOperations())[0].confirmedIds).toEqual(['one']);
});

it('retains all eight pending deletions and their version guards when Firestore cannot verify access due to quota', async () => {
  const deletedIds = Array.from({ length: 8 }, (_, index) => `yoga-${index}`);
  const expectedVersions = Object.fromEntries(deletedIds.map(id => [id, 3]));
  api.request.mockRejectedValue(new DataApiError('Firestore alcanzó su cuota de uso.', 503, 'auth-backend-quota-exceeded', 60_000));
  await expect(writeReservations({} as any, [], r => r, { actor: 'test', operationId: 'yoga-delete', deletedIds, expectedVersions })).rejects.toThrow('cuota');
  expect(await readPendingOperations()).toMatchObject([{ id: 'yoga-delete', reservations: [], deletedIds, expectedVersions, confirmedIds: [] }]);
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
