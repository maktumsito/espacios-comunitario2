// @vitest-environment jsdom
// Run only against the isolated emulator. Assertions express the intended contract;
// failures are audit evidence, not permission to change application behavior.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase/app';
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, setDoc, terminate } from 'firebase/firestore';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import type { Reservation } from '../../src/types';
import { writeFileSync } from 'node:fs';
const observations: object[] = [];
const observe = (id: string, result: object) => { observations.push({ id, ...result }); console.log(id, JSON.stringify(result)); };
const context = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../src/firebase/config', () => ({ getDb: () => context.db }));
const enabled = process.env.AUDIT_EMULATOR === 'true' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8087';
const apps = enabled ? ['audit-one', 'audit-two'].map(name => initializeApp({ projectId: 'demo-espacios', apiKey: 'local-only' }, name)) : [];
const databases = apps.map(app => { const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8087); return db; });
context.db = databases[0];
const row = (id: string, extra: Partial<Reservation> = {}): Reservation => ({ id, fecha: '2026-10-13', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2', responsable: 'Synthetic', tipoActividad: 'Taller', descripcion: 'Synthetic audit', actividadRecurrente: 'No', estado: 'activa', terminaDiaSiguiente: false, version: 0, ...extra });
describe.skipIf(!enabled)('audit contracts on real Firestore', () => {
  beforeEach(async () => {
    await fetch('http://127.0.0.1:8087/emulator/v1/projects/demo-espacios/databases/(default)/documents', { method: 'DELETE' });
    localStorage.clear(); vi.resetModules();
  }, 30000);
  afterAll(async () => { writeFileSync('outputs/audit-2026-10-08-observations.json', JSON.stringify(observations, null, 2)); await Promise.all(databases.map(terminate)); await Promise.all(apps.map(deleteApp)); });
  it('SEC-01 denies unauthenticated SDK reads and account escalation', async () => {
    const account = { username: 'synthetic', name: 'Synthetic', role: 'Administrador', passwordHash: 'synthetic-only' };
    // A denied collection is the negative control proving that rules are loaded.
    await expect(setDoc(doc(context.db, 'closed_audit_collection', 'control'), { id: 'control' })).rejects.toThrow();
    const writes = await Promise.allSettled([
      setDoc(doc(context.db, 'usuarios_sistema', 'synthetic'), account),
      setDoc(doc(context.db, 'reservas', 'no-session'), row('no-session')),
      setDoc(doc(context.db, 'schedule_slots', 'forged-slot'), { arbitrary: true }),
      setDoc(doc(context.db, 'audit_logs', 'forged-author'), { id: 'forged-author', timestamp: new Date().toISOString(), user: 'Forged', action: 'CREATE', description: 'Synthetic forged identity' }),
    ]);
    const readable = (await getDoc(doc(context.db, 'usuarios_sistema', 'synthetic'))).exists();
    observe('SEC-01', { anonymousWritesAccepted: writes.filter(r => r.status === 'fulfilled').length, accountReadable: readable });
    expect(writes.filter(r => r.status === 'fulfilled')).toHaveLength(0);
    expect(readable).toBe(false);
  });
  it('SEC-02 denies anonymous REST writes', async () => {
    const response = await fetch('http://127.0.0.1:8087/v1/projects/demo-espacios/databases/(default)/documents/schedule_slots/rest-forged', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: { arbitrary: { booleanValue: true } } }),
    });
    observe('SEC-02', { status: response.status });
    expect(response.ok).toBe(false);
  });
  it('SEC-03 prevents an authenticated reader from writing directly', async () => {
    const auth = getAuth(apps[1]); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const email = `reader-${Date.now()}@example.test`;
    await createUserWithEmailAndPassword(auth, email, 'Synthetic-only-123!');
    await setDoc(doc(context.db, 'usuarios_sistema', 'reader'), { username: 'reader', name: 'Reader', role: 'Auxiliar', passwordHash: 'synthetic', canCreateReservations: false, canEditReservations: false, canDeleteReservations: false });
    const outcome = await Promise.allSettled([setDoc(doc(databases[1], 'reservas', 'reader-write'), row('reader-write'))]);
    observe('SEC-03', { authenticated: !!auth.currentUser, writeAccepted: outcome[0].status === 'fulfilled' });
    expect(outcome[0].status).toBe('rejected');
  });
  it('CON-01 concurrent edits accept one version and preserve availability', async () => {
    const service = await import('../../src/services/reservationService');
    const { writeReservations } = await import('../../src/services/reservationWriter');
    const initial = (await service.saveReservation(row('race'))).reservations[0];
    const outcomes = await Promise.allSettled([
      service.saveReservation({ ...initial, descripcion: 'Editor A' }),
      writeReservations(databases[1], [{ ...initial, descripcion: 'Editor B' }], service.cleanReservationForFirestore),
    ]);
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await getDoc(doc(context.db, 'reservas', 'race'))).data()?.version).toBe(2);
    expect((await getDoc(doc(context.db, 'schedule_slots', '2026-10-13_SALA%202'))).data()?.bookings.map((b: any) => b.id)).toEqual(['race']);
  }, 30000);
  it('CON-02 stale deletion must reject a later edit', async () => {
    const service = await import('../../src/services/reservationService');
    const { writeReservations } = await import('../../src/services/reservationWriter');
    const initial = (await service.saveReservation(row('stale-delete'))).reservations[0];
    await writeReservations(databases[1], [{ ...initial, descripcion: 'Later edit' }], service.cleanReservationForFirestore);
    const result = await Promise.allSettled([service.deleteReservationById(initial.id)]);
    const exists = (await getDoc(doc(context.db, 'reservas', initial.id))).exists();
    observe('CON-02', { deletionAccepted: result[0].status === 'fulfilled', editedRowExists: exists });
    expect(result[0].status).toBe('rejected'); expect(exists).toBe(true);
  });
  it('AUD-01 concurrent restore commits one version, source marker and new audit atomically', async () => {
    const service = await import('../../src/services/reservationService');
    const { persistAuditEntry } = await import('../../src/services/auditSnapshotService');
    const { buildAuditRestorePlan } = await import('../../src/utils/auditRestore');
    const { writeReservations } = await import('../../src/services/reservationWriter');
    const before = (await service.saveReservation(row('restore'))).reservations[0];
    const after = (await service.saveReservation({ ...before, descripcion: 'Changed' })).reservations[0];
    const timestamp = new Date().toISOString();
    const entry: any = { id: 'audit-edit', timestamp, user: 'Synthetic', action: 'UPDATE', description: 'Synthetic edit', previousState: before, newState: after, snapshotVersion: 2, affectedCount: 1, isReverted: false };
    await persistAuditEntry(entry);
    const plan = buildAuditRestorePlan(entry, new Map([[after.id, after]]));
    const options: any = { requireAtomic: true, expectedVersions: plan.expectedVersions, operationId: 'RESTORE_audit-edit', auditRestore: { logId: entry.id, actor: 'Synthetic', timestamp, log: { id: 'AUDIT_RESTORE_audit-edit', timestamp, user: 'Synthetic', action: 'RESTORE', description: 'Synthetic restoration' } } };
    const outcomes = await Promise.allSettled([
      writeReservations(context.db, plan.reservations, service.cleanReservationForFirestore, options),
      writeReservations(databases[1], plan.reservations, service.cleanReservationForFirestore, options),
    ]);
    expect(outcomes.some(r => r.status === 'fulfilled')).toBe(true);
    expect((await getDoc(doc(context.db, 'reservas', after.id))).data()).toMatchObject({ version: 3, descripcion: before.descripcion });
    expect((await getDoc(doc(context.db, 'audit_logs', entry.id))).data()?.isReverted).toBe(true);
    expect((await getDoc(doc(context.db, 'audit_logs', 'AUDIT_RESTORE_audit-edit'))).exists()).toBe(true);
    expect((await getDoc(doc(context.db, 'schedule_slots', '2026-10-13_SALA%202'))).data()?.bookings).toHaveLength(1);
  }, 30000);
  it('AUD-02 preserves a later edit and rejects an oversized atomic restore before writing', async () => {
    const service = await import('../../src/services/reservationService');
    const { recordAuditEntry, restoreAuditChange } = await import('../../src/services/auditLogService');
    const before = (await service.saveReservation(row('later'))).reservations[0];
    const after = (await service.saveReservation({ ...before, descripcion: 'Changed' })).reservations[0];
    const entry = await recordAuditEntry({ action: 'UPDATE', reservaId: before.id, user: 'Synthetic', description: 'Synthetic', previousState: before, newState: after, newStateIsConfirmed: true });
    await service.saveReservation({ ...after, descripcion: 'Later protected edit' });
    const result = await restoreAuditChange(entry.id, { username: 'audit-a', name: 'Audit A', role: 'Administrador' } as any);
    expect(result.success).toBe(false);
    expect((await getDoc(doc(context.db, 'reservas', before.id))).data()?.descripcion).toBe('Later protected edit');
    expect((await getDoc(doc(context.db, 'audit_logs', entry.id))).data()?.isReverted).toBe(false);
    await expect(service.commitReservationChanges(Array.from({ length: 500 }, (_, i) => row(`limit-${i}`, { espacio: `SPACE ${i}` })), { requireAtomic: true })).rejects.toThrow(/atómico/);
    expect((await getDocs(collection(context.db, 'reservas'))).size).toBe(1);
  }, 30000);
  it('BAK-01 restores catalog and rating payloads as well as reservations', async () => {
    const service = await import('../../src/services/reservationService');
    const backup = await import('../../src/services/backupService');
    await service.saveReservation(row('backup-row'));
    await setDoc(doc(context.db, 'configuracion_sistema', 'espacios'), { data: [{ id: 'synthetic-space', nombre: 'Original catalog' }] });
    await setDoc(doc(context.db, 'calificaciones_espacios', 'rating'), { id: 'rating', reservaId: 'backup-row', espacio: 'SALA 2', puntaje: 4 });
    const snapshot = await backup.createDatabaseBackup({ tipo: 'manual', creadoPor: 'Synthetic' });
    await setDoc(doc(context.db, 'configuracion_sistema', 'espacios'), { data: [{ id: 'synthetic-space', nombre: 'Changed catalog' }] });
    await setDoc(doc(context.db, 'calificaciones_espacios', 'rating'), { id: 'rating', reservaId: 'backup-row', espacio: 'SALA 2', puntaje: 1 });
    const result = await backup.restoreDatabaseFromBackup(snapshot, { username: 'audit-a', name: 'Audit A', role: 'Administrador' } as any);
    const catalog = (await getDoc(doc(context.db, 'configuracion_sistema', 'espacios'))).data();
    const rating = (await getDoc(doc(context.db, 'calificaciones_espacios', 'rating'))).data();
    observe('BAK-01', { reportedSuccess: result.success, catalogRestored: catalog?.data[0].nombre === 'Original catalog', ratingRestored: rating?.puntaje === 4 });
    expect(result.success).toBe(true);
    expect(catalog?.data[0].nombre).toBe('Original catalog'); expect(rating?.puntaje).toBe(4);
  }, 30000);
  it('BAK-02 rejects a tampered backup fragment using its checksum', async () => {
    const service = await import('../../src/services/reservationService');
    const backup = await import('../../src/services/backupService');
    await service.saveReservation(row('checksum-row'));
    const snapshot = await backup.createDatabaseBackup({ tipo: 'manual', creadoPor: 'Synthetic' });
    const parts = await getDocs(collection(context.db, 'copias_seguridad', snapshot.id, 'partes'));
    const part = parts.docs[0];
    await setDoc(part.ref, { ...part.data(), payload: part.data().payload.replace('Synthetic audit', 'Tampered payload') });
    const loaded = await backup.fetchFullBackupRecord(snapshot.id);
    observe('BAK-02', { tamperedBackupAccepted: !!loaded?.data, changedDescription: loaded?.data?.reservas[0].descripcion });
    expect(loaded?.data).toBeUndefined();
  }, 30000);
  it('HOL-01 keeps an authorized holiday reservation in the confirmed cache', async () => {
    const service = await import('../../src/services/reservationService');
    await service.saveReservation(row('holiday-visible', { fecha: '2026-12-25', claveAutorizacionFeriado: 'CCD' }));
    expect((await getDoc(doc(context.db, 'reservas', 'holiday-visible'))).exists()).toBe(true);
    const visible = service.getLocalCache().some(r => r.id === 'holiday-visible');
    observe('HOL-01', { persisted: true, visibleInConfirmedCache: visible });
    expect(visible).toBe(true);
  });
  it('BAK-03 coordinates two real clients and recovers only an expired backup lease', async () => {
    const { claimScheduledBackup, finishScheduledBackup } = await import('../../src/services/backupScheduleCoordinator');
    const fallback: any = { enabled: true, intervalDays: 15, lastBackupTimestamp: 0, lastBackupDate: '', autoDownloadJson: false, notificarEnCampana: false };
    const claims = await Promise.all(databases.map(db => claimScheduledBackup(db, fallback)));
    expect(claims.filter(c => c.owner)).toHaveLength(1); expect(claims.filter(c => c.busy)).toHaveLength(1);
    const original = claims.find(c => c.owner)!;
    const ref = doc(context.db, 'configuracion_sistema', 'backup_schedule_config');
    const stored = (await getDoc(ref)).data()!;
    await setDoc(ref, { ...stored, lease: { ...stored.lease, expiresAt: Date.now()-1 } });
    const replacement = await claimScheduledBackup(databases[1], fallback); expect(replacement.owner).toBeTruthy(); expect(replacement.owner).not.toBe(original.owner);
    await finishScheduledBackup(context.db, original);
    expect((await getDoc(ref)).data()?.lease.owner).toBe(replacement.owner);
    await finishScheduledBackup(databases[1], replacement);
    expect((await getDoc(ref)).data()?.lease).toBeNull();
  }, 30000);
  it('AUD-03 restores real fragmented snapshots and rejects incomplete manifests', async () => {
    const service = await import('../../src/services/reservationService');
    const { persistAuditEntry, fetchFullAuditEntry } = await import('../../src/services/auditSnapshotService');
    const { restoreAuditChange } = await import('../../src/services/auditLogService');
    const attachment: any = { fileName: 'synthetic.pdf', mimeType: 'application/pdf', size: 225000, uploadedAt: new Date().toISOString(), dataUrl: 'data:application/pdf;base64,'+'A'.repeat(300000) };
    const saved = (await service.saveReservationsBatch(Array.from({length:3},(_,i)=>row(`fragment-${i}`,{espacio:`SYNTHETIC ${i}`,cartaCompromisoAdjunta:attachment})))).reservations;
    await service.commitReservationChanges([], { deletedIds: saved.map(r=>r.id) });
    const entry: any = { id:'audit-fragmented',timestamp:new Date().toISOString(),user:'Synthetic',action:'DELETE_SERIES',description:'Synthetic fragmented deletion',previousState:saved,snapshotVersion:2,affectedCount:3,isReverted:false };
    await persistAuditEntry(entry);
    expect((await getDoc(doc(context.db,'audit_logs',entry.id))).data()?.snapshotParts).toBeGreaterThan(1);
    const full = await fetchFullAuditEntry(entry.id);
    expect((full.previousState as Reservation[])[0].cartaCompromisoAdjunta?.dataUrl?.length).toBe(attachment.dataUrl.length);
    const result = await restoreAuditChange(entry.id,{username:'audit-a',name:'audit-a',role:'Administrador'} as any);
    expect(result.success).toBe(true); expect(result.restoredCount).toBe(3);
    expect((await getDoc(doc(context.db,'reservas','fragment-0'))).data()?.cartaCompromisoAdjunta.dataUrl.length).toBe(attachment.dataUrl.length);
    await setDoc(doc(context.db,'audit_logs','audit-incomplete'),{id:'audit-incomplete',timestamp:entry.timestamp,user:'Synthetic',action:'DELETE',description:'Synthetic missing fragments',snapshotParts:2,snapshotVersion:2,affectedCount:1});
    const incomplete = await restoreAuditChange('audit-incomplete',{username:'audit-a',name:'audit-a',role:'Administrador'} as any);
    expect(incomplete.success).toBe(false); expect((await getDoc(doc(context.db,'audit_logs','audit-incomplete'))).data()?.isReverted).not.toBe(true);
    expect((await getDocs(collection(context.db,'reservas'))).size).toBe(3);
  }, 60000);
});
