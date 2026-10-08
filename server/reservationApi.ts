import { applyIndependentReservationGroup } from "../src/services/migrations/groupIndependentReservations";
import type { Express, Request, Response } from "express";
import type { Firestore } from "firebase-admin/firestore";
import { randomUUID, createHash } from "node:crypto";
import type { AppSessions } from "./appSession";
import {
  accountId,
  ApiFailure,
  apiError,
  requireManager,
  reservationPermission,
} from "./dataApi";
import {
  writeReservations,
  ReservationWriteError,
  type WriteOptions,
} from "../src/services/reservationWriter";
import type { Reservation, AuditChangeLogEntry } from "../src/types";
import {
  buildAuditRestorePlan,
  auditStateRows,
} from "../src/utils/auditRestore";
import { splitBackupPayload } from "../src/utils/backupChunks";
import {
  findMaintenanceBlockConflicts,
  isReservationActiveForAvailability,
} from "../src/utils/conflictDetector";
import { isChileanHoliday } from "../src/utils/holidayUtils";

const clean = (value: any): any => JSON.parse(JSON.stringify(value));
const hash = (value: any) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function readAudit(
  db: Firestore,
  id: string,
): Promise<AuditChangeLogEntry> {
  const snapshot = await db.doc(`audit_logs/${id}`).get();
  if (!snapshot.exists)
    throw new ApiFailure(404, "No se encontró el registro.");
  const entry: any = { ...snapshot.data(), id };
  if (entry.operationParts) {
    const before: Reservation[] = [],
      after: Reservation[] = [];
    for (const key of entry.operationParts) {
      let payload = "";
      for (const partId of key.keys || [key]) {
        const part = await db.doc(`audit_logs/${id}/partes/${partId}`).get();
        if (!part.exists || typeof part.get("payload") !== "string")
          throw new ApiFailure(
            409,
            "El respaldo de auditoría está incompleto.",
          );
        payload += part.get("payload");
      }
      const data = JSON.parse(payload);
      before.push(...data.previousState);
      after.push(...data.newState);
    }
    entry.previousState = before;
    entry.newState = after;
  } else if (entry.snapshotParts) {
    let serialized = "";
    for (let i = 0; i < entry.snapshotParts; i++) {
      const part = await db.doc(`audit_logs/${id}/partes/${i}`).get();
      if (!part.exists || part.get("index") !== i)
        throw new ApiFailure(409, "El respaldo está incompleto.");
      serialized += part.get("payload");
    }
    Object.assign(entry, JSON.parse(serialized));
  }
  return entry;
}

/** Each reservation/slot commit also commits its authoritative audit snapshot.
 * The manifest doubles as a durable operation receipt across server restarts. */
