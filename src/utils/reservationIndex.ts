import { useMemo } from 'react';
import { Reservation } from '../types';

function parseTimeToMinutes(timeStr?: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function getNextDayIsoString(dateStr: string): string | null {
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  const date = new Date(y, m, d + 1, 12, 0, 0);
  const nextY = date.getFullYear();
  const nextM = String(date.getMonth() + 1).padStart(2, '0');
  const nextD = String(date.getDate()).padStart(2, '0');
  return `${nextY}-${nextM}-${nextD}`;
}

/**
 * Builds an in-memory hash map index grouping reservations by date string (YYYY-MM-DD),
 * with each day's reservations pre-sorted chronologically by start time.
 * If a reservation spans past midnight (terminaDiaSiguiente), it is indexed under both
 * its starting date and the following date to guarantee visibility in all day/calendar views.
 * 
 * Provides O(1) date lookups instead of O(N) array scans across views and calendars.
 */
export function buildReservationDateIndex(
  reservations: readonly Reservation[]
): Map<string, Reservation[]> {
  const index = new Map<string, Reservation[]>();

  const appendToDate = (dateKey: string, r: Reservation) => {
    let list = index.get(dateKey);
    if (!list) {
      list = [];
      index.set(dateKey, list);
    }
    // Avoid duplicate additions
    if (!list.some((existing) => existing.id === r.id)) {
      list.push(r);
    }
  };

  for (let i = 0; i < reservations.length; i++) {
    const r = reservations[i];
    if (!r || !r.fecha) continue;
    const dateKey = r.fecha.trim();
    appendToDate(dateKey, r);

    // If reservation spans into the next day, index under next day as well
    const sMin = parseTimeToMinutes(r.horaInicio);
    const eMin = parseTimeToMinutes(r.horaFin);
    const isOvernight = Boolean(r.terminaDiaSiguiente) || (eMin <= sMin && eMin > 0);

    if (isOvernight) {
      const nextDate = getNextDayIsoString(dateKey);
      if (nextDate) {
        appendToDate(nextDate, r);
      }
    }
  }

  // Pre-sort each date's list chronologically
  index.forEach((list, dateKey) => {
    list.sort((a, b) => {
      const aStart = a.fecha === dateKey ? a.horaInicio : '00:00';
      const bStart = b.fecha === dateKey ? b.horaInicio : '00:00';
      return aStart.localeCompare(bStart);
    });
  });

  return index;
}

/**
 * Retrieves all reservations for a given date in O(1) time.
 */
export function getReservationsForDate(
  index: Map<string, Reservation[]>,
  dateStr: string
): Reservation[] {
  if (!dateStr || !index) return [];
  return index.get(dateStr.trim()) || [];
}

/**
 * React hook to memoize the date-based reservation index.
 * Recomputes only when the underlying reservations reference changes.
 */
export function useReservationDateIndex(
  reservations: readonly Reservation[]
): Map<string, Reservation[]> {
  return useMemo(() => {
    return buildReservationDateIndex(reservations);
  }, [reservations]);
}
