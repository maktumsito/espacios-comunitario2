// @vitest-environment jsdom
import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReservationCrud, type UseReservationCrudProps } from '../useReservationCrud';
import type { Reservation } from '../../types';
import { buildReplacementBatch } from '../../utils/reservationReplacement';
import { ReservationWriteError } from '../../services/reservationService';
const mocks=vi.hoisted(()=>({save:vi.fn(),audit:vi.fn(),notify:vi.fn(),series:vi.fn(),day:vi.fn()}));
vi.mock('../../services/reservationService',async original=> ({...(await original<any>()),saveReservation:mocks.save,saveReservationsBatch:mocks.save,commitReservationChanges:mocks.save,queryReservationsBySeries:mocks.series,queryReservationsForDayDeletion:mocks.day}));
vi.mock('../../services/auditLogService',()=>({recordAuditEntry:mocks.audit,computeReservationDiff:()=>[]}));
vi.mock('../../services/notificationService',()=>({notifyTopamiento:mocks.notify,notifyImportantActivity:mocks.notify}));
const row:Reservation={id:'form',fecha:'2026-10-06',horaInicio:'10:00',horaFin:'11:00',espacio:'SALA 2',responsable:'Vecino',descripcion:'Taller',tipoActividad:'Taller',actividadRecurrente:'No',estado:'activa',version:0};
function props():UseReservationCrudProps {return {
  reservations:[],currentUser:{username:'local',name:'Local',role:'Administrador',avatarColor:'blue',initials:'L',canCreateReservations:true,canEditReservations:true,canDeleteReservations:true},selectedReservation:null,
  setReservations:vi.fn(),triggerSyncToast:vi.fn(),setIsReservationModalOpen:vi.fn(),setEditingReservation:vi.fn(),setSelectedReservation:vi.fn(),setIsDetailModalOpen:vi.fn(),setIsDeleteModalOpen:vi.fn(),setDeleteTargetReservation:vi.fn(),setConflictReportData:vi.fn(),setIsDuplicating:vi.fn(),setPrefillDate:vi.fn(),setPrefillSpace:vi.fn(),setPrefillStartTime:vi.fn(),setPrefillEndTime:vi.fn(),requireAuth:action=>action(),
};}
beforeEach(()=> {localStorage.clear();vi.clearAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-06T15:00:00Z'));mocks.audit.mockResolvedValue(undefined);});
afterEach(()=> {cleanup();vi.useRealTimers();});
it('merges four reservations in one atomic write and audits every original', async () => {
  const equipment = { equipmentId: 'chairs', equipmentName: 'Sillas', quantity: 5 };
  const target = { ...row, version: 2, comentarios: 'Base', equipamientoSolicitado: [equipment] };
  const early = { ...row, id: 'early', version: 3, horaInicio: '09:00', horaFin: '10:00', descripcion: 'Preparación', comentarios: 'Montaje', cantidadParticipantes: 30 };
  const late = { ...row, id: 'late', version: 4, horaInicio: '11:00', horaFin: '12:00', descripcion: 'Cierre', equipamientoSolicitado: [{ ...equipment, quantity: 12 }], importante: 'Sí' };
  const otherSpace = { ...row, id: 'other-space', version: 5, espacio: 'SALA 3', requiereCartaCompromiso: true };
  const unrelated = { ...row, id: 'unrelated', fecha: '2026-10-13' };
  const p = props(); p.reservations = [target, early, late, otherSpace, unrelated];
  mocks.save.mockImplementation(async (rows: Reservation[], options: any) => ({ reservations: rows, deletedIds: options.deletedIds, confirmedIds: rows.map(r => r.id), pendingIds: [] }));
  const { result } = renderHook(() => useReservationCrud(p));
  await act(async () => expect(await result.current.handleMergeReservations(target.id, ['early', 'late', 'other-space', 'early'])).toBe(true));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  const [merged] = mocks.save.mock.calls[0][0];
  expect(merged).toMatchObject({ id: target.id, horaInicio: '09:00', horaFin: '12:00', espacio: 'SALA 2 / SALA 3', cantidadParticipantes: 30, importante: 'Sí', requiereCartaCompromiso: true, equipamientoSolicitado: [expect.objectContaining({ quantity: 12 })] });
  expect(merged.descripcion).toContain('Preparación'); expect(merged.descripcion).toContain('Cierre');
  expect(merged.comentarios).toBe('Base | Montaje');
  expect(mocks.save.mock.calls[0][1]).toEqual({ deletedIds: ['early', 'late', 'other-space'], requireAtomic: true, expectedVersions: { early: 3, late: 4, 'other-space': 5 } });
  expect((p.setReservations as any).mock.calls[0][0](p.reservations)).toEqual([merged, unrelated]);
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ previousState: [target, early, late, otherSpace], newStateIsConfirmed: true }));
});

