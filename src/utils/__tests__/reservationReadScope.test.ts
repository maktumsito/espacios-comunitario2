import { expect, it } from 'vitest';
import { getReservationReadScope } from '../reservationReadScope';
import { INITIAL_FILTERS } from '../../hooks/useFilteredReservations';
import type { AuthUser } from '../../services/authService';

const reader: AuthUser = { username: 'lector', name: 'Lector', role: 'Auxiliar', initials: 'L', avatarColor: '',
  canCreateReservations: false, canEditReservations: false, canDeleteReservations: false };
const date = new Date(2026, 9, 7);

it('bounds the reader calendar to visible weeks and includes the preceding overnight day', () => {
  expect(getReservationReadScope(reader, 'calendar', date, INITIAL_FILTERS)).toEqual({
    startDate: '2026-09-27', endDate: '2026-11-01',
  });
  expect(getReservationReadScope(reader, 'mobile', new Date(2026, 1, 4), INITIAL_FILTERS)).toEqual({
    startDate: '2026-01-31', endDate: '2026-02-28',
  });
});

it('uses actual write permissions, including create-only and delete-only accounts', () => {
  for (const flag of ['canCreateReservations', 'canEditReservations', 'canDeleteReservations']) {
    expect(getReservationReadScope({ ...reader, [flag]: true }, 'calendar', date, INITIAL_FILTERS)).toBeUndefined();
  }
  expect(getReservationReadScope({ ...reader, isMasterAdmin: true }, 'daily', date, INITIAL_FILTERS)).toEqual({startDate:'2026-10-06',endDate:'2026-10-07'});
});

it('loads only the selected day plus the overnight preceding day for daily and timeline readers', () => {
  for (const view of ['daily', 'timeline'] as const) {
    expect(getReservationReadScope(reader, view, date, INITIAL_FILTERS)).toEqual({
      startDate: '2026-10-06', endDate: '2026-10-07',
    });
  }
});

it('keeps general views, exports, unbounded filters and global search complete', () => {
  expect(getReservationReadScope(reader, 'analytics', date, INITIAL_FILTERS)).toBeUndefined();
  expect(getReservationReadScope(reader, 'calendar', date, INITIAL_FILTERS, true)).toBeUndefined();
  expect(getReservationReadScope(reader, 'calendar', date, { ...INITIAL_FILTERS, search: 'taller' })).toBeUndefined();
  expect(getReservationReadScope(reader, 'daily', date, { ...INITIAL_FILTERS, fechaDesde: '2026-01-01' })).toBeUndefined();
});

it('includes an explicitly requested range beyond the visible month', () => {
  expect(getReservationReadScope(reader, 'daily', date, {
    ...INITIAL_FILTERS, fechaDesde: '2026-01-01', fechaHasta: '2026-12-31', search: 'taller',
  })).toEqual({ startDate: '2026-01-01', endDate: '2026-12-31' });
});
