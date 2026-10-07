import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import type { FilterState, ViewMode } from '../types';
import type { AuthUser } from '../services/authService';
import { userCanCreateReservations, userCanDeleteReservations, userCanEditReservations } from '../services/authService';
import { normalizeFilterBoundary } from '../hooks/useFilteredReservations';

export interface ReservationDateRange { startDate: string; endDate: string }

export function canWriteReservations(user: AuthUser | null): boolean {
  return userCanCreateReservations(user) || userCanEditReservations(user) || userCanDeleteReservations(user);
}

/** General views and global searches retain the existing active-window subscription. */
export function getReservationReadScope(
  user: AuthUser | null, view: ViewMode, date: Date, filters: FilterState, needsGeneralData = false,
): ReservationDateRange | undefined {
  if (!user || canWriteReservations(user) || needsGeneralData ||
      !['calendar', 'daily', 'timeline', 'mobile'].includes(view)) return undefined;
  const from = normalizeFilterBoundary(filters.fechaDesde, 'start');
  const to = normalizeFilterBoundary(filters.fechaHasta, 'end');
  // A search without two date bounds must not silently search only one month.
  if ((from || to || filters.search.trim()) && !(from && to)) return undefined;
  let start = startOfMonth(date);
  let end = endOfMonth(date);
  if (view === 'calendar') {
    start = startOfWeek(start, { weekStartsOn: 1 });
    end = endOfWeek(end, { weekStartsOn: 1 });
  }
  // Include the preceding day for overnight bookings.
  let startDate = format(addDays(start, -1), 'yyyy-MM-dd');
  let endDate = format(end, 'yyyy-MM-dd');
  if (from && to && from <= to) {
    startDate = from < startDate ? from : startDate;
    endDate = to > endDate ? to : endDate;
  }
  return { startDate, endDate };
}