it('rejects a merge that overlaps an unselected reservation', async () => {
  const p = props(); p.reservations = [row, { ...row, id: 'early', horaInicio: '08:00', horaFin: '09:00' }, { ...row, id: 'late', horaInicio: '11:00', horaFin: '12:00' }, { ...row, id: 'occupied', horaInicio: '09:00', horaFin: '10:00' }];
  const { result } = renderHook(() => useReservationCrud(p));
  await act(async () => expect(await result.current.handleMergeReservations(row.id, ['early', 'late'])).toBe(false));
  expect(mocks.save).not.toHaveBeenCalled(); expect(p.setReservations).not.toHaveBeenCalled();
  expect(p.triggerSyncToast).toHaveBeenCalledWith(expect.stringContaining('conflicto con otra actividad'), 'error');
});

it.each(['missing', 'different-day', 'cancelled', 'base', 'empty'])('rejects invalid merge selections (%s)', async scenario => {
  const p = props();
  p.reservations = [row, { ...row, id: 'source', fecha: scenario === 'different-day' ? '2026-10-07' : row.fecha, estado: scenario === 'cancelled' ? 'cancelada' : 'activa' }];
  const ids = scenario === 'empty' ? [] : [scenario === 'missing' ? 'missing' : scenario === 'base' ? row.id : 'source'];
  const { result } = renderHook(() => useReservationCrud(p));
  await act(async () => expect(await result.current.handleMergeReservations(row.id, ids)).toBe(false));
  expect(mocks.save).not.toHaveBeenCalled(); expect(p.setReservations).not.toHaveBeenCalled();
});

it('keeps all originals when the atomic merge fails', async () => {
  const p = props(); p.reservations = [row, { ...row, id: 'early', horaInicio: '09:00', horaFin: '10:00' }, { ...row, id: 'late', horaInicio: '11:00', horaFin: '12:00' }];
  mocks.save.mockRejectedValue(new Error('Una reserva cambió de versión'));
  const { result } = renderHook(() => useReservationCrud(p));
  await act(async () => expect(await result.current.handleMergeReservations(row.id, ['early', 'late'])).toBe(false));
  expect(p.setReservations).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
});

it('includes the latest next-day end when merging overnight reservations', async () => {
  const target = { ...row, horaInicio: '20:00', horaFin: '22:00' };
  const p = props(); p.reservations = [target, { ...row, id: 'overnight', horaInicio: '22:00', horaFin: '02:00', terminaDiaSiguiente: true }, { ...row, id: 'later', horaInicio: '23:00', horaFin: '03:00', terminaDiaSiguiente: true }];
  mocks.save.mockImplementation(async (rows: Reservation[], options: any) => ({ reservations: rows, deletedIds: options.deletedIds, confirmedIds: [], pendingIds: [] }));
  const { result } = renderHook(() => useReservationCrud(p));
  await act(async () => expect(await result.current.handleMergeReservations(row.id, ['overnight', 'later'])).toBe(true));
  expect(mocks.save.mock.calls[0][0][0]).toMatchObject({ horaInicio: '20:00', horaFin: '03:00', terminaDiaSiguiente: true });
});

it('deletes every reviewed space for one date while retaining other sessions and concurrent additions', async () => {
  const targets = [{ ...row, version: 2, serieRecurrente: 'series' }, { ...row, id: 'other-space', espacio: 'SALA 3', version: 4, estado: 'cancelada' }];
  const future = { ...targets[0], id: 'future', fecha: '2026-10-13' };
  const concurrent = { ...row, id: 'concurrent' };
  const p = props(); p.reservations = [targets[0], future]; p.selectedReservation = targets[0];
  mocks.day.mockResolvedValue(targets);
  mocks.save.mockResolvedValue({ reservations: [], deletedIds: targets.map(r => r.id), confirmedIds: targets.map(r => r.id), pendingIds: [] });
  const { result } = renderHook(() => useReservationCrud(p));
  await act(async () => { await result.current.handleDeleteDay(row.fecha, targets); });
  expect(mocks.save).toHaveBeenCalledWith([], { deletedIds: ['form', 'other-space'], expectedVersions: { form: 2, 'other-space': 4 }, onProgress: expect.any(Function) });
  const update = (p.setReservations as any).mock.calls.at(-1)[0];
  expect(update([...targets, future, concurrent])).toEqual([concurrent, future]);
  expect(p.setIsDetailModalOpen).toHaveBeenCalledWith(false);
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE', previousState: targets, reservaFecha: row.fecha }));
});

