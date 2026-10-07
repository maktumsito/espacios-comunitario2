// @vitest-environment jsdom
import { renderHook, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReservationSeriesState } from '../useReservationSeriesState';
import type { Reservation, UpdateScope } from '../../types';
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-06T15:00:00Z')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const rows:Reservation[] = ['2026-10-05','2026-10-06','2026-10-07'].map((fecha,i)=>({id:`scope-${i}`,fecha,horaInicio:'10:00',horaFin:'11:00',espacio:'SALA 2',responsable:'Vecino',descripcion:'Taller',tipoActividad:'Taller',actividadRecurrente:'Sí',serieRecurrente:'series',estado:'activa'}));
it.each<UpdateScope>(['series', 'future', 'dateRange', 'selected'])('does not use an earlier pending session as a reference for %s', updateScope => {
  localStorage.clear();
  const { result } = renderHook(() => useReservationSeriesState({ editingReservation: rows[2], allReservations: rows, updateScope,
    rangeStartDate: '2026-10-05', rangeEndDate: '2026-10-07', selectedOccurrenceIds: new Set(rows.map(row => row.id)),
    bookingMode: 'pattern', recurrenceStartDate: '2026-10-05', recurrenceEndDate: '2026-10-07', selectedDays: [1, 2, 3],
    specificDates: [], formData: rows[2], includeHolidaysInSeries: false, holidayOverrideKey: '' }));
  expect(result.current.seriesReservations.map(row => row.id)).toEqual(['scope-2']);
  expect(result.current.affectedReservations.map(row => row.id)).toEqual(['scope-2']);
  expect(result.current.excludeReservationIds).toEqual(['scope-2']);
  expect(result.current.rawPatternDates).toEqual(['2026-10-07']);
});
it.each<[UpdateScope,string[]]>([['single',['scope-1']],['future',['scope-1','scope-2']],['series',['scope-1','scope-2']],['dateRange',['scope-2']],['selected',['scope-2']]])('excludes only pending occurrences affected by %s', (updateScope,ids)=> {
  localStorage.clear();
  const {result}=renderHook(()=>useReservationSeriesState({editingReservation:rows[1],allReservations:rows,updateScope,rangeStartDate:'2026-10-07',rangeEndDate:'2026-10-07',selectedOccurrenceIds:new Set(['scope-0','scope-2']),bookingMode:'pattern',recurrenceStartDate:'2026-10-05',recurrenceEndDate:'2026-10-07',selectedDays:[1,2,3],specificDates:[],formData:rows[1],includeHolidaysInSeries:false,holidayOverrideKey:''}));
  expect(result.current.affectedReservations.map(r=>r.id)).toEqual(ids);
  expect(new Set(result.current.excludeReservationIds)).toEqual(new Set(ids));
  expect(result.current.excludeSeriesId).toBeUndefined();
});
it('omits replaced dates from regeneration even if the replacement is cancelled', () => {
  const history = rows.map(r => r.id === 'scope-1' ? { ...r, estado: 'cancelada', reemplazadaPorReservaId: 'exception' } : r);
  const { result } = renderHook(() => useReservationSeriesState({ editingReservation: rows[0], allReservations: history, updateScope: 'series', rangeStartDate: '', rangeEndDate: '', selectedOccurrenceIds: new Set(), bookingMode: 'pattern', recurrenceStartDate: '2026-10-05', recurrenceEndDate: '2026-10-07', selectedDays: [1, 2, 3], specificDates: [], formData: rows[0], includeHolidaysInSeries: false, holidayOverrideKey: '' }));
  expect(result.current.generatedDates).toEqual(['2026-10-07']);
  expect(result.current.affectedReservations.map(r => r.id)).toEqual(['scope-2']);
});
it('does not mix another series with the same activity and responsible when the target has no pending sessions',()=>{
  const archived={...rows[0],fecha:'2026-10-05',serieRecurrente:'archived'};
  const {result}=renderHook(()=>useReservationSeriesState({editingReservation:archived,allReservations:[archived,...rows],updateScope:'series',rangeStartDate:'',rangeEndDate:'',selectedOccurrenceIds:new Set(),bookingMode:'pattern',recurrenceStartDate:'2026-10-05',recurrenceEndDate:'2026-10-07',selectedDays:[1,2,3],specificDates:[],formData:archived,includeHolidaysInSeries:false,holidayOverrideKey:''}));
  expect(result.current.seriesReservations).toEqual([]);expect(result.current.affectedReservations).toEqual([]);
});
it('limits pattern previews to a date range rather than checking the whole series',()=>{
  const {result}=renderHook(()=>useReservationSeriesState({editingReservation:rows[1],allReservations:rows,updateScope:'dateRange',rangeStartDate:'2026-10-07',rangeEndDate:'2026-10-07',selectedOccurrenceIds:new Set(),bookingMode:'pattern',recurrenceStartDate:'2026-10-05',recurrenceEndDate:'2026-10-07',selectedDays:[1,2,3],specificDates:[],formData:rows[1],includeHolidaysInSeries:false,holidayOverrideKey:''}));
  expect(result.current.generatedDates).toEqual(['2026-10-07']);
});
