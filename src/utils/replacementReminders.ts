import type { Reservation } from '../types';
import { getChileLocalDateString } from './dateUtils';
import { isReservationActiveForAvailability } from './conflictDetector';

export const REPLACEMENT_REMINDER_DAYS = 3;

export function replacementReminderKey(r: Reservation): string {
  return JSON.stringify([r.id, r.reemplazaReservaId, r.fecha, r.horaInicio, r.horaFin, r.espacio, r.descripcion, r.motivoReemplazo]);
}

export function getDueReplacementReminders(reservations: Reservation[], today = getChileLocalDateString()): Reservation[] {
  const start = Date.parse(`${today}T12:00:00Z`);
  if (!Number.isFinite(start)) return [];
  const end = new Date(start + REPLACEMENT_REMINDER_DAYS * 86400000).toISOString().slice(0, 10);
  const byId = new Map(reservations.map(r => [r.id, r]));
  return reservations.filter(r => {
    if (!r.reemplazaReservaId || !isReservationActiveForAvailability(r) || r.fecha < today || r.fecha > end) return false;
    const original = byId.get(r.reemplazaReservaId);
    return !original || original.estado === 'cancelada' && original.reemplazadaPorReservaId === r.id;
  }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.horaInicio.localeCompare(b.horaInicio) || a.id.localeCompare(b.id));
}