it.each(['edited', 'moved'] as const)('requires renewed confirmation when a selected day reservation is %s', async change => {
  const p = props();
  mocks.day.mockResolvedValue(change === 'edited' ? [{ ...row, version: 3 }] : []);
  const { result } = renderHook(() => useReservationCrud(p));
  await act(async () => { await expect(result.current.handleDeleteDay(row.fecha, [row])).rejects.toThrow('cambiaron'); });
  expect(mocks.save).not.toHaveBeenCalled();
  expect(p.setReservations).not.toHaveBeenCalled();
});

it('preserves unchecked reservations and reservations created since preview', async () => {
  const unchecked = { ...row, id: 'unchecked', version: 8 }, added = { ...row, id: 'added' };
  const p = props(); p.reservations = [row, unchecked, added];
  mocks.day.mockResolvedValue(p.reservations);
  mocks.save.mockResolvedValue({ reservations: [], deletedIds: [row.id], confirmedIds: [row.id], pendingIds: [] });
  const { result } = renderHook(() => useReservationCrud(p));
  await act(async () => { await result.current.handleDeleteDay(row.fecha, [row]); });
  expect(mocks.save.mock.calls[0][1].deletedIds).toEqual([row.id]);
  expect((p.setReservations as any).mock.calls.at(-1)[0](p.reservations)).toEqual([unchecked, added]);
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ previousState: [row] }));
});

it('denies bulk deletion without permission and refuses selections from another date', async () => {
  const p = props(); p.currentUser = { ...p.currentUser!, canDeleteReservations: false };
  const { result, rerender } = renderHook(() => useReservationCrud(p));
  await expect(result.current.handleDeleteDay(row.fecha, [row])).rejects.toThrow('permiso');
  p.currentUser = { ...p.currentUser, canDeleteReservations: true }; rerender();
  await expect(result.current.handleDeleteDay('2026-10-07', [row])).rejects.toThrow('Consulta nuevamente');
  expect(mocks.day).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});

it('retains all reservations when deletion fails before confirmation', async () => {
  const p = props(); mocks.day.mockResolvedValue([row]); mocks.save.mockRejectedValue(new Error('Sin conexión'));
  const { result } = renderHook(() => useReservationCrud(p));
  await act(async () => { await expect(result.current.handleDeleteDay(row.fecha, [row])).rejects.toThrow('Sin conexión'); });
  expect(p.setReservations).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
});

it('applies and audits only confirmed deletions when a later batch fails', async () => {
  const other = { ...row, id: 'remaining', espacio: 'SALA 3' }, p = props();
  p.reservations = [row, other]; mocks.day.mockResolvedValue(p.reservations);
  mocks.save.mockRejectedValue(new ReservationWriteError('Error en el siguiente lote', { operationId: 'bulk', reservations: [], deletedIds: [row.id], confirmedIds: [row.id], pendingIds: [other.id] }));
  const { result } = renderHook(() => useReservationCrud(p));
  await act(async () => { await expect(result.current.handleDeleteDay(row.fecha, p.reservations)).rejects.toThrow('Se eliminaron 1 reservas'); });
  expect((p.setReservations as any).mock.calls[0][0](p.reservations)).toEqual([other]);
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ previousState: [row] }));
});

it('rejects a second bulk submit while the first is awaiting confirmation', async () => {
  let resolve!: (result: any) => void;
  mocks.day.mockResolvedValue([row]); mocks.save.mockReturnValue(new Promise(done => { resolve = done; }));
  const { result } = renderHook(() => useReservationCrud(props()));
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.handleDeleteDay(row.fecha, [row]); });
  await expect(result.current.handleDeleteDay(row.fecha, [row])).rejects.toThrow('ya está en curso');
  await act(async () => { resolve({ reservations: [], deletedIds: [row.id], confirmedIds: [row.id], pendingIds: [] }); await pending; });
  expect(mocks.save).toHaveBeenCalledTimes(1);
});

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
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ previousState: [source], newState: batch.updatedReservations, newStateIsConfirmed: true, description: expect.stringContaining('Motivo') }));
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
