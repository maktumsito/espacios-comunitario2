import { describe, expect, it } from 'vitest';
import { generateRecurrenceDates } from '../dateUtils';
import { buildRecurrenceHumanSummary } from '../recurrenceSummary';

describe('recurrenceSummary (plain Spanish summaries)', () => {
  it('builds natural summary with real count for Tuesday and Thursday between Mar 2 and Nov 30, 2027', () => {
    const dates = generateRecurrenceDates('2027-03-02', '2027-11-30', [2, 4]);
    expect(dates[0]).toBe('2027-03-02');
    expect(dates[dates.length - 1]).toBe('2027-11-30');
    expect(dates.length).toBeGreaterThan(70);

    const summary = buildRecurrenceHumanSummary({
      bookingMode: 'pattern',
      espacio: 'SALA 3',
      horaInicio: '15:00',
      horaFin: '17:00',
      selectedDays: [2, 4],
      recurrenceStartDate: '2027-03-02',
      recurrenceEndDate: '2027-11-30',
      generatedDates: dates,
    });

    expect(summary).toContain('Se reservará');
    expect(summary).toContain('Sala 3');
    expect(summary).toContain('todos los martes y jueves');
    expect(summary).toContain('de 15:00 a 17:00');
    expect(summary).toContain('entre el 2 de marzo y el 30 de noviembre de 2027');
    expect(summary).toContain(`${dates.length} reservas`);
  });

  it('includes omitted holidays count when present', () => {
    const summary = buildRecurrenceHumanSummary({
      bookingMode: 'pattern',
      espacio: 'AUDITORIO',
      horaInicio: '10:00',
      horaFin: '12:00',
      selectedDays: [1],
      recurrenceStartDate: '2027-05-03',
      recurrenceEndDate: '2027-05-31',
      generatedDates: ['2027-05-03', '2027-05-10', '2027-05-17', '2027-05-31'],
      omittedHolidaysCount: 1,
    });

    expect(summary).toContain('todos los lunes');
    expect(summary).toContain('4 reservas');
    expect(summary).toContain('omitiendo 1 feriado');
  });

  it('summarizes specific dates and single reservations clearly', () => {
    const specificSummary = buildRecurrenceHumanSummary({
      bookingMode: 'specific',
      espacio: 'SALA 2',
      horaInicio: '09:00',
      horaFin: '11:00',
      specificDates: ['2027-04-05', '2027-04-12'],
    });
    expect(specificSummary).toContain('2 fechas específicas');
    expect(specificSummary).toContain('2 reservas');
    expect(specificSummary).toContain('de 09:00 a 11:00');

    const singleSummary = buildRecurrenceHumanSummary({
      bookingMode: 'single',
      espacio: 'SALA 1',
      fecha: '2027-06-10',
      horaInicio: '18:00',
      horaFin: '20:00',
    });
    expect(singleSummary).toBe('Se reservará Sala 1 el 10 de junio de 2027, de 18:00 a 20:00.');
  });
});
