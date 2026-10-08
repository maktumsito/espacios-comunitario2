import { expect, it } from 'vitest';
import { generateActivitiesEmailContent } from '../gmailDispatchService';

it('formats booking names consistently in HTML and text previews while preserving contact data and original records', () => {
  const raw = Object.freeze({ id: 'activity_ID', fecha: '2026-10-14', horaInicio: '10:00', horaFin: '11:00',
    espacio: 'SALA 2', tipoActividad: 'TALLER CCD', tipoPrestamo: 'PRÉSTAMO VECINAL', descripcion: 'tALLER de DANZA áRABE',
    responsable: 'mARÍA DE los áNGELES', emailContacto: 'vecino.prueba@ejemplo.cl', telefonoContacto: '+56912345678' });
  const preview = generateActivitiesEmailContent({ dates: [raw.fecha], activities: [raw] });
  for (const content of [preview.html, preview.text]) {
    expect(content).toContain('Taller De Danza Árabe');
    expect(content).toContain('Taller Ccd');
    expect(content).toContain('María De Los Ángeles');
    expect(content).toContain('Sala 2');
    expect(content).toContain('vecino.prueba@ejemplo.cl');
    expect(content).toContain('+56912345678');
  }
  expect(preview.totalActivities).toBe(1);
  expect(raw).toMatchObject({ id: 'activity_ID', espacio: 'SALA 2', tipoActividad: 'TALLER CCD', descripcion: 'tALLER de DANZA áRABE' });
});
