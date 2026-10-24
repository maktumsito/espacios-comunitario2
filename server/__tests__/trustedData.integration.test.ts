import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  initializeApp as clientApp,
  deleteApp as deleteClient,
} from "firebase/app";
import {
  getFirestore as clientDb,
  connectFirestoreEmulator,
  doc,
  setDoc,
  getDoc,
  terminate,
} from "firebase/firestore";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { AppSessions } from "../appSession";
import { hashPassword } from "../passwords";
import { accountId, registerDataApi } from "../dataApi";
import { registerReservationApi, readAudit, commitTrusted } from "../reservationApi";
import { registerBackupApi } from "../backupApi";
import { registerBackupMaintenanceApi } from '../backupMaintenanceApi';
import { claimDelivery, startDelivery, finishDelivery } from "../deliveryLease";
import { backupChecksum } from "../../src/utils/backupIntegrity";

const enabled = process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8087";
describe.skipIf(!enabled)(
  "trusted API with real rules and transactions",
  () => {
    const app = initializeApp(
        { projectId: "demo-espacios" },
        "trusted-api-test",
      ),
      db = getFirestore(app);
    const sdkApp = clientApp(
        { projectId: "demo-espacios", apiKey: "local-only" },
        "denied-sdk-test",
      ),
      sdk = clientDb(sdkApp);
    connectFirestoreEmulator(sdk, "127.0.0.1", 8087);
    const accounts = new AppSessions(async (name) => {
      const s = await db.doc(`usuarios_sistema/${accountId(name)}`).get();
      return s.exists ? (s.data() as any) : null;
    }, "synthetic-trusted-server-secret-32-characters");
    const api = express();
    api.use(express.json({ limit: "50mb" }));
    accounts.register(api);
    const stop = registerDataApi(api, db, accounts);
    registerReservationApi(api, db, accounts);
    registerBackupApi(api, db, accounts);
    registerBackupMaintenanceApi(api, db, accounts);
    let server: ReturnType<typeof api.listen>,
      base: string,
      editor: string,
      reader: string;
    const row = (id: string, date = "2026-10-13") => ({
      id,
      fecha: date,
      horaInicio: "10:00",
      horaFin: "11:00",
      espacio: "SALA 2",
      responsable: "Synthetic",
      tipoActividad: "Taller",
      descripcion: "Synthetic",
      actividadRecurrente: "No",
      estado: "activa",
      terminaDiaSiguiente: false,
      version: 0,
    });
    const post = async (path: string, body: any, token = editor) => {
      const r = await fetch(base + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      return { status: r.status, ...(await r.json()) };
    };
    beforeAll(async () => {
      server = api.listen(0, "127.0.0.1");
      await new Promise<void>((r) => server.once("listening", r));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    beforeEach(async () => {
      await fetch(
        "http://127.0.0.1:8087/emulator/v1/projects/demo-espacios/databases/(default)/documents",
        { method: "DELETE" },
      );
      const passwordHash = await hashPassword("Synthetic-only-123!");
      await db
        .doc("usuarios_sistema/editor")
        .set({
          username: "editor",
          name: "Editor",
          role: "Administrador",
          isMasterAdmin: true,
          passwordHash,
        });
      await db
        .doc("usuarios_sistema/reader")
        .set({
          username: "reader",
          name: "Reader",
          role: "Auxiliar",
          passwordHash,
          canCreateReservations: false,
          canEditReservations: false,
          canDeleteReservations: false,
        });
      editor = (
        await post(
          "/api/auth/session",
          { username: "editor", password: "Synthetic-only-123!" },
          "",
        )
      ).token;
      reader = (
        await post(
          "/api/auth/session",
          { username: "reader", password: "Synthetic-only-123!" },
          "",
        )
      ).token;
    }, 30000);
    afterAll(async () => {
      stop();
      await new Promise<void>((r) => server.close(() => r()));
      await terminate(sdk);
      await deleteClient(sdkApp);
      await db.terminate();
      await deleteApp(app);
    });
    it("denies anonymous SDK/REST, forged authors and reader writes, but allows signed reads", async () => {
      await expect(
        setDoc(doc(sdk, "reservas", "forged"), row("forged")),
      ).rejects.toThrow();
      await expect(
        getDoc(doc(sdk, "usuarios_sistema", "editor")),
      ).rejects.toThrow();
      expect(
        (
          await fetch(
            "http://127.0.0.1:8087/v1/projects/demo-espacios/databases/(default)/documents/reservas/forged",
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: '{"fields":{}}',
            },
          )
        ).ok,
      ).toBe(false);
      expect(
        (await post("/api/data/read", { path: "reservas", kind: "query" }, ""))
          .status,
      ).toBe(401);
      expect(
        (
          await post(
            "/api/data/read",
            { path: "reservas", kind: "query" },
            reader,
          )
        ).status,
      ).toBe(200);
      const auth = getAuth(sdkApp);
      connectAuthEmulator(auth, "http://127.0.0.1:9099", {
        disableWarnings: true,
      });
      await createUserWithEmailAndPassword(
        auth,
        `reader-${crypto.randomUUID()}@example.test`,
        "Synthetic-only-123!",
      );
      expect(auth.currentUser).not.toBeNull();
      await expect(
        setDoc(
          doc(sdk, "reservas", "authenticated-forged"),
          row("authenticated-forged"),
        ),
      ).rejects.toThrow();
      expect(
        (
          await post("/api/data/write", {
            writes: [
              {
                path: "audit_logs/forged",
                type: "set",
                data: { user: "Forged" },
              },
            ],
          })
        ).status,
      ).toBe(403);
      const denied = await post(
        "/api/reservations/commit",
        {
          reservations: [row("reader-write")],
          options: { operationId: "reader-write" },
        },
        reader,
      );
      expect(denied.error).toMatch(/permiso/);
      expect((await db.doc("reservas/reader-write").get()).exists).toBe(false);
      const profile = await post("/api/data/read", {
        path: "usuarios_sistema/editor",
        kind: "document",
      });
      expect(profile.docs[0].data.passwordHash).toBe("");
    });
    it("invalidates login and renewal immediately after password rotation", async () => {
      expect(
        (
          await post("/api/users/password", {
            username: "editor",
            currentPassword: "Synthetic-only-123!",
            newPassword: "Different-only-456!",
          })
        ).status,
      ).toBe(200);
      expect(
        (await post("/api/data/read", { path: "reservas", kind: "query" }))
          .status,
      ).toBe(401);
      expect((await post("/api/auth/session/refresh", {})).status).toBe(401);
      expect(
        (
          await post(
            "/api/auth/session",
            { username: "editor", password: "Different-only-456!" },
            "",
          )
        ).status,
      ).toBe(200);
    });
    it('enforces permissions assigned by the legacy Cristian administrator on real reservation transactions and active sessions', async () => {
      await db.doc(`usuarios_sistema/${accountId('cristian shute')}`).set({
        username: 'cristian shute', name: 'Titular de prueba', role: 'Administrador',
        passwordHash: await hashPassword('Fixture-master-123!'),
      });
      const master = await post('/api/auth/session', { username: 'cristian shute', password: 'Fixture-master-123!' }, '');
      const user = { username: 'ana.prueba', name: 'Ana de prueba', role: 'Auxiliar',
        canCreateReservations: true, canEditReservations: false, canDeleteReservations: false };
      expect((await post('/api/users/save', { user, password: 'Fixture-ana-123!' }, master.token)).status).toBe(200);
      const ana = await post('/api/auth/session', { username: user.username, password: 'Fixture-ana-123!' }, '');
      expect(ana.status).toBe(200);
      const created = await post('/api/reservations/commit', { reservations: [row('ana-reservation')],
        options: { operationId: 'ana-create', intent: 'create' } }, ana.token);
      expect(created.status).toBe(200);
      const original = created.result.reservations[0];
      const edit = { reservations: [{ ...original, descripcion: 'Editada por Ana' }], options: { operationId: 'ana-edit', intent: 'update' } };
      expect((await post('/api/reservations/commit', edit, ana.token)).error).toMatch(/permiso/);
      expect((await db.doc('reservas/ana-reservation').get()).get('version')).toBe(1);
      expect((await post('/api/users/save', { user: { ...user, canEditReservations: true } }, editor)).status).toBe(403);
      expect((await post('/api/users/save', { user: { ...user, canEditReservations: true } }, master.token)).status).toBe(200);
      expect((await post('/api/reservations/commit', edit, ana.token)).error).toBeUndefined();
      expect((await db.doc('reservas/ana-reservation').get()).get('version')).toBe(2);
      const remove = { reservations: [], options: { operationId: 'ana-delete', deletedIds: ['ana-reservation'], expectedVersions: { 'ana-reservation': 2 } } };
      expect((await post('/api/reservations/commit', remove, ana.token)).error).toMatch(/permiso/);
      expect((await db.doc('reservas/ana-reservation').get()).exists).toBe(true);
      expect((await post('/api/users/save', { user: { ...user, canEditReservations: true, canDeleteReservations: true } }, master.token)).status).toBe(200);
      expect((await post('/api/reservations/commit', remove, ana.token)).error).toBeUndefined();
      expect((await db.doc('reservas/ana-reservation').get()).exists).toBe(false);
      expect((await post('/api/users/save', { user: { ...user, canCreateReservations: false } }, master.token)).status).toBe(200);
      expect((await post('/api/reservations/commit', { reservations: [row('ana-blocked')],
        options: { operationId: 'ana-blocked', intent: 'create' } }, ana.token)).error).toMatch(/permiso/);
      expect((await db.doc('reservas/ana-blocked').get()).exists).toBe(false);
    });

    it('preserves existing passwords on profile edits and authenticates a reassigned password', async () => {
      const before = (await db.doc('usuarios_sistema/reader').get()).get('passwordHash');
      const user = { username: 'reader', name: 'Lector actualizado', role: 'Auxiliar' };
      expect((await post('/api/users/save', { user, password: '' })).status).toBe(200);
      expect((await db.doc('usuarios_sistema/reader').get()).get('passwordHash')).toBe(before);
      expect((await post('/api/auth/session/refresh', {}, reader)).status).toBe(200);
      expect((await post('/api/users/save', { user, password: '  Reassigned-123!  ' })).status).toBe(200);
      expect((await post('/api/auth/session/refresh', {}, reader)).status).toBe(401);
      expect((await post('/api/auth/session', { username: 'reader', password: 'Synthetic-only-123!' }, '')).status).toBe(401);
      expect((await post('/api/auth/session', { username: 'reader', password: 'Reassigned-123!' }, '')).status).toBe(200);
    });
    it('protects backup conservation on the server, blocks old write paths and deletes parts atomically with an audit record', async () => {
      await db.doc(`usuarios_sistema/${accountId('cristian shute')}`).set({username:'cristian shute',name:'Titular',role:'Administrador',passwordHash:await hashPassword('Fixture-owner-123!')});
      const owner = await post('/api/auth/session',{username:'cristian shute',password:'Fixture-owner-123!'},'');
      await db.doc('copias_seguridad/backup-first').set({tipo:'manual',timestamp:'2026-10-23T12:00:00Z'});
      await db.doc('copias_seguridad/backup-keep').set({tipo:'manual',timestamp:'2026-10-24T12:00:00Z'});
      await db.doc('copias_seguridad/backup-first/partes/part-0').set({index:0,payload:'fixture'});
      expect((await post('/api/maintenance/backups/protect',{backupId:'backup-first',protected:true},editor)).status).toBe(403);
      expect((await post('/api/maintenance/backups/protect',{backupId:'backup-first',protected:true},owner.token)).status).toBe(200);
      expect((await post('/api/maintenance/backups/delete',{backupId:'backup-first'},owner.token)).status).toBe(409);
      for (const type of ['update','delete']) expect((await post('/api/data/write',{writes:[{path:'copias_seguridad/backup-first',type,data:{protected:false}}]},owner.token)).status).toBe(403);
      expect((await post('/api/data/write',{writes:[{path:'copias_seguridad/backup-first',type:'set',data:{tipo:'manual'}}]},owner.token)).status).toBe(409);
      expect((await post('/api/data/write',{writes:[{path:'copias_seguridad/backup-first/partes/new-part',type:'set',data:{payload:'forged'}}]},owner.token)).status).toBe(409);
      expect((await post('/api/maintenance/backups/protect',{backupId:'backup-first',protected:false},owner.token)).status).toBe(200);
      expect((await post('/api/maintenance/backups/delete',{backupId:'backup-first',mode:'rotation'},owner.token)).status).toBe(409);
      expect((await post('/api/maintenance/backups/delete',{backupId:'backup-first'},owner.token)).status).toBe(200);
      expect((await db.doc('copias_seguridad/backup-first').get()).exists).toBe(false);
      expect((await db.collection('copias_seguridad/backup-first/partes').get()).empty).toBe(true);
      expect((await post('/api/maintenance/backups/delete',{backupId:'backup-keep'},owner.token)).status).toBe(409);
      const status = await post('/api/maintenance/status',{},owner.token);
      expect(status.status).toBe(200);
      expect(status.backups.map((b:any)=>b.id)).toEqual(['backup-keep']);
      expect(status.logs.map((log:any)=>log.action).sort()).toEqual(['backup_deleted','backup_protected','backup_unprotected']);
      expect((await post('/api/maintenance/status',{},reader)).status).toBe(403);
    });

    it('creates immutable backup parts before publishing their metadata and enforces automatic retention on the server', async () => {
      await db.doc(`usuarios_sistema/${accountId('cristian shute')}`).set({username:'cristian shute',name:'Titular',role:'Administrador',passwordHash:await hashPassword('Fixture-owner-123!')});
      const owner = await post('/api/auth/session',{username:'cristian shute',password:'Fixture-owner-123!'},'');
      expect((await post('/api/data/write',{writes:[{path:'copias_seguridad/new-copy/partes/part-0',type:'set',data:{index:0,payload:'content'}}]})).status).toBe(200);
      expect((await post('/api/data/write',{writes:[{path:'copias_seguridad/new-copy',type:'set',data:{timestamp:'2026-10-24T12:00:00Z',tipo:'manual'}}]})).status).toBe(200);
      expect((await post('/api/data/write',{writes:[{path:'copias_seguridad/new-copy',type:'set',data:{timestamp:'2026-10-24T12:00:00Z',tipo:'manual'}}]})).status).toBe(200);
      for(let index=0;index<7;index++) await db.doc(`copias_seguridad/auto-${index}`).set({tipo:'automatica_15_dias',timestamp:`2026-10-2${index}T12:00:00Z`});
      expect((await post('/api/maintenance/backups/delete',{backupId:'auto-6',mode:'rotation'},owner.token)).status).toBe(409);
      expect((await post('/api/maintenance/backups/delete',{backupId:'auto-0',mode:'rotation'},owner.token)).status).toBe(200);
      expect((await db.doc('copias_seguridad/auto-0').get()).exists).toBe(false);
      expect((await db.doc('copias_seguridad/new-copy').get()).exists).toBe(true);
    });
    it("rejects stale edits and deletions, captures authoritative audit and retries after later edits safely", async () => {
      const request = {
        reservations: [{ ...row("race"), createdBy: "Forged" }],
        options: { operationId: "create-race", intent: "create" },
      };
      const created = await post("/api/reservations/commit", request);
      expect(created.error).toBeUndefined();
      expect(created.result.reservations[0].createdBy).toBe("Editor");
      const initial = created.result.reservations[0];
      const outcomes = await Promise.all(
        ["one", "two"].map((id) =>
          post("/api/reservations/commit", {
            reservations: [{ ...initial, descripcion: id }],
            options: { operationId: `edit-${id}`, intent: "update" },
          }),
        ),
      );
      expect(outcomes.filter((r) => !r.error)).toHaveLength(1);
      const deletion = await post("/api/reservations/commit", {
        reservations: [],
        options: {
          operationId: "stale-delete",
          deletedIds: ["race"],
          expectedVersions: { race: 1 },
        },
      });
      expect(deletion.error).toMatch(/otro usuario/);
      const retry = await post("/api/reservations/commit", request);
      expect(retry.error).toBeUndefined();
      expect(retry.result.reservations[0].version).toBe(2);
      const audit = await readAudit(db, "AUDIT_OP_create-race");
      expect((audit.newState as any[])[0].version).toBe(1);
      expect(audit.user).toBe("Editor");
      expect(
        (await db.doc("schedule_slots/2026-10-13_SALA%202").get()).get(
          "bookings",
        ),
      ).toHaveLength(1);
    });
    it("avoids unchanged slot writes and stores small audit snapshots without extra part documents", async () => {
      const created = await post('/api/reservations/commit', { reservations: [row('quota')],
        options: { operationId: 'quota-create', intent: 'create' } });
      expect(created.error).toBeUndefined();
      const slotRef = db.doc('schedule_slots/2026-10-13_SALA%202');
      const initialSlot = await slotRef.get();
      const edited = await post('/api/reservations/commit', {
        reservations: [{ ...created.result.reservations[0], descripcion: 'Metadata only' }],
        options: { operationId: 'quota-edit', intent: 'update' },
      });
      expect(edited.error).toBeUndefined();
      expect((await slotRef.get()).updateTime?.isEqual(initialSlot.updateTime!)).toBe(true);
      const auditRef = db.doc('audit_logs/AUDIT_OP_quota-edit');
      const initialAudit = await auditRef.get();
      expect((await auditRef.collection('partes').get()).empty).toBe(true);
      const audit = await readAudit(db, auditRef.id);
      expect(audit.previousState).toHaveLength(1);
      expect((audit.newState as any[])[0].descripcion).toBe('Metadata only');
      expect(edited.auditEntry.newState).toEqual(audit.newState);
      expect(edited.auditEntry).not.toHaveProperty('fingerprint');
      expect(edited.auditEntry).not.toHaveProperty('operationActor');
      expect(edited.result).not.toHaveProperty('auditEntry');
      const retry = await post('/api/reservations/commit', {
        reservations: [{ ...created.result.reservations[0], descripcion: 'Metadata only' }],
        options: { operationId: 'quota-edit', intent: 'update' },
      });
      expect(retry.error).toBeUndefined();
      expect((await auditRef.get()).updateTime?.isEqual(initialAudit.updateTime!)).toBe(true);
      expect((await slotRef.get()).updateTime?.isEqual(initialSlot.updateTime!)).toBe(true);
    });
    it('retains large audit snapshots in parts and reconstructs them completely', async () => {
      const comentarios = 'á'.repeat(12_000);
      const created = await post('/api/reservations/commit', {
        reservations: [{ ...row('large-quota'), comentarios }], options: { operationId: 'large-quota' },
      });
      expect(created.error).toBeUndefined();
      const ref = db.doc('audit_logs/AUDIT_OP_large-quota');
      expect((await ref.get()).get('operationParts')).toHaveLength(1);
      expect((await ref.collection('partes').get()).size).toBe(1);
      expect(((await readAudit(db, ref.id)).newState as any[])[0].comentarios).toBe(comentarios);
    });
    it('preserves every audit part when resuming an operation split across transactions', async () => {
      const rows = Array.from({ length: 220 }, (_, i) => ({ ...row(`multipart-${i}`), espacio: `ESPACIO ${i}` }));
      const actor = { username: 'editor', name: 'Editor', role: 'Administrador', isMasterAdmin: true };
      const options = { operationId: 'multipart-quota', intent: 'create' as const };
      await expect(commitTrusted(db, accounts, editor, actor, rows, { ...options, onProgress: progress => {
        if (progress.pendingIds.length) throw new Error('Simulated disconnect');
      } })).rejects.toThrow('Simulated disconnect');
      const result = await commitTrusted(db, accounts, editor, actor, rows, options);
      expect(new Set(result.confirmedIds).size).toBe(220);
      expect(result.pendingIds).toEqual([]);
      expect(result.auditEntry.operationParts).toHaveLength(2);
      const audit = await readAudit(db, 'AUDIT_OP_multipart-quota');
      expect(audit.previousState).toEqual([]);
      expect(new Set((audit.newState as any[]).map(r => r.id)).size).toBe(220);
    });
    it('checks long maintenance ranges and next-day overnight blocks with the bounded query', async () => {
      await db.doc('bloqueos_espacios/long').set({ espacio: 'SALA 2', fechaInicio: '2026-01-01',
        fechaFin: '2026-10-13', activo: true, todoElDia: true, motivo: 'Long block' });
      const long = await post('/api/reservations/commit', { reservations: [row('long')], options: { operationId: 'long' } });
      expect(long.error).toMatch(/mantenimiento/);
      await db.doc('bloqueos_espacios/long').delete();
      await db.doc('bloqueos_espacios/next-day').set({ espacio: 'SALA 2', fechaInicio: '2026-10-14',
        fechaFin: '2026-10-14', activo: true, todoElDia: true, motivo: 'Next day' });
      const night = await post('/api/reservations/commit', {
        reservations: [{ ...row('night-quota'), horaInicio: '23:00', horaFin: '01:00', terminaDiaSiguiente: true }],
        options: { operationId: 'night-quota' },
      });
      expect(night.error).toMatch(/mantenimiento/);
      const cancelled = await post('/api/reservations/commit', {
        reservations: [{ ...row('cancelled-quota'), estado: 'cancelada' }], options: { operationId: 'cancelled-quota' },
      });
      expect(cancelled.error).toBeUndefined();
      expect((await db.collection('schedule_slots').get()).empty).toBe(true);
    });
    it("restores authoritative audit once across two concurrent clients", async () => {
      const initial = (
        await post("/api/reservations/commit", {
          reservations: [row("restore")],
          options: { operationId: "restore-create" },
        })
      ).result.reservations[0];
      await post("/api/reservations/commit", {
        reservations: [{ ...initial, descripcion: "Changed" }],
        options: { operationId: "restore-edit" },
      });
      const restore = () =>
        post("/api/reservations/commit", {
          reservations: [],
          options: {
            operationId: "untrusted",
            restoreLogId: "AUDIT_OP_restore-edit",
          },
        });
      const responses = await Promise.all([restore(), restore()]);
      expect(responses.some((r) => !r.error)).toBe(true);
      expect((await db.doc("reservas/restore").get()).get("descripcion")).toBe(
        "Synthetic",
      );
      expect(
        (await db.doc("audit_logs/AUDIT_OP_restore-edit").get()).get(
          "isReverted",
        ),
      ).toBe(true);
      expect((await restore()).error).toBeUndefined();
      expect((await db.doc("reservas/restore").get()).get("version")).toBe(3);
    });
    it("keeps authorized holiday reservations available and caches shared queries", async () => {
      const r = await post("/api/reservations/commit", {
        reservations: [
          { ...row("holiday", "2026-12-25"), claveAutorizacionFeriado: "CCD" },
        ],
        options: { operationId: "holiday" },
      });
      expect(r.error).toBeUndefined();
      const first = await post("/api/data/listen", {
        path: "reservas",
        kind: "query",
      }); // NDJSON endpoint is tested separately below.
      expect(first.docs[0].id).toBe("holiday");
      expect(
        (
          await post("/api/data/listen", {
            path: "reservas",
            kind: "query",
            version: first.version,
          })
        ).unchanged,
      ).toBe(true);
    });
    it("enforces live permission revocation and maintenance blocks inside the transaction", async () => {
      await db
        .doc("usuarios_sistema/editor")
        .update({ canCreateReservations: false });
      const denied = await post("/api/reservations/commit", {
        reservations: [row("revoked")],
        options: { operationId: "revoked" },
      });
      expect(denied.error).toMatch(/permiso/);
      await db
        .doc("usuarios_sistema/editor")
        .update({ canCreateReservations: true });
      await db
        .doc("bloqueos_espacios/blocked")
        .set({
          id: "blocked",
          espacio: "SALA 2",
          fechaInicio: "2026-10-13",
          fechaFin: "2026-10-13",
          todoElDia: true,
          activo: true,
          motivo: "Synthetic maintenance",
        });
      const blocked = await post("/api/reservations/commit", {
        reservations: [row("blocked")],
        options: { operationId: "blocked" },
      });
      expect(blocked.error).toMatch(/mantenimiento/);
      expect((await db.doc("reservas/blocked").get()).exists).toBe(false);
      expect((await db.doc("audit_logs/AUDIT_OP_blocked").get()).exists).toBe(
        false,
      );
    });
    it("allows one scheduled delivery across instances and prevents retries after uncertain acknowledgement", async () => {
      const claims = await Promise.all([
        claimDelivery(db, "2026-10-08"),
        claimDelivery(db, "2026-10-08"),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      const claim = claims.find(Boolean)!;
      await startDelivery(db, claim);
      expect(
        await claimDelivery(db, "2026-10-08", Date.now() + 31 * 60000),
      ).toBeNull();
      await finishDelivery(db, claim, false);
      expect(await claimDelivery(db, "2026-10-08")).toBeNull();
      const next = await claimDelivery(db, "2026-10-09");
      expect(next).not.toBeNull();
    });
    it("restores every exported catalog/entity and refuses tampered content before any write", async () => {
      const profile = {
        username: "editor",
        name: "Restored editor",
        role: "Administrador",
        isMasterAdmin: true,
      };
      const data = {
        version: "2.3.0",
        exportadoEn: "2026-10-08T00:00:00.000Z",
        reservas: [],
        espacios: [{ id: "space", name: "Restored space" }],
        tiposPrestamo: ["Restored loan"],
        tiposActividad: ["Restored activity"],
        equipamiento: [{ id: "item", name: "Restored equipment" }],
        usuarios: [profile],
        calificaciones: [{ id: "rating", value: 4 }],
        bloqueos: [{ id: "block", fecha: "2026-10-13" }],
      };
      const serialized = JSON.stringify(data),
        record = {
          data,
          checksum: await backupChecksum(serialized),
          tamanoBytes: Buffer.byteLength(serialized),
          totalReservas: 0,
          totalEspacios: 1,
          totalEquipamiento: 1,
          totalUsuarios: 1,
          totalCalificaciones: 1,
        };
      const previousHash = (await db.doc("usuarios_sistema/editor").get()).get(
        "passwordHash",
      );
      expect((await post("/api/backups/validate", { record })).status).toBe(
        200,
      );
      expect((await post("/api/backups/entities", { record })).status).toBe(
        200,
      );
      expect(
        (await db.doc("configuracion_sistema/espacios").get()).get("data")[0]
          .name,
      ).toBe("Restored space");
      expect(
        (await db.doc("calificaciones_espacios/rating").get()).exists,
      ).toBe(true);
      expect((await db.doc("bloqueos_espacios/block").get()).exists).toBe(true);
      expect(
        (await db.doc("usuarios_sistema/editor").get()).get("passwordHash"),
      ).toBe(previousHash);
      const tampered = structuredClone(record);
      tampered.data.espacios[0].name = "Tampered";
      expect(
        (await post("/api/backups/entities", { record: tampered })).status,
      ).toBe(400);
      expect(
        (await db.doc("configuracion_sistema/espacios").get()).get("data")[0]
          .name,
      ).toBe("Restored space");
    });
  },
);
