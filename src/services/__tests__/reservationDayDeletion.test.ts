// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import type { Reservation } from '../../types';

const reads = vi.hoisted(() => ({ getDocs: vi.fn(), db: {} as any, where: vi.fn() }));
vi.mock('../../firebase/config', () => ({ getDb: () => reads.db }));
vi.mock('../../firebase/gateway', async original => ({
  ...await original<any>(),
  collection: (_db: unknown, path: string) => ({ path }),
  query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
  where: reads.where,
  getDocs: reads.getDocs,
}));
import { queryReservationsForDayDeletion, recordDeletedId } from '../reservationService';

const row: Reservation = { id: 'one', fecha: '2026-10-06', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2', responsable: 'Vecino', tipoActividad: 'Taller', descripcion: '', actividadRecurrente: 'No', estado: 'activa', version: 2 };
function snapshot(rows: Reservation[], fromCache = false) {
  const docs = rows.map(row => ({ id: row.id, data: () => row }));
  return { metadata: { fromCache }, forEach: (fn: (doc: any) => void) => docs.forEach(fn) };
}
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); reads.db = {}; });

it('queries all spaces on the precise date, includes cancelled reservations and ignores local deletion history', async () => {
  recordDeletedId(row.id);
  reads.getDocs.mockResolvedValue(snapshot([row, { ...row, id: 'cancelled', estado: 'cancelada', espacio: 'SALA 3' }, { ...row, id: 'deleted', estado: 'eliminada' }]));
  expect((await queryReservationsForDayDeletion(row.fecha)).map(row => row.id)).toEqual(['one', 'cancelled']);
  expect(reads.where).toHaveBeenCalledExactlyOnceWith('fecha', '==', row.fecha);
});

it('rejects cached snapshots and read failures without treating them as an empty day', async () => {
  reads.getDocs.mockResolvedValueOnce(snapshot([], true)).mockRejectedValueOnce(new Error('Sin conexión'));
  await expect(queryReservationsForDayDeletion(row.fecha)).rejects.toThrow('Conéctate');
  await expect(queryReservationsForDayDeletion(row.fecha)).rejects.toThrow('Sin conexión');
});

it.each(['', '2026-02-30', '06-10-2026', '2026-10-06T00:00:00'])('rejects invalid or ambiguous dates (%s) before reading', async fecha => {
  await expect(queryReservationsForDayDeletion(fecha)).rejects.toThrow('fecha válida');
  expect(reads.getDocs).not.toHaveBeenCalled();
});

it('rejects a missing connection and returns a verified empty day', async () => {
  reads.db = undefined;
  await expect(queryReservationsForDayDeletion(row.fecha)).rejects.toThrow('No hay conexión');
  reads.db = {};
  reads.getDocs.mockResolvedValue(snapshot([]));
  await expect(queryReservationsForDayDeletion(row.fecha)).resolves.toEqual([]);
});
