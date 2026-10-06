// @vitest-environment jsdom
import { renderHook, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useReservationSeriesState } from '../useReservationSeriesState';
import type { Reservation, UpdateScope } from '../../types';
afterEach(cleanup);
const rows:Reservation[] = ['2026-10-05','2026-10-06','2026-10-07'].map((fecha,i)=>({id:`scope-${i}`,fecha,horaInicio:'10:00',horaFin:'11:00',espacio:'SALA 2',responsable:'Vecino',descripcion:'Taller',tipoActividad:'Taller',actividadRecurrente:'Sí',serieRecurrente:'series',estado:'activa'}));
it.each<[UpdateScope,string[]]>([['single',['scope-1']],['future',['scope-1','scope-2']],['series',['scope-0','scope-1','scope-2']],['dateRange',['scope-2']],['selected',['scope-0','scope-2']]])('excludes only occurrences affected by %s', (updateScope,ids)=> {
  localStorage.clear();
  const {result}=renderHook(()=>useReservationSeriesState({editingReservation:rows[1],allReservations:rows,updateScope,rangeStartDate:'2026-10-07',rangeEndDate:'2026-10-07',selectedOccurrenceIds:new Set(['scope-0','scope-2']),bookingMode:'pattern',recurrenceStartDate:'2026-10-05',recurrenceEndDate:'2026-10-07',selectedDays:[1,2,3],specificDates:[],formData:rows[1],includeHolidaysInSeries:false,holidayOverrideKey:''}));
  expect(result.current.affectedReservations.map(r=>r.id)).toEqual(ids);
  expect(new Set(result.current.excludeReservationIds)).toEqual(new Set(ids));
  expect(result.current.excludeSeriesId).toBe(updateScope==='series'?'series':undefined);
});
it('omits replaced dates from regeneration even if the replacement is cancelled', () => {
  const history = rows.map(r => r.id === 'scope-1' ? { ...r, estado: 'cancelada', reemplazadaPorReservaId: 'exception' } : r);
  const { result } = renderHook(() => useReservationSeriesState({ editingReservation: rows[0], allReservations: history, updateScope: 'series', rangeStartDate: '', rangeEndDate: '', selectedOccurrenceIds: new Set(), bookingMode: 'pattern', recurrenceStartDate: '2026-10-05', recurrenceEndDate: '2026-10-07', selectedDays: [1, 2, 3], specificDates: [], formData: rows[0], includeHolidaysInSeries: false, holidayOverrideKey: '' }));
  expect(result.current.generatedDates).toEqual(['2026-10-05', '2026-10-07']);
  expect(result.current.affectedReservations.map(r => r.id)).toEqual(['scope-0', 'scope-2']);
});
