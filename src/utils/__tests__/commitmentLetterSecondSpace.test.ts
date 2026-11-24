import { describe, it, expect } from 'vitest';
import {
  extractScheduleSlots,
  computeCommitmentDateRangeAndDays,
  computeCommitmentPoint2Details,
  generateCommitmentLetterPdfDoc
} from '../commitmentLetterPdf';
import { Reservation } from '../../types';

describe('Commitment Letter - Second Space Integration', () => {
  it('extracts both spaces when seriesScheduleItems is provided', () => {
    const reservation: Partial<Reservation> = {
      id: 'RSV_TEST_1',
      fecha: '2026-10-15',
      espacio: 'SALA 1',
      responsable: 'Juan Pérez',
      tipoActividad: 'PRÉSTAMO'
    };

    const slots = extractScheduleSlots(reservation, {
      seriesScheduleItems: [
        { fecha: '2026-10-15', horaInicio: '14:00', horaFin: '18:00', espacio: 'SALA 1' },
        { fecha: '2026-10-15', horaInicio: '18:00', horaFin: '20:00', espacio: 'SALA 2' }
      ]
    });

    expect(slots).toHaveLength(2);
    expect(slots[0].espacio).toBe('SALA 1');
    expect(slots[1].espacio).toBe('SALA 2');

    const rangeInfo = computeCommitmentDateRangeAndDays(slots, reservation);
    expect(rangeInfo.uniqueSpacesText).toBe('SALA 1 / SALA 2');
    expect(rangeInfo.daysAndHoursText).toContain('14:00 a 18:00 hrs. (SALA 1)');
    expect(rangeInfo.daysAndHoursText).toContain('18:00 a 20:00 hrs. (SALA 2)');

    const point2 = computeCommitmentPoint2Details(reservation, rangeInfo);
    expect(point2.espacioStr).toBe('SALA 1 / SALA 2');
    expect(point2.horarioStr).toContain('SALA 1');
    expect(point2.horarioStr).toContain('SALA 2');
  });

  it('extracts both spaces when reservation has second space properties directly attached', () => {
    const reservation: any = {
      id: 'RSV_TEST_2',
      fecha: '2026-10-20',
      horaInicio: '10:00',
      horaFin: '13:00',
      espacio: 'SALA 3',
      segundoEspacio: 'GIMNASIO',
      segundoHoraInicio: '13:00',
      segundoHoraFin: '15:00',
      responsable: 'María Soto',
      tipoActividad: 'PRÉSTAMO'
    };

    const slots = extractScheduleSlots(reservation);
    expect(slots).toHaveLength(2);
    expect(slots[0].espacio).toBe('SALA 3');
    expect(slots[0].horaInicio).toBe('10:00');
    expect(slots[1].espacio).toBe('GIMNASIO');
    expect(slots[1].horaInicio).toBe('13:00');

    const rangeInfo = computeCommitmentDateRangeAndDays(slots, reservation);
    expect(rangeInfo.uniqueSpacesText).toBe('SALA 3 / GIMNASIO');

    const point2 = computeCommitmentPoint2Details(reservation, rangeInfo);
    expect(point2.espacioStr).toBe('SALA 3 / GIMNASIO');
  });

  it('extracts both spaces when espacio contains combined spaces "SALA 1 / SALA 2"', () => {
    const reservation: Partial<Reservation> = {
      id: 'RSV_TEST_3',
      fecha: '2026-11-05',
      horaInicio: '15:00',
      horaFin: '19:00',
      espacio: 'SALA 1 / SALA 2',
      responsable: 'Carlos Gómez',
      tipoActividad: 'PRÉSTAMO'
    };

    const slots = extractScheduleSlots(reservation);
    expect(slots).toHaveLength(2);
    expect(slots[0].espacio).toBe('SALA 1');
    expect(slots[1].espacio).toBe('SALA 2');

    const rangeInfo = computeCommitmentDateRangeAndDays(slots, reservation);
    expect(rangeInfo.uniqueSpacesText).toBe('SALA 1 / SALA 2');

    const point2 = computeCommitmentPoint2Details(reservation, rangeInfo);
    expect(point2.espacioStr).toBe('SALA 1 / SALA 2');
  });

  it('finds sibling reservation in allReservations for multi-space booking', () => {
    const r1: Reservation = {
      id: 'RSV_A',
      fecha: '2026-12-01',
      horaInicio: '09:00',
      horaFin: '12:00',
      espacio: 'SALA 1',
      responsable: 'Ana Morales',
      tipoActividad: 'PRÉSTAMO',
      descripcion: 'Taller',
      actividadRecurrente: 'No',
      tipoRecurrencia: 'doble_espacio',
      indiceEnSerie: 1,
      totalEnSerie: 2,
      serieRecurrente: 'DBL_123',
      recurrenteId: 'DBL_123'
    };

    const r2: Reservation = {
      id: 'RSV_B',
      fecha: '2026-12-01',
      horaInicio: '12:00',
      horaFin: '14:00',
      espacio: 'SALA 2',
      responsable: 'Ana Morales',
      tipoActividad: 'PRÉSTAMO',
      descripcion: 'Taller',
      actividadRecurrente: 'No',
      tipoRecurrencia: 'doble_espacio',
      indiceEnSerie: 2,
      totalEnSerie: 2,
      serieRecurrente: 'DBL_123',
      recurrenteId: 'DBL_123'
    };

    const allReservations = [r1, r2];

    // From r1, it should find r2 and show both spaces
    const slotsFromR1 = extractScheduleSlots(r1, { allReservations });
    expect(slotsFromR1).toHaveLength(2);
    expect(slotsFromR1[0].espacio).toBe('SALA 1');
    expect(slotsFromR1[1].espacio).toBe('SALA 2');

    const rangeInfo = computeCommitmentDateRangeAndDays(slotsFromR1, r1);
    expect(rangeInfo.uniqueSpacesText).toBe('SALA 1 / SALA 2');

    const point2 = computeCommitmentPoint2Details(r1, rangeInfo);
    expect(point2.espacioStr).toBe('SALA 1 / SALA 2');
  });

  it('generates a valid PDF document with both spaces in Section 2', async () => {
    const reservation: Partial<Reservation> = {
      id: 'RSV_PDF_TEST',
      fecha: '2026-10-15',
      espacio: 'SALA 1',
      responsable: 'Juan Pérez',
      tipoActividad: 'PRÉSTAMO',
      rut: '12.345.678-9',
      telefonoContacto: '+56 9 1234 5678',
      domicilio: 'Av. Las Condes 1234'
    };

    const doc = await generateCommitmentLetterPdfDoc(reservation, {
      seriesScheduleItems: [
        { fecha: '2026-10-15', horaInicio: '14:00', horaFin: '18:00', espacio: 'SALA 1' },
        { fecha: '2026-10-15', horaInicio: '18:00', horaFin: '20:00', espacio: 'SALA 2' }
      ]
    });

    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const pdfOutput = doc.output();
    expect(pdfOutput).toContain('%PDF-');
  });
});

describe('Commitment letter activity type', () => {
  it.each(['CUMPLEAÑOS', 'PRÉSTAMO', 'TALLER MUNICIPAL'])(
    'uses %s even when a previous loan type is present',
    tipoActividad => {
      const reservation = {
        fecha: '2026-11-23',
        tipoActividad,
        tipoPrestamo: 'TALLER FORMATIVO CCD',
        espacio: 'SALA 2'
      };
      const range = computeCommitmentDateRangeAndDays(extractScheduleSlots(reservation), reservation);
      expect(computeCommitmentPoint2Details(reservation, range).modalidadStr).toBe(tipoActividad);
    }
  );
});
