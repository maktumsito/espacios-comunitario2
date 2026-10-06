// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReservationSaveHandler } from '../useReservationSaveHandler';
import { conversionBase as base, conversionProps } from '../../test/reservationConversionFixture';
beforeEach(()=>localStorage.clear());afterEach(cleanup);

it('converts a normal booking to all remaining dates after omitting conflicting days',async()=>{
  const save=vi.fn().mockResolvedValue(true),p=conversionProps(save);
  p.allReservations=[base,{...base,id:'occupied',fecha:'2026-10-20'}];p.setShowConflictDialog=vi.fn();
  const {result}=renderHook(()=>useReservationSaveHandler(p));
  await act(()=>result.current.executeSave());expect(p.setShowConflictDialog).toHaveBeenCalledWith(true);expect(save).not.toHaveBeenCalled();
  await act(()=>result.current.executeSave(false,{bookingMode:'specific',specificDates:['2026-10-06','2026-10-13']}));
  const batch=save.mock.calls[0][4];expect(batch.updatedReservations.map((r:any)=>r.fecha)).toEqual(['2026-10-06','2026-10-13']);
  expect(batch.updatedReservations[0].id).toBe(base.id);expect(batch.updatedReservations[0].version).toBe(base.version);
  expect(batch.updatedReservations.every((r:any)=>r.actividadRecurrente==='Sí'&&r.serieRecurrente==='SER_convert-normal'&&r.totalEnSerie===2)).toBe(true);
});
it('moves the original ID to the first free date when its original day is omitted',async()=>{
  const save=vi.fn().mockResolvedValue(true),p=conversionProps(save);const {result}=renderHook(()=>useReservationSaveHandler(p));
  await act(()=>result.current.executeSave(false,{bookingMode:'specific',specificDates:['2026-10-13','2026-10-20']}));
  const batch=save.mock.calls[0][4];expect(batch.updatedReservations[0]).toMatchObject({id:base.id,fecha:'2026-10-13',version:base.version});
  expect(batch.deletedIds).toBeUndefined();expect(batch.updatedReservations[1].id).not.toBe(base.id);
});
it('converts even when only one free occurrence remains',async()=>{
  const save=vi.fn().mockResolvedValue(true),p=conversionProps(save);const {result}=renderHook(()=>useReservationSaveHandler(p));
  await act(()=>result.current.executeSave(false,{bookingMode:'specific',specificDates:['2026-10-13']}));
  expect(save.mock.calls[0][4].updatedReservations).toHaveLength(1);
  expect(save.mock.calls[0][4].updatedReservations[0]).toMatchObject({id:base.id,fecha:'2026-10-13',actividadRecurrente:'Sí',totalEnSerie:1});
});
it('keeps the original booking and draft when no free dates remain',async()=>{
  const save=vi.fn(),p=conversionProps(save);p.onClose=vi.fn();p.clearDraft=vi.fn();p.showFormFeedback=vi.fn();
  const {result}=renderHook(()=>useReservationSaveHandler(p));
  await act(()=>result.current.executeSave(false,{bookingMode:'specific',specificDates:[]}));
  expect(save).not.toHaveBeenCalled();expect(p.onClose).not.toHaveBeenCalled();expect(p.clearDraft).not.toHaveBeenCalled();expect(p.showFormFeedback).toHaveBeenCalled();
});
it('preserves single-occurrence edits of an existing series',async()=>{
  const save=vi.fn().mockResolvedValue(true),p=conversionProps(save);p.editingReservation={...base,actividadRecurrente:'Sí',serieRecurrente:'existing'};p.isEditingRecurring=true;p.isEditingSingleOccurrence=true;
  const {result}=renderHook(()=>useReservationSaveHandler(p));await act(()=>result.current.executeSave());
  expect(save.mock.calls[0][4].updatedReservations).toHaveLength(1);expect(save.mock.calls[0][4].updatedReservations[0].serieRecurrente).toBe('existing');
});
it('keeps converted data open when persistence rejects the operation',async()=>{
  const save=vi.fn().mockResolvedValue(false),p=conversionProps(save);p.onClose=vi.fn();p.clearDraft=vi.fn();
  const {result}=renderHook(()=>useReservationSaveHandler(p));await act(()=>result.current.executeSave());
  expect(p.onClose).not.toHaveBeenCalled();expect(p.clearDraft).not.toHaveBeenCalled();expect(p.isSubmittingRef.current).toBe(false);
});
it('does not reintroduce omitted dates from stale holiday analysis',async()=>{
  const save=vi.fn().mockResolvedValue(true),p=conversionProps(save);
  p.specificHolidayAnalysis={validDates:['2026-10-06','2026-10-13'],omittedHolidays:[{date:'2026-10-12',holiday:{name:'Feriado'}}]};
  const {result}=renderHook(()=>useReservationSaveHandler(p));
  await act(()=>result.current.executeSave(false,{bookingMode:'specific',specificDates:['2026-10-13']}));
  expect(save.mock.calls[0][4].updatedReservations.map((r:any)=>r.fecha)).toEqual(['2026-10-13']);
});
it('preserves date-specific schedules and a second room while converting',async()=>{
  const save=vi.fn().mockResolvedValue(true),p=conversionProps(save);const {result}=renderHook(()=>useReservationSaveHandler(p));
  await act(()=>result.current.executeSave(false,{bookingMode:'specific',specificDates:['2026-10-13','2026-10-20'],useCustomSchedulesPerDate:true,dateSchedules:{'2026-10-13':{horaInicio:'12:00',horaFin:'13:00',espacio:'SALA 2',hasSecondSlot:true,secondEspacio:'SALA 3',secondHoraInicio:'14:00',secondHoraFin:'15:00'}}}));
  const rows=save.mock.calls[0][4].updatedReservations;expect(rows).toHaveLength(3);
  expect(rows[0]).toMatchObject({id:base.id,fecha:'2026-10-13',horaInicio:'12:00'});
  expect(rows[1]).toMatchObject({fecha:'2026-10-13',espacio:'SALA 3',horaInicio:'14:00'});
});