export async function commitTrusted(
  db: Firestore,
  sessions: AppSessions,
  token: string,
  actor: any,
  rows: Reservation[],
  options: WriteOptions,
) {
  const operationId = options.operationId!;
  if (!/^[\w-]{1,180}$/.test(operationId))
    throw new ApiFailure(400, "Identificador de operación no válido.");
  if (options.allowConflictOverride || options.auditRestore)
    requireManager(actor);
  const auditRef = db.doc(`audit_logs/AUDIT_OP_${operationId}`);
  const fingerprint = hash({
    rows,
    deletedIds: options.deletedIds || [],
    expectedVersions: options.expectedVersions || {},
    intent: options.intent,
    override: !!options.allowConflictOverride,
    restore: options.auditRestore?.logId,
  });
  const receipt = await auditRef.get(),
    old = receipt.data();
  if (
    old &&
    (old.operationActor !== actor.username || old.fingerprint !== fingerprint)
  )
    throw new ApiFailure(
      409,
      "El identificador ya pertenece a otra operación.",
    );
  const acknowledged = new Set<string>(old?.confirmedIds || []);
  const remaining = rows.filter((r) => !acknowledged.has(r.id)),
    deletions = (options.deletedIds || []).filter(
      (id) => !acknowledged.has(id),
    );
  for (const id of deletions)
    if (!Number.isInteger(options.expectedVersions?.[id]))
      throw new ApiFailure(
        409,
        "Elimina utilizando la versión seleccionada, después de recargar la reserva.",
      );
  const trustedRows = remaining.map((r) => ({
    ...r,
    createdBy: r.createdBy,
    editadoPor: actor.name || actor.username,
  }));
  const result = await writeReservations(db as any, trustedRows, clean, {
    ...options,
    expectedVersions: Object.fromEntries(
      Object.entries(options.expectedVersions || {}).filter(
        ([id]) => !acknowledged.has(id),
      ),
    ),
    deletedIds: deletions,
    actor: actor.username,
    serverHooks: {
      before: async (tx, chunk, current, saved) => {
        const [account, manifest] = await Promise.all([
          tx.get(db.doc(`usuarios_sistema/${accountId(actor.username)}`)),
          tx.get(auditRef),
        ]);
        const fresh = account.exists() ? account.data() : null;
        if (!sessions.acceptsAccount(token, fresh as any))
          throw new ApiFailure(
            401,
            "La cuenta o su contraseña cambió. Inicia sesión nuevamente.",
          );
        const metadata = manifest.data();
        if (
          metadata &&
          (metadata.operationActor !== actor.username ||
            metadata.fingerprint !== fingerprint)
        )
          throw new ApiFailure(409, "El identificador ya está en uso.");
        const known = new Set<string>(metadata?.confirmedIds || []);
        if (chunk.every((id) => known.has(id)))
          return chunk.flatMap((id) =>
            current.has(id) ? [current.get(id)!] : [],
          );
        if (chunk.some((id) => known.has(id)))
          throw new ApiFailure(
            409,
            "Otra sesión confirmó parte de la operación. Reanuda el guardado.",
          );
        for (const id of chunk) {
          const key = deletions.includes(id)
            ? "canDeleteReservations"
            : current.has(id)
              ? "canEditReservations"
              : "canCreateReservations";
          if (!reservationPermission(fresh, key))
            throw new ApiFailure(
              403,
              "Tu cuenta no tiene permiso para esta operación.",
            );
        }
        if (options.allowConflictOverride || options.auditRestore)
          requireManager(fresh);
        const active = saved.filter((r) =>
          isReservationActiveForAvailability(r, new Set()),
        );
        if (
          active.some(
            (r) => isChileanHoliday(r.fecha) || r.horarioExtendidoAutorizado,
          )
        )
          requireManager(fresh);
        const blocks = await tx.get(db.collection("bloqueos_espacios"));
        if (
          !options.allowConflictOverride &&
          findMaintenanceBlockConflicts(
            active,
            blocks.docs.map((d: any) => ({ ...d.data(), id: d.id })),
          ).length
        )
          throw new ApiFailure(
            409,
            "El espacio tiene un bloqueo de mantenimiento. No se guardó este grupo.",
          );
        saved.forEach((r) => {
          r.createdBy =
            current.get(r.id)?.createdBy || actor.name || actor.username;
        });
        const payload = JSON.stringify({
          previousState: chunk.flatMap((id) =>
            current.has(id) ? [current.get(id)] : [],
          ),
          newState: saved,
        });
        const pieces = splitBackupPayload(payload, 700000);
        // Operation pieces are JSON fragments; readAudit joins each committed chunk.
        // Keep one JSON object per piece by using a separate array of rows when large.

        if (
          Buffer.byteLength(payload) +
            Buffer.byteLength(JSON.stringify(saved)) >
          8000000
        )
          throw new ApiFailure(
            413,
            "La operación excede el tamaño transaccional seguro.",
          );
        const key = hash(chunk).slice(0, 24),
          confirmedIds = [...known, ...chunk];
        const description =
          metadata?.description ||
          (options.auditRestore
            ? "Restauración confirmada"
            : deletions.length
              ? "Eliminación confirmada"
              : saved.some((r) => r.reemplazaReservaId && !current.has(r.id))
                ? "Reemplazada solo una sesión con una actividad excepcional"
                : saved.some(
                      (r) =>
                        current.has(r.id) &&
                        ["fecha", "horaInicio", "horaFin"].some(
                          (k) =>
                            (r as any)[k] !== (current.get(r.id) as any)[k],
                        ),
                    )
                  ? "Movidas reservas con verificación de versiones y disponibilidad"
                  : options.intent === "create"
                    ? "Creación confirmada"
                    : "Guardado confirmado (incluye recuperación)");
        const entry = {
          id: auditRef.id,
          timestamp: metadata?.timestamp || new Date().toISOString(),
          user: actor.name || actor.username,
          userRole: fresh.role,
          action:
            deletions.length && !rows.length
              ? "DELETE_BATCH"
              : metadata?.action === "UPDATE" || current.size
                ? "UPDATE"
                : rows.length > 1
                  ? "BULK_IMPORT"
                  : "CREATE",
          description,
          reservaId: rows[0]?.id || deletions[0] || operationId,
          affectedCount: confirmedIds.length,
          isReverted: false,
          snapshotVersion: 2,
          operationActor: actor.username,
          fingerprint,
          confirmedIds,
          operationParts: [
            ...(metadata?.operationParts || []),
            { keys: pieces.map((_, i) => `${key}_${i}`) },
          ],
        };
        if (Buffer.byteLength(JSON.stringify(entry)) > 900000)
          throw new ApiFailure(
            413,
            "La operación contiene demasiados registros. Divide la importación.",
          );
        return () => {
          pieces.forEach((payload, i) =>
            tx.set(db.doc(`audit_logs/${auditRef.id}/partes/${key}_${i}`), {
              payload,
            }),
          );
          tx.set(auditRef, clean(entry));
        };
      },
    },
  });
  const previousRows = await Promise.all(
    rows
      .filter((r) => acknowledged.has(r.id))
      .map((r) => db.doc(`reservas/${r.id}`).get()),
  );
  result.reservations.push(
    ...previousRows
      .filter((s) => s.exists)
      .map((s) => ({ ...s.data(), id: s.id }) as Reservation),
  );
  result.confirmedIds = [...acknowledged, ...result.confirmedIds];
  result.deletedIds = [
    ...(options.deletedIds || []).filter((id) => acknowledged.has(id)),
    ...result.deletedIds,
  ];
  return result;
}

