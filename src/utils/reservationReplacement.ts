import type { Reservation, BatchUpdateInfo } from '../types';
import { isSingleDayMultiSpaceReservation } from '../types';
import { isReservationActiveForAvailability } from './conflictDetector';
import { normalizeSpaceName } from '../data/spacesData';
import { validateTimeRange } from './validationUtils';

export function canReplaceOccurrence(original: Reservation): boolean {
  return Boolean(
    !isSingleDayMultiSpaceReservation(original) &&
    !original.reemplazadaPorReservaId && !original.reemplazaReservaId &&
    isReservationActiveForAvailability(original)
  );
}

export function sameReplacementSlot(a: Reservation, b: Reservation): boolean {
  return a.fecha === b.fecha && normalizeSpaceName(a.espacio) === normalizeSpaceName(b.espacio) &&
    a.horaInicio === b.horaInicio && a.horaFin === b.horaFin &&
    Boolean(a.terminaDiaSiguiente) === Boolean(b.terminaDiaSiguiente);
}

export function isValidReplacementSlot(original: Reservation, replacement: Reservation): boolean {
  return original.fecha === replacement.fecha &&
    normalizeSpaceName(original.espacio) === normalizeSpaceName(replacement.espacio) &&
    validateTimeRange(replacement.horaInicio, replacement.horaFin, Boolean(replacement.terminaDiaSiguiente)).isValid;
}

export function buildReplacementBatch(
  original: Reservation,
  replacement: Reservation,
  id: string,
  reason: string,
  reminderDays?: number
): BatchUpdateInfo {
  const motivo = reason.trim();
  if (!canReplaceOccurrence(original)) throw new Error('Esta sesión ya no está disponible para reemplazar.');
  if (!motivo) throw new Error('Indica el motivo del reemplazo.');
  if (id === original.id || !isValidReplacementSlot(original, replacement)) {
    throw new Error('El reemplazo debe conservar la fecha y el espacio originales con un horario válido.');
  }
  const normalizedReminderDays = typeof reminderDays === 'number' && Number.isFinite(reminderDays)
    ? Math.max(1, Math.min(30, Math.round(reminderDays)))
    : (typeof replacement.diasAvisoReemplazo === 'number' && Number.isFinite(replacement.diasAvisoReemplazo)
      ? Math.max(1, Math.min(30, Math.round(replacement.diasAvisoReemplazo)))
      : undefined);

  const next: Reservation = {
    ...replacement, id, version: 0, estado: 'activa', actividadRecurrente: 'No',
    serieRecurrente: undefined, recurrenteId: undefined, indiceEnSerie: undefined, totalEnSerie: undefined,
    tipoRecurrencia: undefined, diasSemana: undefined, fechaInicioRecurrencia: undefined, fechaFinRecurrencia: undefined,
    reemplazaReservaId: original.id, reemplazadaPorReservaId: undefined, motivoReemplazo: motivo,
    ...(normalizedReminderDays !== undefined ? { diasAvisoReemplazo: normalizedReminderDays } : { diasAvisoReemplazo: undefined }),
    googleEventId: undefined, realizada: 'No',
  };
  const suspended: Reservation = {
    ...original,
    estado: 'cancelada',
    reemplazadaPorReservaId: id,
    motivoReemplazo: motivo,
    ...(normalizedReminderDays !== undefined ? { diasAvisoReemplazo: normalizedReminderDays } : {}),
  };
  return {
    scope: 'single', replacementOriginal: original,
    updatedReservations: [suspended, next],
    affectedIds: [original.id],
    description: `Reemplazada solo la sesión '${original.descripcion}' del ${original.fecha} por '${next.descripcion}'. Motivo: ${motivo}`,
  };
}

/** Series regeneration must preserve the exception, even if its replacement was cancelled. */
export function preserveReplacementExceptions(incoming: Reservation[], history: Reservation[]): Reservation[] {
  const exceptions = history.filter(r => r.reemplazadaPorReservaId);
  return incoming.filter(r => !exceptions.some(e => {
    const series = e.serieRecurrente || e.recurrenteId;
    if (e.id === r.id) return true;
    if (!series || (r.serieRecurrente || r.recurrenteId) !== series || e.fecha !== r.fecha) return false;
    const existing = history.find(other => other.id === r.id);
    if (existing && !existing.reemplazadaPorReservaId && isReservationActiveForAvailability(existing)) return false;
    const otherSession = history.some(other => other.fecha === e.fecha && (other.serieRecurrente || other.recurrenteId) === series &&
      !other.reemplazadaPorReservaId && isReservationActiveForAvailability(other));
    return !otherSession || sameReplacementSlot(e, r);
  }));
}
