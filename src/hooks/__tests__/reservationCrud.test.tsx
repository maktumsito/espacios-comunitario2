// @vitest-environment jsdom
import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReservationCrud, type UseReservationCrudProps } from '../useReservationCrud';
import type { Reservation } from '../../types';
import { buildReplacementBatch } from '../../utils/reservationReplacement';
const mocks=vi.hoisted(()=>({save:vi.fn(),audit:vi.fn(),notify:vi.fn(),series:vi.fn()}));
vi.mock('../../services/reservationService',async original=> ({...(await original<any>()),saveReservation:mocks.save,saveReservationsBatch:mocks.save,commitReservationChanges:mocks.save,queryReservationsBySeries:mocks.series}));
vi.mock('../../services/auditLogService',()=>({recordAuditEntry:mocks.audit,computeReservationDiff:()=>[]}));
vi.mock('../../services/notificationService',()=>({notifyTopamiento:mocks.notify,notifyImportantActivity:mocks.notify}));
const row:Reservation={id:'form',fecha:'2026-10-06',horaInicio:'10:00',horaFin:'11:00',espacio:'SALA 2',responsable:'Vecino',descripcion:'Taller',tipoActividad:'Taller',actividadRecurrente:'No',estado:'activa',version:0};
function props():UseReservationCrudProps {return {
  reservations:[],currentUser:{username:'local',name:'Local',role:'Administrador',avatarColor:'blue',initials:'L',canCreateReservations:true,canEditReservations:true,canDeleteReservations:true},selectedReservation:null,
  setReservations:vi.fn(),triggerSyncToast:vi.fn(),setIsReservationModalOpen:vi.fn(),setEditingReservation:vi.fn(),setSelectedReservation:vi.fn(),setIsDetailModalOpen:vi.fn(),setIsDeleteModalOpen:vi.fn(),setDeleteTargetReservation:vi.fn(),setConflictReportData:vi.fn(),setIsDuplicating:vi.fn(),setPrefillDate:vi.fn(),setPrefillSpace:vi.fn(),setPrefillStartTime:vi.fn(),setPrefillEndTime:vi.fn(),requireAuth:action=>action(),
};}
beforeEach(()=> {localStorage.clear();vi.clearAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-06T15:00:00Z'));mocks.audit.mockResolvedValue(undefined);});
afterEach(()=> {cleanup();vi.useRealTimers();});
it('retains the form until confirmation and rejects a second submit',async()=> {
  let finish:(value:any)=>void=()=>{};mocks.save.mockReturnValue(new Promise(resolve=>finish=resolve));
  const p=props();const {result}=renderHook(()=>useReservationCrud(p));let pending:Promise<boolean>;
  act(()=> {pending=result.current.handleCreateOrUpdate(row);});
  expect(p.setReservations).not.toHaveBeenCalled();expect(p.setIsReservationModalOpen).not.toHaveBeenCalled();
  await expect(result.current.handleCreateOrUpdate(row)).resolves.toBe(false);expect(mocks.save).toHaveBeenCalledTimes(1);
  await act(async()=>{finish({reservations:[{...row,version:1}],deletedIds:[],confirmedIds:[row.id],pendingIds:[]});expect(await pending!).toBe(true);});
  expect(p.setIsReservationModalOpen).toHaveBeenCalledWith(false);
});
it('does not roll back the entire list after a failed save',async()=> {
  mocks.save.mockRejectedValue(new Error('permission denied'));const p=props();const {result}=renderHook(()=>useReservationCrud(p));
  await act(async()=>expect(await result.current.handleCreateOrUpdate(row)).toBe(false));
  expect(p.setReservations).not.toHaveBeenCalled();expect(p.setIsReservationModalOpen).not.toHaveBeenCalled();
});
it('keeps confirmation successful when later audit or notification fails',async()=> {
  mocks.save.mockResolvedValue({reservations:[{...row,version:1}],deletedIds:[],confirmedIds:[row.id],pendingIds:[]});mocks.audit.mockRejectedValue(new Error('audit failed'));mocks.notify.mockImplementation(()=> {throw new Error('notification failed');});
  const p=props();const {result}=renderHook(()=>useReservationCrud(p));
  await act(async()=>expect(await result.current.handleCreateOrUpdate({...row,importante:'Sí'})).toBe(true));
  expect(p.setIsReservationModalOpen).toHaveBeenCalledWith(false);
  expect(p.setReservations).toHaveBeenCalledTimes(1);
});

it('confirms replacement as one pair, audits both records and excludes only the original', async () => {
  const source = { ...row, actividadRecurrente: 'Sí', serieRecurrente: 'series' };
  const batch = buildReplacementBatch(source, { ...row, descripcion: 'Reunión' }, 'new', 'Motivo');
  mocks.save.mockImplementation(async (rows: Reservation[]) => ({ reservations: rows, deletedIds: [], confirmedIds: rows.map(r => r.id), pendingIds: [] }));
  const p = props(); p.reservations = [source];
  const { result } = renderHook(() => useReservationCrud(p));
  await act(async () => expect(await result.current.handleCreateOrUpdate(batch.updatedReservations[1], false, undefined, false, batch, true)).toBe(true));
  expect(mocks.save).toHaveBeenCalledWith(batch.updatedReservations, { deletedIds: undefined, allowConflictOverride: false });
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ previousState: source, newState: batch.updatedReservations, description: expect.stringContaining('Motivo') }));
});