export function registerReservationApi(
  app: Express,
  db: Firestore,
  sessions: AppSessions,
) {
  app.post(
    "/api/reservations/group",
    sessions.requireAuth,
    async (req, res) => {
      try {
        const actor = (req as any).user;
        requireManager(actor);
        const group = req.body.group;
        if (
          !group ||
          !/^SER_[\w-]{1,150}$/.test(group.seriesId) ||
          !Array.isArray(group.reservations) ||
          group.reservations.some(
            (r: any) => typeof r.id !== "string" || r.id.includes("/"),
          )
        )
          throw new ApiFailure(400, "Grupo no válido.");
        const changed = await applyIndependentReservationGroup(
          db as any,
          group,
          actor.name || actor.username,
          async (tx) => {
            const snapshot = await tx.get(
                db.doc(`usuarios_sistema/${accountId(actor.username)}`),
              ),
              user = snapshot.data();
            if (!sessions.acceptsAccount(req.get("authorization") || "", user))
              throw new ApiFailure(401, "La sesión cambió.");
            if (!reservationPermission(user, "canEditReservations"))
              throw new ApiFailure(403, "No tienes permiso para editar.");
            requireManager(user);
          },
        );
        res.json({ success: true, changed });
      } catch (error) {
        apiError(res, error);
      }
    },
  );
  app.post(
    "/api/reservations/commit",
    sessions.requireAuth,
    async (req: Request, res: Response) => {
      const streaming = req.get("accept") === "application/x-ndjson";
      const reply = (body: any) =>
        streaming ? res.end(JSON.stringify(body) + "\n") : res.json(body);
      try {
        const input = req.body.options || {},
          actor = (req as any).user,
          token = req.get("authorization") || "";
        const rows = req.body.reservations;
        if (
          !Array.isArray(rows) ||
          rows.length > 10000 ||
          !Array.isArray(input.deletedIds || []) ||
          (input.deletedIds || []).length > 10000
        )
          throw new ApiFailure(400, "Operación no válida.");
        if (
          [...rows.map((r: any) => r.id), ...(input.deletedIds || [])].some(
            (id) =>
              typeof id !== "string" ||
              !id ||
              id.includes("/") ||
              id.length > 128,
          )
        )
          throw new ApiFailure(400, "ID de reserva no válido.");
        let options: WriteOptions = {
          operationId: input.operationId,
          deletedIds: input.deletedIds,
          expectedVersions: input.expectedVersions,
          intent: input.intent,
          requireAtomic: !!input.requireAtomic,
          allowConflictOverride: !!input.allowConflictOverride,
        };
        let targets = rows;
        if (input.restoreLogId) {
          requireManager(actor);
          if (!/^[\w-]{1,180}$/.test(input.restoreLogId))
            throw new ApiFailure(400, "Registro no válido.");
          const entry = await readAudit(db, input.restoreLogId);
          if (entry.isReverted) {
            reply({
              success: true,
              result: {
                operationId: `RESTORE_${entry.id}`,
                confirmedIds: [],
                deletedIds: [],
                pendingIds: [],
                reservations: [],
              },
            });
            return;
          }
          const current = new Map<string, Reservation>();
          for (const id of new Set(
            [
              ...auditStateRows(entry.previousState),
              ...auditStateRows(entry.newState),
            ].map((r) => r.id),
          )) {
            const s = await db.doc(`reservas/${id}`).get();
            if (s.exists) current.set(id, { ...s.data(), id } as Reservation);
          }
          const plan = buildAuditRestorePlan(entry, current),
            timestamp = new Date().toISOString();
          targets = plan.reservations;
          options = {
            operationId: `RESTORE_${entry.id}`,
            requireAtomic: true,
            expectedVersions: plan.expectedVersions,
            deletedIds: plan.deletedIds,
            auditRestore: {
              logId: entry.id,
              timestamp,
              actor: actor.name,
              log: {
                id: `AUDIT_RESTORE_${entry.id}`,
                timestamp,
                user: actor.name,
                userRole: actor.role,
                action: "RESTORE",
                description: "Restauración transaccional",
                reservaId: entry.reservaId,
                affectedCount: plan.affectedCount,
                isReverted: false,
              },
            },
          };
        }
        if (streaming) {
          res.set({
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
          });
          res.flushHeaders();
        }
        options.onProgress = (progress) => {
          if (res.destroyed && progress.pendingIds.length)
            throw new Error("La conexión se cerró. Reanuda el guardado.");
          if (streaming && !res.destroyed)
            res.write(JSON.stringify({ progress }) + "\n");
        };
        const result = await commitTrusted(
          db,
          sessions,
          token,
          actor,
          targets,
          options,
        );
        reply({
          success: true,
          result,
          auditEntry: await auditRefSummary(db, result.operationId),
        });
      } catch (error) {
        if (error instanceof ReservationWriteError) {
          reply({ success: true, error: error.message, result: error.result });
        } else if (streaming && res.headersSent)
          reply({ success: false, error: (error as Error).message });
        else apiError(res, error);
      }
    },
  );
  app.post("/api/audit/record", sessions.requireAuth, async (req, res) => {
    try {
      const actor = (req as any).user;
      requireManager(actor);
      if (req.body.previousState || req.body.newState)
        throw new ApiFailure(
          400,
          "Los snapshots se generan al confirmar las reservas.",
        );
      const action = req.body.action;
      if (
        !["BACKUP_CREATED", "BACKUP_RESTORED", "SYSTEM_SYNC"].includes(action)
      )
        throw new ApiFailure(400, "Acción no válida.");
      const id = `AUDIT_META_${randomUUID()}`,
        entry = {
          id,
          timestamp: new Date().toISOString(),
          action,
          user: actor.name,
          userRole: actor.role,
          description: String(req.body.description || "").slice(0, 500),
          reservaId: String(req.body.reservaId || "").slice(0, 180),
          isReverted: false,
        };
      await db.doc(`audit_logs/${id}`).set(entry);
      res.json({ success: true, entry });
    } catch (error) {
      apiError(res, error);
    }
  });
}

async function auditRefSummary(db: Firestore, id: string) {
  const s = await db.doc(`audit_logs/AUDIT_OP_${id}`).get();
  if (!s.exists) return null;
  const { fingerprint, operationActor, confirmedIds, ...entry } = s.data()!;
  return entry;
}
