import { expect, it } from 'vitest';
import { buildConfirmedRating, reservationEndDate } from '../ratingValidation';
import type { Reservation } from '../../src/types';

const reservation = { id: 'r1', fecha: '2026-12-31', espacio: 'SALA 2', responsable: 'Oficial', tipoActividad: 'Cumpleaños', terminaDiaSiguiente: true } as Reservation;
it('validates the end date of an overnight event across a year boundary', () => {
  expect(reservationEndDate(reservation)).toBe('2027-01-01');
  expect(reservationEndDate({ ...reservation, terminaDiaSiguiente: false })).toBe('2026-12-31');
});
it('preserves detailed ratings and canonical frontend fields without trusting reservation details', () => {
  const result = buildConfirmedRating({ reservationId: 'tampered', espacio: 'fake', puntajeGeneral: 4,
    limpieza: 2, puntualidad: 3, cuidadoInstalaciones: 4, comportamiento: 5, huboDanos: true,
    detalleDanos: 'Silla dañada', minutosExceso: -5 }, reservation, 'rating-1', 'usuario', '2027-01-01T12:00:00Z');
  expect(result).toMatchObject({ id: 'rating-1', reservationId: 'r1', reservaId: 'r1', espacio: 'SALA 2',
    responsable: 'Oficial', puntajeGeneral: 4, puntaje: 4, limpieza: 2, puntualidad: 3,
    cuidadoInstalaciones: 4, comportamiento: 5, huboDanos: true, detalleDanos: 'Silla dañada', minutosExceso: 0 });
});
