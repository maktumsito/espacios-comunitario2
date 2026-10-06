// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import type { Reservation } from '../../types';
import { scheduleSlotsForDate, scopedScheduleSlots, schedulesFromReservations, applyChangedSeriesFields, isDateInSeriesScope } from '../recurringSchedule';
import { preserveReplacementExceptions } from '../reservationReplacement';
const first:Reservation={id:'first',fecha:'2026-10-13',horaInicio:'10:00',horaFin:'11:00',espacio:'SALA 2',responsable:'Vecino',descripcion:'Taller',tipoActividad:'Taller',actividadRecurrente:'Sí',serieRecurrente:'series',estado:'activa'};
const second={...first,id:'second',horaInicio:'12:00',horaFin:'13:00',espacio:'SALA 3'};
beforeEach(()=>localStorage.clear());
it('initializes both schedules of a day instead of overwriting the primary',()=>{
  const {dates,days}=schedulesFromReservations([second,first]);
  expect(dates[first.fecha]).toMatchObject({horaInicio:'10:00',espacio:'SALA 2',hasSecondSlot:true,secondHoraInicio:'12:00',secondEspacio:'SALA 3'});
  expect(days[2]).toEqual(dates[first.fecha]);
});
it('detects varying schedules for the same weekday',()=>{
  expect(schedulesFromReservations([first,{...first,id:'next',fecha:'2026-10-20',horaInicio:'14:00'}]).variableDates).toBe(true);
});
it('resolves the actual second room and time from custom schedules',()=>{
  const slots=scheduleSlotsForDate(first.fecha,{mode:'specific',base:first,useCustomDates:true,
    customDates:{[first.fecha]:{horaInicio:'10:00',horaFin:'11:00',espacio:'SALA 2',hasSecondSlot:true,secondHoraInicio:'14:00',secondHoraFin:'15:00',secondEspacio:'SALA 3'}},
    secondSpace:'TATAMI',secondStart:'08:00',secondEnd:'09:00'});
  expect(slots[1]).toMatchObject({espacio:'SALA 3',horaInicio:'14:00',horaFin:'15:00'});
});
it('filters ranges and selected dates using the same inclusive rules',()=>{
  const range={scope:'dateRange' as const,source:first,history:[first,second],today:'2026-10-06',rangeStartDate:'2026-10-20',rangeEndDate:'2026-10-13'};
  expect(isDateInSeriesScope('2026-10-13',range)).toBe(true);expect(isDateInSeriesScope('2026-10-20',range)).toBe(true);expect(isDateInSeriesScope('2026-10-06',range)).toBe(false);
  expect(isDateInSeriesScope('2026-10-20',{...range,scope:'selected',selectedIds:new Set(['second'])})).toBe(false);
});
it('updates only the selected second session, preserving its ID when its hours change',()=>{
  const slots=[{...first},{...second,horaInicio:'14:00',horaFin:'15:00'}];
  const planned=scopedScheduleSlots(slots,{scope:'selected',source:first,history:[first,second],today:'2026-10-06',selectedIds:new Set(['second'])});
  expect(planned).toHaveLength(1);expect(planned[0]).toMatchObject({sourceId:'second',horaInicio:'14:00'});
});
it('keeps another session on the same date when the first was replaced',()=>{
  const exception={...first,estado:'cancelada',reemplazadaPorReservaId:'replacement'};
  const planned=scopedScheduleSlots([first,second],{scope:'series',source:second,history:[exception,second],today:'2026-10-06'});
  expect(planned).toHaveLength(1);expect(planned[0].sourceId).toBe('second');
  expect(preserveReplacementExceptions([{...second,descripcion:'Editada'}],[exception,second])).toHaveLength(1);
});
it('can move the remaining session without assigning it the ID of the replaced one',()=>{
  const exception={...first,estado:'cancelada',reemplazadaPorReservaId:'replacement'};
  const planned=scopedScheduleSlots([{...second,horaInicio:'14:00',horaFin:'15:00'}],{scope:'series',source:second,history:[exception,second],today:'2026-10-06'});
  expect(planned[0]).toMatchObject({sourceId:'second',horaInicio:'14:00'});
});
it('changes only edited fields and preserves per-session equipment, contacts and attendance',()=>{
  const other={...second,responsable:'Otro vecino',cantidadParticipantes:9,equipamientoSolicitado:[{equipmentId:'EQ_PROYECTOR_HD',equipmentName:'Proyector',quantity:1}],realizada:'Sí'};
  const changed=applyChangedSeriesFields(other,{...first,descripcion:'Título nuevo',cantidadParticipantes:0},first);
  expect(changed).toMatchObject({descripcion:'Título nuevo',cantidadParticipantes:0,responsable:'Otro vecino',realizada:'Sí',equipamientoSolicitado:other.equipamientoSolicitado});
});