it('denies replacement if creation permission is absent', async () => {
  const source = { ...row, actividadRecurrente: 'Sí', serieRecurrente: 'series' };
  const batch = buildReplacementBatch(source, row, 'new', 'Motivo');
  const p = props(); p.currentUser = { ...p.currentUser!, role: 'Coordinador', canCreateReservations: false }; p.reservations = [source];
  const { result } = renderHook(() => useReservationCrud(p));
  await act(async () => expect(await result.current.handleCreateOrUpdate(batch.updatedReservations[1], false, undefined, false, batch)).toBe(false));
  expect(mocks.save).not.toHaveBeenCalled();
});

it('rejects replacement when another reservation occupies the same slot', async () => {
  const source = { ...row, actividadRecurrente: 'Sí', serieRecurrente: 'series' };
  const batch = buildReplacementBatch(source, row, 'new', 'Motivo');
  const p = props(); p.reservations = [source, { ...row, id: 'occupied' }];
  const { result } = renderHook(() => useReservationCrud(p));
  await act(async () => expect(await result.current.handleCreateOrUpdate(batch.updatedReservations[1], false, undefined, false, batch, true)).toBe(false));
  expect(mocks.save).not.toHaveBeenCalled();
});

it('preserves authoritative exceptions and excludes their deletion during a scoped series update', async () => {
  const source = { ...row, actividadRecurrente: 'Sí', serieRecurrente: 'series' };
  const [exception] = buildReplacementBatch(source, row, 'new', 'Motivo').updatedReservations;
  const future = { ...source, id: 'future', fecha: '2026-10-13' };
  mocks.series.mockResolvedValue([exception, future]);
  mocks.save.mockImplementation(async (rows: Reservation[]) => ({ reservations: rows, deletedIds: [], confirmedIds: rows.map(r => r.id), pendingIds: [] }));
  const p = props(); p.reservations = [future];
  const { result } = renderHook(() => useReservationCrud(p));
  await act(async () => expect(await result.current.handleCreateOrUpdate(future, false, undefined, false, {
    scope: 'series', updatedReservations: [{ ...source, id: 'regenerated' }, { ...future, descripcion: 'Actualizado' }], affectedIds: [future.id], deletedIds: [source.id],
  })).toBe(true));
  expect(mocks.series).toHaveBeenCalledWith('series', '2026-10-13');
  expect(mocks.save).toHaveBeenCalledWith([{ ...future, descripcion: 'Actualizado' }], { deletedIds: [], allowConflictOverride: undefined, requireAtomic: true, intent: 'update' });
});

