import type { DeleteScope, Reservation } from '../types';

export function selectReservationsToDelete(
  reservation: Reservation, scope: DeleteScope, rows: readonly Reservation[]
): Reservation[] {
  if (scope === 'single') return rows.filter(row => row.id === reservation.id);
  const seriesId = reservation.serieRecurrente || reservation.recurrenteId;
  if (!seriesId) throw new Error('Esta reserva no tiene un identificador de serie.');
  return rows.filter(row => row.estado !== 'eliminada' &&
    (row.serieRecurrente === seriesId || row.recurrenteId === seriesId) &&
    (scope !== 'future' || row.fecha >= reservation.fecha));
}
