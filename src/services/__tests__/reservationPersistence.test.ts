// @vitest-environment jsdom
import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, getDoc, getDocs, doc, collection, setDoc, terminate } from 'firebase/firestore';
import type { Reservation } from '../../types';
import { buildReplacementBatch } from '../../utils/reservationReplacement';

const context = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../firebase/config', () => ({ getDb: () => context.db }));
const app = initializeApp({ projectId: 'demo-espacios', apiKey: 'local-only' }, 'persistence-tests');
context.db = getFirestore(app);
connectFirestoreEmulator(context.db, '127.0.0.1', 8087);
let service: typeof import('../reservationService');
const make = (id: string, extra: Partial<Reservation> = {}): Reservation => ({
  id, fecha: '2026-10-06', horaInicio: '10:00', horaFin: '11:00',
  espacio: 'SALA 2', responsable: 'Vecino Test', tipoActividad: 'Taller',
  descripcion: 'Actividad de prueba', actividadRecurrente: 'No',
  estado: 'activa', terminaDiaSiguiente: false, version: 0, ...extra,
});
beforeEach(async () => {
  await fetch('http://127.0.0.1:8087/emulator/v1/projects/demo-espacios/databases/(default)/documents', { method: 'DELETE' });
  localStorage.clear();
  vi.resetModules();
  service = await import('../reservationService');
},30000);
afterAll(async () => { await terminate(context.db); await deleteApp(app); });
describe.skipIf(process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8087')('isolated Firestore reservation persistence', () => {
  it('replaces one recurring occurrence atomically and preserves the next occurrence after reload', async () => {
    const source = (await service.saveReservation(make('replace-source', {actividadRecurrente:'Sí',serieRecurrente:'replace-series'}))).reservations[0];
    const next = make('replace-next', {fecha:'2026-10-13',actividadRecurrente:'Sí',serieRecurrente:'replace-series'});
    await service.saveReservation(next);
    const batch = buildReplacementBatch(source, make('replace-new', {descripcion:'Reunión excepcional'}), 'replace-new', 'Reunión de vecinos');
    await service.commitReservationChanges(batch.updatedReservations);
    expect((await service.fetchReservationById(source.id))).toMatchObject({estado:'cancelada',reemplazadaPorReservaId:'replace-new',motivoReemplazo:'Reunión de vecinos'});
    expect((await service.fetchReservationById('replace-new'))).toMatchObject({estado:'activa',reemplazaReservaId:source.id,actividadRecurrente:'No'});
    expect((await service.fetchReservationById(next.id))?.estado).toBe('activa');
    const slots = (await getDoc(doc(context.db,'schedule_slots','2026-10-06_SALA%202'))).data()?.bookings;
    expect(slots.map((r:any)=>r.id)).toEqual(['replace-new']);
  });
  it('rejects a stale replacement without suspending its source or creating the new event', async () => {
    const source = (await service.saveReservation(make('stale-source', {actividadRecurrente:'Sí',serieRecurrente:'stale-series'}))).reservations[0];
    await service.saveReservation({...source,descripcion:'Editada por otra persona'});
    const batch = buildReplacementBatch(source, make('stale-new'), 'stale-new', 'Motivo');
    await expect(service.commitReservationChanges(batch.updatedReservations)).rejects.toThrow(/otro usuario/);
    expect((await service.fetchReservationById(source.id))?.estado).toBe('activa');
    expect(await service.fetchReservationById('stale-new')).toBeNull();
  });
  it('confirms conversion to a recurring series after omitting occupied days and releases the original slot', async () => {
    const {renderHook,act,cleanup}=await import('@testing-library/react');
    const {useReservationSaveHandler}=await import('../../hooks/useReservationSaveHandler');
    const {conversionProps,conversionBase}=await import('../../test/reservationConversionFixture');
    const original=(await service.saveReservation({...conversionBase,version:0})).reservations[0];
    const occupied=make('conversion-occupied',{fecha:'2026-10-06',horaInicio:'12:00',horaFin:'13:00'});
    await service.saveReservation(occupied);
    const p=conversionProps(async (_row,_series,_dates,_batch,batch)=>{
      expect(batch).toBeDefined();
      await service.commitReservationChanges(batch!.updatedReservations,{deletedIds:batch!.deletedIds});return true;
    });
    p.editingReservation=original;p.formData={...original,horaInicio:'12:00',horaFin:'13:00'};
    p.affectedReservations=[original];p.allReservations=[original,occupied];
    const {result}=renderHook(()=>useReservationSaveHandler(p));
    try {
      await act(()=>result.current.executeSave(false,{bookingMode:'specific',specificDates:['2026-10-13','2026-10-20']}));
      const rows=await getDocs(collection(context.db,'reservas'));
      const series=rows.docs.map(d=>d.data() as Reservation).filter(r=>r.serieRecurrente==='SER_convert-normal');
      expect(series).toHaveLength(2);expect(series.map(r=>r.fecha).sort()).toEqual(['2026-10-13','2026-10-20']);
      expect(series.find(r=>r.id===original.id)).toMatchObject({fecha:'2026-10-13',version:2});
      expect((await getDoc(doc(context.db,'schedule_slots','2026-10-06_SALA%202'))).data()?.bookings.map((r:any)=>r.id)).toEqual([occupied.id]);
      expect((await getDoc(doc(context.db,'schedule_slots','2026-10-13_SALA%202'))).data()?.bookings.map((r:any)=>r.id)).toEqual([original.id]);
      expect((await getDoc(doc(context.db,'reservas',occupied.id))).data()?.horaInicio).toBe('12:00');
    } finally {cleanup();}
  });
  it('keeps holiday authorization independent from extended-hours authorization', async () => {
    await service.saveReservation(make('holiday', {fecha:'2026-12-25', claveAutorizacion:'ccd2026', claveAutorizacionFeriado:'CCD'}));
    await expect(service.saveReservation(make('holiday-conflict', {fecha:'2026-12-25', claveAutorizacionFeriado:'CCD'}))).rejects.toThrow(/conflicto/i);
    await expect(service.saveReservation(make('unauthorized-holiday', {fecha:'2026-12-25', espacio:'SALA 3'}))).rejects.toThrow(/feriado/i);
  });
  it('cleans minute conflicts only after confirming deletion and removing availability entries', async () => {
    await service.saveReservationsBatch([make('round'),make('minute',{horaInicio:'10:05',horaFin:'11:05'})],{allowConflictOverride:true});
    const result=await service.cleanConflictingMinuteReservations(service.getLocalCache());
    expect(result.deletedReservations.map(r=>r.id)).toEqual(['minute']);
    expect((await getDoc(doc(context.db,'reservas','minute'))).exists()).toBe(false);
    const slots=await getDocs(collection(context.db,'schedule_slots'));
    expect(slots.docs.flatMap(d=>d.data().bookings).some(b=>b.id==='minute')).toBe(false);
  });
  it('restores an authorized snapshot with existing overlaps and replaces confirmed cache', async () => {
    await service.saveReservation(make('obsolete'));
    service.setLocalCache([...service.getLocalCache(),make('local-only',{espacio:'SALA 3'})]);
    const result=await service.seedAllToFirestore([make('restored-a'),make('restored-b')],true);
    expect(result.error).toBeUndefined();
    expect(service.getLocalCache().map(r=>r.id).sort()).toEqual(['restored-a','restored-b']);
    expect((await getDocs(collection(context.db,'reservas'))).docs.map(d=>d.id).sort()).toEqual(['restored-a','restored-b']);
  });
  it('does not resurrect a reservation removed by another editor', async () => {
    await service.saveReservation(make('deleted-editor'));
    const original=(await getDoc(doc(context.db,'reservas','deleted-editor'))).data() as Reservation;
    await service.deleteReservationById(original.id);
    await expect(service.saveReservation(original)).rejects.toThrow(/eliminada por otro usuario/);
    expect((await getDoc(doc(context.db,'reservas',original.id))).exists()).toBe(false);
  });
  it('uses the same canonical aliases in validation, saved records and availability', async () => {
    await service.saveReservation(make('alias',{espacio:'sala2 / sala3'}));
    await expect(service.saveReservation(make('canonical'))).rejects.toThrow(/conflicto/i);
    expect((await getDoc(doc(context.db,'reservas','alias'))).data()?.espacio).toBe('SALA 2 / SALA 3');
  });
  it('rejects a new creation whose ID belongs to a legacy reservation', async () => {
    await setDoc(doc(context.db,'reservas','legacy-id'),make('legacy-id',{version:0}));
    await expect(service.saveReservation(make('legacy-id',{responsable:'Overwrite'}),{intent:'create'})).rejects.toThrow(/otro usuario|versión/);
    expect((await getDoc(doc(context.db,'reservas','legacy-id'))).data()?.responsable).toBe('Vecino Test');
  });
  it('resumes pending rows without overwriting a later edit to an already confirmed row', async () => {
    const rows=Array.from({length:500},(_,i)=>make(`foreign-${i}`,{espacio:`ESPACIO ${i}`}));
    await expect(service.saveReservationsBatch(rows,{intent:'create',onProgress:r=>{if(r.pendingIds.length)throw new Error('disconnect');}})).rejects.toThrow('disconnect');
    const current=(await getDoc(doc(context.db,'reservas',rows[0].id))).data() as Reservation;
    await service.saveReservation({...current,responsable:'Another editor'});
    const {saveAuthUser}=await import('../authService');
    saveAuthUser({username:'local-test',name:'Local Test',role:'Administrador',initials:'LT',avatarColor:'blue',canCreateReservations:true,canEditReservations:true,canDeleteReservations:true});
    await service.resumeReservationOperation(service.getPendingOperations()[0].id);
    expect((await getDoc(doc(context.db,'reservas',rows[0].id))).data()?.responsable).toBe('Another editor');
    expect((await getDocs(collection(context.db,'reservas'))).size).toBe(500);
  },60000);
  it('keeps a fully confirmed write successful when its last progress observer fails', async () => {
    const result=await service.saveReservation(make('observer'),{intent:'create',onProgress:()=>{throw new Error('observer failed');}});
    expect(result.confirmedIds).toEqual(['observer']);expect(result.pendingIds).toHaveLength(0);
    expect((await getDoc(doc(context.db,'reservas','observer'))).exists()).toBe(true);
    expect(service.getPendingOperations()).toHaveLength(0);
  });
  it('backs up authoritative history even when only part of it is in the local cache', async () => {
    await service.saveReservationsBatch([make('loaded'),make('unloaded',{fecha:'2026-10-07'})],{intent:'create'});
    service.setLocalCache([service.getLocalCache().find(r=>r.id==='loaded')!]);
    const {createDatabaseBackup}=await import('../backupService');
    const backup=await createDatabaseBackup({tipo:'manual'});
    expect(backup.data).toBeDefined();
    expect(backup.data!.reservas.map(r=>r.id).sort()).toEqual(['loaded','unloaded']);
    expect(backup.totalReservas).toBe(2);
  });
  it('allows cancellation metadata on a holiday without creating availability', async () => {
    await service.saveReservation(make('cancelled-holiday',{fecha:'2026-12-25',estado:'cancelada'}),{intent:'create'});
    expect((await getDocs(collection(context.db,'schedule_slots'))).size).toBe(0);
  });
  it('rejects a batch that conflicts with an existing booking', async () => {
    await service.saveReservation(make('existing'));
    await expect(service.saveReservationsBatch([make('batch')])).rejects.toThrow(/conflicto/i);
    expect((await getDoc(doc(context.db, 'reservas', 'batch'))).exists()).toBe(false);
  });
  it('reserves constituent rooms atomically', async () => {
    await service.saveReservation(make('compound', { espacio: 'SALA 2 / SALA 3' }));
    await expect(service.saveReservation(make('room'))).rejects.toThrow(/conflicto/i);
  });
  it('protects the next day of an overnight booking', async () => {
    await service.saveReservation(make('night', { horaInicio: '23:00', horaFin: '01:00', terminaDiaSiguiente: true }));
    await expect(service.saveReservation(make('next', { fecha: '2026-10-07', horaInicio: '00:30', horaFin: '01:30' }))).rejects.toThrow(/conflicto/i);
  });
  it('rejects stale revisions instead of overwriting another editor', async () => {
    await service.saveReservation(make('edit'));
    const initial = (await getDoc(doc(context.db, 'reservas', 'edit'))).data() as Reservation;
    await service.saveReservation({ ...initial, responsable: 'First editor' });
    await expect(service.saveReservation({ ...initial, responsable: 'Stale editor' })).rejects.toThrow(/versión|version|otro usuario/i);
  });
  it('does not put rejected writes into the confirmed cache', async () => {
    await service.saveReservation(make('existing'));
    await expect(service.saveReservation(make('rejected'))).rejects.toThrow();
    expect(service.getLocalCache().some(r => r.id === 'rejected')).toBe(false);
  });
  it('removes the old slot when a batch moves a reservation', async () => {
    await service.saveReservation(make('move'));
    const initial = (await getDoc(doc(context.db, 'reservas', 'move'))).data() as Reservation;
    await service.saveReservationsBatch([{ ...initial, fecha: '2026-10-07' }]);
    const slot = await getDoc(doc(context.db, 'schedule_slots', '2026-10-06_SALA%202'));
    expect(slot.data()?.bookings.some((b: any) => b.id === 'move')).toBe(false);
  });
  it('allows only one of two concurrent clients to reserve the same room', async () => {
    const app2 = initializeApp({ projectId: 'demo-espacios', apiKey: 'local-only' }, 'second-client');
    const db2 = getFirestore(app2); connectFirestoreEmulator(db2,'127.0.0.1',8087);
    const { writeReservations } = await import('../reservationWriter');
    try {
      const outcomes = await Promise.allSettled([
        service.saveReservation(make('client-one')),
        writeReservations(db2,[make('client-two')],service.cleanReservationForFirestore),
      ]);
      expect(outcomes.filter(o=>o.status==='fulfilled')).toHaveLength(1);
      expect((await getDocs(collection(context.db,'reservas'))).size).toBe(1);
    } finally { await terminate(db2); await deleteApp(app2); }
  }, 30000);
  it('accepts adjacent intervals and excludes historical conflicts consistently', async () => {
    await service.saveReservationsBatch([make('adjacent-a'), make('adjacent-b',{horaInicio:'11:00',horaFin:'12:00'})]);
    await service.saveReservationsBatch([make('historic-a',{fecha:'2026-08-26'}),make('historic-b',{fecha:'2026-08-26'})]);
    expect((await getDocs(collection(context.db,'reservas'))).size).toBe(4);
  });
  it('removes unavailable entries on cancellation and atomically deletes rooms and overnight slots', async () => {
    await service.saveReservation(make('inactive'));
    const original=(await getDoc(doc(context.db,'reservas','inactive'))).data() as Reservation;
    await service.saveReservationsBatch([{...original,estado:'cancelada'}]);
    await service.saveReservation(make('replacement'));
    await service.saveReservation(make('delete-night',{fecha:'2026-10-08',espacio:'SALA 2 / SALA 3',horaInicio:'23:00',horaFin:'01:00',terminaDiaSiguiente:true}));
    await service.deleteReservationById('delete-night');
    const slots=await getDocs(collection(context.db,'schedule_slots'));
    expect(slots.docs.flatMap(d=>d.data().bookings).some(b=>b.id==='delete-night')).toBe(false);
  });
  it('removes optional fields instead of leaving stale merged values', async () => {
    await service.saveReservation(make('optional',{solicitudEliminacion:{solicitadoPor:'test',fechaSolicitud:new Date().toISOString()}}));
    const original=(await getDoc(doc(context.db,'reservas','optional'))).data() as Reservation;
    delete original.solicitudEliminacion;
    await service.saveReservation(original);
    expect((await getDoc(doc(context.db,'reservas','optional'))).data()?.solicitudEliminacion).toBeUndefined();
  });
  it('retries an acknowledged operation without incrementing versions or creating duplicate bookings', async () => {
    const options={operationId:'stable-operation'};
    await service.saveReservationsBatch([make('idempotent-a'),make('idempotent-b',{espacio:'SALA 3'})],options);
    await service.saveReservationsBatch([make('idempotent-a'),make('idempotent-b',{espacio:'SALA 3'})],options);
    const rows=await getDocs(collection(context.db,'reservas'));
    expect(rows.size).toBe(2); expect(rows.docs.every(d=>d.data().version===1)).toBe(true);
    const slots=await getDocs(collection(context.db,'schedule_slots'));
    expect(slots.docs.every(d=>d.data().bookings.length===1)).toBe(true);
  });
  it('resumes 500 rows after a mid-operation failure with the same IDs after reload', async () => {
    const rows=Array.from({length:500},(_,i)=>make(`large-${i}`,{espacio:`ESPACIO ${i}`}));
    let failure: any;
    try {
      await service.saveReservationsBatch(rows,{intent:'create',onProgress: result=> { if(result.pendingIds.length) throw new Error('simulated disconnect'); }});
    } catch(error) { failure=error; }
    expect(failure.result.confirmedIds.length).toBeGreaterThan(0);
    expect(failure.result.pendingIds.length).toBeGreaterThan(0);
    vi.resetModules(); service=await import('../reservationService');
    const { saveAuthUser }=await import('../authService');
    saveAuthUser({username:'local-test',name:'Local Test',role:'Administrador',initials:'LT',avatarColor:'bg-blue-600',canCreateReservations:true,canEditReservations:true,canDeleteReservations:true});
    await service.resumeReservationOperation(service.getPendingOperations()[0].id);
    const persisted=await getDocs(collection(context.db,'reservas'));
    expect(persisted.size).toBe(500); expect(persisted.docs.every(d=>d.data().version===1)).toBe(true);
    expect(service.getPendingOperations()).toHaveLength(0);
  },60000);
  it('validates all rows before making the first write', async () => {
    await expect(service.saveReservationsBatch([make('valid'),make('invalid',{fecha:'2026-02-30'})])).rejects.toThrow(/fecha/i);
    expect((await getDocs(collection(context.db,'reservas'))).size).toBe(0);
  });
  it('rebuilds legacy compound slots in dry-run, applies and verifies idempotently', async () => {
    await setDoc(doc(context.db,'reservas','legacy'),make('legacy',{espacio:'SALA 2 / SALA 3'}));
    await setDoc(doc(context.db,'schedule_slots','legacy-obsolete'),{fecha:'2026-10-06',espacio:'SALA 2 / SALA 3',bookings:[]});
    const { rebuildScheduleSlots }=await import('../migrations/rebuildScheduleSlots');
    expect(await rebuildScheduleSlots(context.db,false)).toMatchObject({changed:2,obsolete:1,applied:false});
    expect((await getDocs(collection(context.db,'schedule_slots'))).size).toBe(1);
    await rebuildScheduleSlots(context.db,true);
    expect(await rebuildScheduleSlots(context.db,false)).toMatchObject({changed:0,obsolete:0});
  });
});