it('moves all pending sessions atomically while preserving past sessions and replacements', async () => {
  const source = { ...row, fecha:'2026-10-13', actividadRecurrente:'Sí', serieRecurrente:'series' };
  const past = { ...source, id:'past', fecha:'2026-10-05' };
  const today = { ...source, id:'today', fecha:'2026-10-06' };
  const future = { ...source, id:'future', fecha:'2026-10-20' };
  const suspended = { ...source, id:'suspended', fecha:'2026-10-27', estado:'cancelada', reemplazadaPorReservaId:'replacement' };
  const p=props();p.reservations=[past,today,source,future,suspended];
  mocks.series.mockResolvedValue(p.reservations);
  mocks.save.mockImplementation(async (rows: Reservation[]) => ({reservations:rows,deletedIds:[],confirmedIds:rows.map(r=>r.id),pendingIds:[]}));
  const {result}=renderHook(()=>useReservationCrud(p));
  await act(async()=>expect(await result.current.handleMoveReservation(source,{...source,espacio:'SALA 3',horaInicio:'11:00',horaFin:'12:00'},'series')).toBe(true));
  expect(mocks.series).toHaveBeenCalledWith('series','2026-10-13');
  expect(mocks.save.mock.calls[0][0].map((r:Reservation)=>r.id)).toEqual([source.id,'future']);
  expect(mocks.save.mock.calls[0][1]).toEqual({requireAtomic:true,allowConflictOverride:false,intent:'update'});
  expect(mocks.save.mock.calls[0][0].every((r:Reservation)=>r.espacio==='SALA 3'&&r.horaInicio==='11:00')).toBe(true);
});
it.each(['future', 'series'] as const)('skips occupied dates and continues moving later available sessions for %s', async scope => {
  const source={...row,actividadRecurrente:'Sí',serieRecurrente:'series'};
  const future={...source,id:'future',fecha:'2026-10-13'};
  const later={...source,id:'later',fecha:'2026-10-20'};
  const occupied={...row,id:'occupied',fecha:future.fecha,espacio:'SALA 3'};
  const p=props();p.reservations=[source,future,later,occupied];mocks.series.mockResolvedValue([source,future,later]);
  mocks.save.mockImplementation(async(rows:Reservation[])=>({reservations:rows,deletedIds:[],confirmedIds:rows.map(r=>r.id),pendingIds:[]}));
  const {result}=renderHook(()=>useReservationCrud(p));
  await act(async()=>expect(await result.current.handleMoveReservation(source,{...source,espacio:'SALA 3'},scope)).toBe(true));
  expect(mocks.save.mock.calls[0][0]).toEqual([{...source,espacio:'SALA 3',terminaDiaSiguiente:false},{...later,espacio:'SALA 3',terminaDiaSiguiente:false}]);
  expect(mocks.save.mock.calls[0][1]).toEqual({requireAtomic:true,allowConflictOverride:false,intent:'update'});
  const updated=(p.setReservations as any).mock.calls[0][0](p.reservations);
  expect(updated.find((r:Reservation)=>r.id===future.id)).toEqual(future);
  expect(p.triggerSyncToast).toHaveBeenCalledWith(expect.stringContaining('Sesiones omitidas por falta de disponibilidad: 1'), 'warning');
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({previousState:[source,later],description:expect.stringContaining('Omitidas 1 sesiones')}));
});
it('skips maintenance blocks and an occupied selected session while continuing to available dates', async () => {
  const source={...row,actividadRecurrente:'Sí',serieRecurrente:'series'};
  const blocked={...source,id:'blocked',fecha:'2026-10-13'};
  const later={...source,id:'later',fecha:'2026-10-20'};
  const occupied={...row,id:'occupied',espacio:'SALA 3'};
  const p=props();p.reservations=[source,blocked,later,occupied];mocks.series.mockResolvedValue([source,blocked,later]);
  p.spaceBlocks=[{id:'block',espacio:'SALA 3',fechaInicio:blocked.fecha,fechaFin:blocked.fecha,todoElDia:true,motivo:'Mantención',descripcion:'Obras',activo:true,createdAt:''}];
  mocks.save.mockImplementation(async(rows:Reservation[])=>({reservations:rows,deletedIds:[],confirmedIds:rows.map(r=>r.id),pendingIds:[]}));
  const {result}=renderHook(()=>useReservationCrud(p));
  await act(async()=>expect(await result.current.handleMoveReservation(source,{...source,espacio:'SALA 3'},'future')).toBe(true));
  expect(mocks.save.mock.calls[0][0]).toEqual([{...later,espacio:'SALA 3',terminaDiaSiguiente:false}]);
});
it('saves nothing when every destination date is occupied', async () => {
  const source={...row,actividadRecurrente:'Sí',serieRecurrente:'series'};
  const p=props();p.reservations=[source,{...row,id:'occupied',espacio:'SALA 3'}];mocks.series.mockResolvedValue([source]);
  const {result}=renderHook(()=>useReservationCrud(p));
  await act(async()=>expect(await result.current.handleMoveReservation(source,{...source,espacio:'SALA 3'},'future')).toBe(false));
  expect(mocks.save).not.toHaveBeenCalled();expect(p.setReservations).not.toHaveBeenCalled();
  expect(p.triggerSyncToast).toHaveBeenCalledWith(expect.stringContaining('Todas se conservaron sin cambios'), 'warning');
});
it('still rejects an occupied destination when moving only one session', async () => {
  const p=props();p.reservations=[row,{...row,id:'occupied',espacio:'SALA 3'}];
  const {result}=renderHook(()=>useReservationCrud(p));
  await act(async()=>expect(await result.current.handleMoveReservation(row,{...row,espacio:'SALA 3'},'single')).toBe(false));
  expect(mocks.save).not.toHaveBeenCalled();
});
it('rechecks retained original slots after skipping an overnight session', async () => {
  const source={...row,horaInicio:'23:00',horaFin:'01:00',terminaDiaSiguiente:true,horarioExtendidoAutorizado:true,actividadRecurrente:'Sí',serieRecurrente:'series'};
  const next={...source,id:'next',fecha:'2026-10-07',horaInicio:'02:00',horaFin:'04:00',terminaDiaSiguiente:false};
  const later={...next,id:'later',fecha:'2026-10-20'};
  const occupied={...row,id:'occupied',horaInicio:'22:00',horaFin:'23:00'};
  const p=props();p.reservations=[source,next,later,occupied];mocks.series.mockResolvedValue([source,next,later]);
  mocks.save.mockImplementation(async(rows:Reservation[])=>({reservations:rows,deletedIds:[],confirmedIds:rows.map(r=>r.id),pendingIds:[]}));
  const {result}=renderHook(()=>useReservationCrud(p));
  await act(async()=>expect(await result.current.handleMoveReservation(source,{...source,horaInicio:'21:00',horaFin:'23:00',terminaDiaSiguiente:false},'future')).toBe(true));
  expect(mocks.save.mock.calls[0][0]).toEqual([{...later,horaInicio:'00:00',horaFin:'02:00'}]);
});
it('does not overwrite a source that changed while the move scope popup was open', async () => {
  const source={...row,actividadRecurrente:'Sí',serieRecurrente:'series'};
  const p=props();p.reservations=[source];mocks.series.mockResolvedValue([{...source,version:4}]);
  const {result}=renderHook(()=>useReservationCrud(p));
  await act(async()=>expect(await result.current.handleMoveReservation(source,{...source,espacio:'SALA 3'},'series')).toBe(false));
  expect(mocks.save).not.toHaveBeenCalled();
});
it.each(['2026-10-05', '2026-10-06'])('guards IDs before the selected date against deletion and reuse (%s)', async fecha => {
  const past={...row,id:'past',fecha,actividadRecurrente:'Sí',serieRecurrente:'series'};
  const future={...past,id:'future',fecha:'2026-10-13'};
  const p=props();p.reservations=[past,future];mocks.series.mockResolvedValue([future]);
  mocks.save.mockImplementation(async(rows:Reservation[])=>({reservations:rows,deletedIds:[],confirmedIds:rows.map(r=>r.id),pendingIds:[]}));
  const {result}=renderHook(()=>useReservationCrud(p));
  await act(async()=>expect(await result.current.handleCreateOrUpdate(future,false,undefined,false,{
    scope:'series',sourceReservationId:future.id,updatedReservations:[{...past,fecha:future.fecha},{...future,descripcion:'Editado'}],affectedIds:[past.id,future.id],deletedIds:[past.id],
  })).toBe(true));
  expect(mocks.save).toHaveBeenCalledWith([{...future,descripcion:'Editado'}],{deletedIds:[],allowConflictOverride:undefined,requireAtomic:true,intent:'update'});
});
