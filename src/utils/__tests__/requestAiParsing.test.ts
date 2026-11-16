import { expect, it } from 'vitest';
import { parseReservationRequestText } from '../requestTextParser';
import { redactRequestPersonalData } from '../requestAiPrivacy';
import { requestAiSchema, type RequestAiExtraction } from '../requestAiSchema';
import { SPACES_LIST } from '../../data/spacesData';

const ai: RequestAiExtraction = {
  descripcion: 'Yoga', tipoActividad: null, tipoPrestamo: null, espacio: 'AUDITORIO',
  fecha: '2026-11-20', horaInicio: '18:00', horaFin: '20:00', cantidadParticipantes: 30,
  bookingMode: 'single', selectedDays: null, recurrenceStartDate: null, recurrenceEndDate: null,
  equipamientoSolicitado: null, montaje: null,
};
const parse = (aiExtraction = ai, options = {}) => parseReservationRequestText('Solicitante: María Soto, necesito yoga', {
  availableSpaces: SPACES_LIST, aiExtraction, ...options,
});

it('keeps personal fields local while integrating AI extraction', () => {
  expect(parse()).toMatchObject({ responsable: 'María Soto', descripcion: 'Yoga', fecha: '2026-11-20', horaInicio: '18:00', hasConflict: false });
});

it('validates holidays, capacity, maintenance and existing bookings after AI extraction', () => {
  expect(parse({ ...ai, fecha: '2026-12-25' }).hasConflict).toBe(true);
  expect(parse({ ...ai, cantidadParticipantes: 10000 }).conflictDetails.join()).toContain('Aforo');
  expect(parse(ai, { allReservations: [{ id: 'existing', estado: 'activa', espacio: 'AUDITORIO', fecha: ai.fecha,
    horaInicio: '17:30', horaFin: '18:30' }] }).hasConflict).toBe(true);
  expect(parse(ai, { spaceBlocks: [{ id: 'block', espacio: 'AUDITORIO', fechaInicio: ai.fecha,
    fechaFin: ai.fecha, horaInicio: '17:00', horaFin: '21:00', motivo: 'Mantención', activo: true, todoElDia: false }] }).hasConflict).toBe(true);
});

it('generates weekly dates locally and excludes Chilean holidays', () => {
  const parsed = parse({ ...ai, fecha: '2026-12-04', bookingMode: 'pattern', selectedDays: [5],
    recurrenceStartDate: '2026-12-04', recurrenceEndDate: '2026-12-25' });
  expect(parsed.generatedSeriesDates).toEqual(['2026-12-04', '2026-12-11', '2026-12-18']);
});

it('warns about missing information rather than silently confirming defaults', () => {
  const missing = requestAiSchema.parse(Object.fromEntries(Object.keys(ai).map(key => [key, null])));
  expect(parse(missing).parsingWarnings.map(w => w.field)).toEqual(expect.arrayContaining(['fecha', 'horario', 'participantes']));
  expect(parse({ ...ai, bookingMode: 'pattern', selectedDays: [1], recurrenceEndDate: null }).parsingWarnings.map(w => w.field)).toContain('recurrencia');
});

it('redacts detected fields without serializing other parsed values or losing the request', () => {
  const text = 'Solicitante: María Soto solicita yoga el 20/11/2026 de 18 a 20, RUT 12345678-5, tel +56 9 1234 5678, maria@example.com, domicilio: Av. Uno 22';
  const parsed = parseReservationRequestText(text);
  const safe = redactRequestPersonalData(text, parsed);
  expect(safe).toContain('solicita yoga el 20/11/2026 de 18 a 20');
  for (const value of ['María Soto', '12345678-5', '1234 5678', 'maria@example.com', 'Av. Uno 22']) expect(safe).not.toContain(value);
  expect(redactRequestPersonalData('RUT 123456785 solicita auditorio', { rut: '12.345.678-5' })).not.toContain('123456785');
});

it('keeps a lowercase applicant name out of the AI request', () => {
  const text = 'juan vallejo, taller de yoga, auditorio, 20/11/2026, de 18 a 20';
  const parsed = parseReservationRequestText(text);
  expect(parsed.responsable).toBe('juan vallejo');
  expect(redactRequestPersonalData(text, parsed)).not.toContain('juan vallejo');
});
