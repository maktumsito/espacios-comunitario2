import { expect, it } from 'vitest';
import { parseCsvRows } from '../csvParser';
it('keeps exactly the sessions in a native export without regenerating a recurring calendar', () => {
  const csv = 'id,fecha,horaInicio,horaFin,espacio,responsable,tipoActividad,descripcion,actividadRecurrente,serieRecurrente,recurrenteId,indiceEnSerie,totalEnSerie,tipoRecurrencia,diasSemana,fechaInicioRecurrencia,fechaFinRecurrencia,estado\n' +
    'original,2026-03-16,16:30,17:30,BIBLIOTECA,Profesora,TALLER JJV,APOYO ESCOLAR,Sí,serie,serie,1,69,semanal,"lunes,miercoles",2026-03-16,2026-11-16,activa\n' +
    'exception,2026-09-14,16:45,17:45,SALA 4,Profesora,TALLER JJV,APOYO ESCOLAR,Sí,serie,serie,48,69,semanal,"lunes,miercoles",2026-03-16,2026-11-16,activa';
  expect(parseCsvRows(csv).map(row => [row.id, row.fecha, row.horaInicio, row.espacio])).toEqual([
    ['original', '2026-03-16', '16:30', 'BIBLIOTECA'], ['exception', '2026-09-14', '16:45', 'SALA 4'],
  ]);
});
it('retains recurrence expansion for legacy calendar templates', () => {
  const csv = 'id,fecha,horaInicio,horaFin,espacio,responsable,tipoActividad,descripcion,actividadRecurrente,tipoRecurrencia,diasSemana,fechaInicioRecurrencia,fechaFinRecurrencia\n' +
    'template,2026-03-16,16:30,17:30,BIBLIOTECA,Profesora,TALLER JJV,APOYO ESCOLAR,Sí,semanal,lunes,2026-03-16,2026-03-30';
  expect(parseCsvRows(csv).map(row => row.fecha)).toEqual(['2026-03-16', '2026-03-23', '2026-03-30']);
});
