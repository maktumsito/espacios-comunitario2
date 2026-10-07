// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { buildReservationMoveBatch } from '../recurringEdits';
import type { Reservation } from '../../types';
beforeEach(()=>localStorage.clear());
const base:Reservation={id:'selected',fecha:'2026-10-13',horaInicio:'10:00',horaFin:'11:00',espacio:'SALA 2',responsable:'Vecino',tipoActividad:'Taller',descripcion:'Taller semanal',actividadRecurrente:'Sí',serieRecurrente:'series',estado:'activa',version:3};
const rows=[{...base,id:'past',fecha:'2026-10-05'},{...base,id:'today',fecha:'2026-10-06'},base,{...base,id:'future',fecha:'2026-10-20'},{...base,id:'exception',fecha:'2026-10-27',estado:'cancelada',reemplazadaPorReservaId:'replacement'}];
it.each([['single',['selected']],['series',['selected','future']],['future',['selected','future']]] as const)('applies %s only to its pending scope', (scope,ids)=>{
  const batch=buildReservationMoveBatch(base,{...base,espacio:'SALA 3',horaInicio:'11:00',horaFin:'12:00'},scope,rows,'2026-10-06');
  expect(batch.affectedIds).toEqual(ids);
  expect(batch.updatedReservations.every(r=>r.espacio==='SALA 3'&&r.horaInicio==='11:00'&&r.horaFin==='12:00')).toBe(true);
});
it('moves distinct daily schedules by the same offset and leaves metadata unchanged',()=>{
  const different={...base,id:'different',fecha:'2026-10-20',horaInicio:'09:00',horaFin:'10:30',espacio:'SALA 4',descripcion:'Otro horario'};
  const batch=buildReservationMoveBatch(base,{...base,horaInicio:'11:00',horaFin:'12:00'},'future',[base,different],'2026-10-06');
  expect(batch.updatedReservations[1]).toMatchObject({horaInicio:'10:00',horaFin:'11:30',espacio:'SALA 4',descripcion:'Otro horario',version:3});
});
it('preserves overnight duration and keeps midnight representations on a space-only move',()=>{
  const overnight={...base,horaInicio:'22:00',horaFin:'02:00',terminaDiaSiguiente:true};
  const moved=buildReservationMoveBatch(overnight,{...overnight,horaInicio:'23:00',horaFin:'03:00'},'single',[overnight],'2026-10-06');
  expect(moved.updatedReservations[0]).toMatchObject({horaInicio:'23:00',horaFin:'03:00',terminaDiaSiguiente:true});
  const midnight={...base,horaInicio:'23:00',horaFin:'24:00',terminaDiaSiguiente:false};
  expect(buildReservationMoveBatch(midnight,{...midnight,espacio:'SALA 3'},'single',[midnight],'2026-10-06').updatedReservations[0].horaFin).toBe('24:00');
});
it('does not move a past recurring occurrence or shift a schedule before midnight',()=>{
  const past={...base,fecha:'2026-10-05'};
  expect(()=>buildReservationMoveBatch(past,{...past,espacio:'SALA 3'},'single',[past],'2026-10-06')).toThrow(/ya pasó/);
  const early={...base,id:'early',fecha:'2026-10-20',horaInicio:'00:30',horaFin:'01:30'};
  expect(()=>buildReservationMoveBatch(base,{...base,horaInicio:'09:00',horaFin:'10:00'},'future',[base,early],'2026-10-06')).toThrow(/fuera del día/);
});
