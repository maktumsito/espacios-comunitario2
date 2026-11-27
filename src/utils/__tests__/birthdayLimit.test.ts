import { describe, expect, it } from 'vitest';
import {
  MAX_DAILY_BIRTHDAYS,
  findDailyBirthdayLimitViolations,
  formatBirthdayLimitMessage,
  isBirthdayActivityType,
} from '../birthdayLimit';
import type { Reservation } from '../../types';

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: overrides.id || 'RSV_1',
    fecha: overrides.fecha || '2027-05-15',
    horaInicio: overrides.horaInicio || '15:00',
    horaFin: overrides.horaFin || '18:00',
    espacio: overrides.espacio || 'SALA 3',
    responsable: overrides.responsable || 'Vecino Ejemplo',
    tipoActividad: overrides.tipoActividad || 'CUMPLEAÑOS',
    actividadRecurrente: overrides.actividadRecurrente || 'No',
    descripcion: overrides.descripcion || 'Cumpleaños Infantil',
    estado: overrides.estado || 'activa',
    ...overrides,
  };
}

describe('birthdayLimit rule (max 2 active birthdays per day)', () => {
  it('recognizes CUMPLEAÑOS regardless of accents or casing', () => {
    expect(isBirthdayActivityType('CUMPLEAÑOS')).toBe(true);
    expect(isBirthdayActivityType('cumpleanos')).toBe(true);
    expect(isBirthdayActivityType('TALLER MUNICIPAL')).toBe(false);
    expect(MAX_DAILY_BIRTHDAYS).toBe(2);
  });

  it('allows up to 2 active birthdays on the same date and blocks the 3rd', () => {
    const existing = [
      makeReservation({ id: 'B1', espacio: 'SALA 1' }),
      makeReservation({ id: 'B2', espacio: 'SALA 2' }),
    ];

    const secondCandidate = [makeReservation({ id: 'NEW_2', fecha: '2027-05-16' })];
    expect(findDailyBirthdayLimitViolations(secondCandidate, existing)).toEqual([]);

    const thirdCandidate = [makeReservation({ id: 'NEW_3', espacio: 'SALA 4', fecha: '2027-05-15' })];
    const violations = findDailyBirthdayLimitViolations(thirdCandidate, existing);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      fecha: '2027-05-15',
      existingCount: 2,
      candidateCount: 1,
      totalCount: 3,
      maxAllowed: 2,
    });
    expect(formatBirthdayLimitMessage(violations)).toContain('Ya hay 2 cumpleaños reservados');
  });

  it('ignores cancelled birthdays when counting daily capacity', () => {
    const existing = [
      makeReservation({ id: 'B1', estado: 'activa' }),
      makeReservation({ id: 'B2', estado: 'cancelada' }),
    ];
    const candidate = [makeReservation({ id: 'NEW', espacio: 'SALA 4' })];
    expect(findDailyBirthdayLimitViolations(candidate, existing)).toEqual([]);
  });

  it('counts a multi-space same-day birthday with shared seriesId as 1 birthday event', () => {
    const existing = [
      makeReservation({ id: 'B1_A', espacio: 'SALA 1', serieRecurrente: 'SERIE_1' }),
      makeReservation({ id: 'B1_B', espacio: 'SALA 2', serieRecurrente: 'SERIE_1' }),
      makeReservation({ id: 'B2', espacio: 'SALA 3' }),
    ];
    const candidate = [
      makeReservation({ id: 'NEW_A', espacio: 'SALA 4', serieRecurrente: 'SERIE_2' }),
      makeReservation({ id: 'NEW_B', espacio: 'SALA 5', serieRecurrente: 'SERIE_2' }),
    ];
    // Existing has 2 distinct birthday events; adding 1 more (even across 2 spaces) reaches 3 -> violation
    const violations = findDailyBirthdayLimitViolations(candidate, existing);
    expect(violations).toHaveLength(1);
    expect(violations[0].existingCount).toBe(2);
    expect(violations[0].candidateCount).toBe(1);
    expect(violations[0].totalCount).toBe(3);

    // Against only B1_A + B1_B (1 event), adding SERIE_2 (1 event across 2 rooms) is allowed (total 2)
    expect(findDailyBirthdayLimitViolations(candidate, existing.slice(0, 2))).toEqual([]);
  });

  it('does not block editing an existing birthday reservation', () => {
    const existing = [
      makeReservation({ id: 'B1', espacio: 'SALA 1' }),
      makeReservation({ id: 'B2', espacio: 'SALA 2' }),
    ];
    const edited = [makeReservation({ id: 'B2', espacio: 'SALA 3', horaInicio: '16:00', horaFin: '19:00' })];
    expect(findDailyBirthdayLimitViolations(edited, existing, { excludeReservationIds: ['B2'] })).toEqual([]);
  });
});
