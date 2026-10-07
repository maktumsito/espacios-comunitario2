import type { Reservation, UpdateScope, BatchUpdateInfo } from '../types';
import { isSingleDayMultiSpaceReservation } from '../types';
import { getChileLocalDateString } from './dateUtils';
import { isReservationActiveForAvailability, timeToMinutes, formatMinutesToTime } from './conflictDetector';
import { normalizeSpaceName } from '../data/spacesData';
import { validateTimeRange } from './validationUtils';

export type RecurringMoveScope = 'single' | 'series' | 'future';

export function isRecurringSeriesReservation(r: Reservation): boolean {
  return Boolean(r.serieRecurrente || r.recurrenteId) && !isSingleDayMultiSpaceReservation(r);
}

export function getSeriesEditStartDate(_scope: UpdateScope, sourceDate: string, today = getChileLocalDateString()): string {
  // Every edit scope starts at the selected occurrence, never an earlier session.
  return sourceDate > today ? sourceDate : today;
}

export function buildReservationMoveBatch(original: Reservation, target: Reservation, scope: RecurringMoveScope,
  reservations: Reservation[], today = getChileLocalDateString()): BatchUpdateInfo {
  if (original.id !== target.id || original.fecha !== target.fecha) throw new Error('El arrastre debe conservar la fecha y la identidad de la reserva.');
  if (!isReservationActiveForAvailability(original)) throw new Error('La reserva ya no está activa.');
  const seriesId = original.serieRecurrente || original.recurrenteId;
  if (scope !== 'single' && !isRecurringSeriesReservation(original)) throw new Error('La reserva no pertenece a una serie recurrente.');
  const start = getSeriesEditStartDate(scope, original.fecha, today);
  if (scope === 'single' && isRecurringSeriesReservation(original) && original.fecha < today) throw new Error('La sesión ya pasó. Elige un alcance hacia adelante para mantener intacto el historial.');
  const affected = scope === 'single' ? [original] : reservations.filter(r =>
    (r.serieRecurrente || r.recurrenteId) === seriesId && r.fecha >= start &&
    !r.reemplazadaPorReservaId && isReservationActiveForAvailability(r));
  if (!affected.length) throw new Error('No hay sesiones pendientes dentro del alcance seleccionado.');
  const changedSpace = normalizeSpaceName(original.espacio) !== normalizeSpaceName(target.espacio);
  const endMinutes = (r: Reservation) => {
    const end = timeToMinutes(r.horaFin);
    return end + (r.terminaDiaSiguiente || end === 0 && timeToMinutes(r.horaInicio) > 0 ? 1440 : 0);
  };
  const startShift = timeToMinutes(target.horaInicio) - timeToMinutes(original.horaInicio);
  const endShift = endMinutes(target) - endMinutes(original);
  const changedTime = Boolean(startShift || endShift || Boolean(original.terminaDiaSiguiente) !== Boolean(target.terminaDiaSiguiente));
  const updated = affected.map(r => {
    const nextStart = timeToMinutes(r.horaInicio) + startShift;
    const nextEnd = endMinutes(r) + endShift;
    if (nextStart < 0 || nextStart >= 1440 || nextEnd <= nextStart || nextEnd > nextStart + 1440) {
      throw new Error(`El movimiento deja un horario fuera del día en ${r.fecha}. Ajusta esa sesión desde el formulario.`);
    }
    const next: Reservation = {
      ...r, espacio: changedSpace ? normalizeSpaceName(target.espacio) : r.espacio,
      horaInicio: changedTime ? formatMinutesToTime(nextStart) : r.horaInicio,
      horaFin: changedTime ? formatMinutesToTime(nextEnd > 1440 ? nextEnd - 1440 : nextEnd) : r.horaFin,
      terminaDiaSiguiente: changedTime ? nextEnd > 1440 : Boolean(r.terminaDiaSiguiente),
    };
    const validation = validateTimeRange(next.horaInicio, next.horaFin, Boolean(next.terminaDiaSiguiente));
    if (!validation.isValid) throw new Error(`Horario inválido para la sesión del ${r.fecha}: ${validation.error}`);
    return next;
  });
  const label = scope === 'single' ? 'Solo esta reserva' : scope === 'future' ? 'Desde esta en adelante' : 'Toda la serie pendiente';
  return {
    scope, updatedReservations: updated, affectedIds: affected.map(r => r.id), sourceReservationId: original.id,
    description: `Movidas ${updated.length} reservas mediante arrastre (${label}): ${target.espacio}, ${target.horaInicio}–${target.horaFin}. Las sesiones pasadas se mantienen intactas.`,
  };
}
