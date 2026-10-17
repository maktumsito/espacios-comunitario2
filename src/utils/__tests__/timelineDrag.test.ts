import { expect, it } from 'vitest';
import { getTimelineDropSlot } from '../timelineDrag';
import type { Reservation } from '../../types';
const date = '2026-10-18';
const reservation = { fecha: date, horaInicio: '08:10', horaFin: '08:30' } as Reservation;

it('preserves short durations, irregular hours and the point grabbed during a horizontal move', () => {
  expect(getTimelineDropSlot(reservation, date, 500, 10, 480, 1320)).toMatchObject({
    startTime: '08:10', endTime: '08:30', overnight: false,
  });
  expect(getTimelineDropSlot(reservation, date, 620, 10, 480, 1320)).toMatchObject({ startTime: '10:10', endTime: '10:30' });
});
it('clamps normal activities without shortening them', () => {
  expect(getTimelineDropSlot(reservation, date, 2000, 0, 480, 1320)).toMatchObject({ startTime: '21:40', endTime: '22:00' });
});
it('preserves overnight duration and its continuation on the following day', () => {
  const overnight = { ...reservation, horaInicio: '23:00', horaFin: '02:00', terminaDiaSiguiente: true };
  expect(getTimelineDropSlot(overnight, date, 1410, 30, 480, 1440)).toMatchObject({ startTime: '23:00', endTime: '02:00', overnight: true });
  expect(getTimelineDropSlot(overnight, '2026-10-19', 30, 90, 0, 1320)).toMatchObject({ startMinutes: -60, endMinutes: 120, startTime: '23:00', endTime: '02:00', overnight: true });
});
it('handles midnight endings without adding a day or changing the duration', () => {
  const midnight = { ...reservation, horaInicio: '23:00', horaFin: '00:00' };
  expect(getTimelineDropSlot(midnight, date, 1410, 30, 480, 1440)).toMatchObject({ startTime: '23:00', endTime: '24:00', overnight: false });
});
