import type { Reservation } from '../types';
import { formatMinutesToTime, timeToMinutes } from './conflictDetector';

export function getDragTiming(reservation: Reservation, date: string) {
  const start = timeToMinutes(reservation.horaInicio);
  let end = timeToMinutes(reservation.horaFin);
  if (reservation.terminaDiaSiguiente || end < start) end += 1440;
  return {
    start: reservation.fecha === date ? start : start - 1440,
    duration: end - start,
    continuation: reservation.fecha !== date,
    overnight: end > 1440,
  };
}

/** Preserve duration and the point grabbed, including a clipped overnight card. */
export function getTimelineDropSlot(reservation: Reservation, date: string, pointerMinutes: number,
  grabOffset: number, min: number, max: number) {
  const timing = getDragTiming(reservation, date);
  if (timing.duration <= 0) return null;
  const raw = pointerMinutes - grabOffset;
  // Snap the displacement so a horizontal move never rounds the original hours.
  const snapped = timing.start + Math.round((raw - timing.start) / 15) * 15;
  const lower = timing.continuation ? Math.max(-1440, 15 - timing.duration) : min;
  const upper = timing.continuation ? -15 : timing.overnight ? max - 15 : Math.max(min, max - timing.duration);
  const startMinutes = Math.max(lower, Math.min(upper, snapped));
  const endMinutes = startMinutes + timing.duration;
  const clockStart = timing.continuation ? startMinutes + 1440 : startMinutes;
  const clockEnd = clockStart + timing.duration;
  return {
    startMinutes, endMinutes,
    startTime: formatMinutesToTime(clockStart),
    endTime: formatMinutesToTime(clockEnd > 1440 ? clockEnd - 1440 : clockEnd),
    overnight: clockEnd > 1440,
  };
}
