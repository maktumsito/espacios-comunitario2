import type { Reservation, BatchUpdateInfo } from '../types';
import { isSingleDayMultiSpaceReservation } from '../types';
import { isReservationActiveForAvailability } from './conflictDetector';
import { normalizeSpaceName } from '../data/spacesData';

export function canReplaceOccurrence(original: Reservation): boolean {
  return Boolean((original.serieRecurrente || original.recurrenteId) &&
    !isSingleDayMultiSpaceReservation(original) &&
    !original.reemplazadaPorReservaId && !original.reemplazaReservaId &&
    isReservationActiveForAvailability(original));
}

export function sameReplacementSlot(a: Reservation, b: Reservation): boolean {
  return a.fecha === b.fecha && normalizeSpaceName(a.espacio) === normalizeSpaceName(b.espacio) &&
    a.horaInicio === b.horaInicio && a.horaFin === b.horaFin &&
    Boolean(a.terminaDiaSiguiente) === Boolean(b.terminaDiaSiguiente);
}

export function buildReplacementBatch(original: Reservation, replacement: Reservation, id: string, reason: string): BatchUpdateInfo {
  const motivo = reason.trim();
  if (!canReplaceOccurrence(original)) throw new Error('Esta sesión ya no está disponible para reemplazar.');
  if (!motivo) throw new Error('Indica el motivo del reemplazo.');
  if (id === original.id || !sameReplacementSlot(original, replacement)) throw new Error('El reemplazo debe conservar la fecha, el espacio y el horario originales.');
  const next: Reservation = {
    ...replacement, id, version: 0, estado: 'activa', actividadRecurrente: 'No',
    serieRecurrente: undefined, recurrenteId: undefined, indiceEnSerie: undefined, totalEnSerie: undefined,
    tipoRecurrencia: undefined, diasSemana: undefined, fechaInicioRecurrencia: undefined, fechaFinRecurrencia: undefined,
    reemplazaReservaId: original.id, reemplazadaPorReservaId: undefined, motivoReemplazo: motivo,
    googleEventId: undefined, realizada: 'No',
  };
  return {
    scope: 'single', replacementOriginal: original,
    updatedReservations: [{ ...original, estado: 'cancelada', reemplazadaPorReservaId: id, motivoReemplazo: motivo }, next],
    affectedIds: [original.id],
    description: `Reemplazada solo la sesión '${original.descripcion}' del ${original.fecha} por '${next.descripcion}'. Motivo: ${motivo}`,
  };
}

/** Series regeneration must preserve the exception, even if its replacement was cancelled. */
export function preserveReplacementExceptions(incoming: Reservation[], history: Reservation[]): Reservation[] {
  const exceptions = history.filter(r => r.reemplazadaPorReservaId);
  return incoming.filter(r => !exceptions.some(e => {
    const series = e.serieRecurrente || e.recurrenteId;
    return e.id === r.id || Boolean(series && (r.serieRecurrente || r.recurrenteId) === series && e.fecha === r.fecha);
  }));
}
