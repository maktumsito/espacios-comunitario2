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
import { registerDataApi } from "../dataApi";
import { registerReservationApi, readAudit } from "../reservationApi";
import { registerBackupApi } from "../backupApi";
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
      const s = await db.doc(`usuarios_sistema/${name}`).get();
      return s.exists ? (s.data() as any) : null;
    }, "synthetic-trusted-server-secret-32-characters");
    const api = express();
    api.use(express.json({ limit: "50mb" }));
    accounts.register(api);
    const stop = registerDataApi(api, db, accounts);
    registerReservationApi(api, db, accounts);
    registerBackupApi(api, db, accounts);
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
