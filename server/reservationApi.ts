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
import type { Reservation, AuditChangeLogEntry, SpaceInfo } from "../src/types";
import {
  buildAuditRestorePlan,
  auditStateRows,
} from "../src/utils/auditRestore";
import { splitBackupPayload } from "../src/utils/backupChunks";
import {
  findMaintenanceBlockConflicts,
  isReservationActiveForAvailability,
  findReservationConflicts,
  normalizeSpace,
  timeToMinutes,
} from "../src/utils/conflictDetector";
import { isChileanHoliday } from "../src/utils/holidayUtils";
import { prepareEquipmentAllocation } from './equipmentAllocation';
import { registerDistributionPlanningApi, validateDistributionDate } from './distributionPlanning';
import { SPACES_LIST } from '../src/data/spacesData';
import { REGULAR_LOAN_START_MINUTES, REGULAR_LOAN_END_MINUTES } from '../src/utils/validationUtils';
import { getDisabledSpaceNames } from '../src/utils/spaceAvailability';
import { getConstituentSpaces } from '../src/utils/conflictDetector';

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
  if (!Array.isArray(options.activateSpaceIds || []) || (options.activateSpaceIds || []).some(id => typeof id !== 'string' || !id || id.length > 200))
    throw new ApiFailure(400, 'La selección de espacios a activar no es válida.');
  const activationIds = [...new Set(options.activateSpaceIds || [])];
  if (activationIds.length && (!options.distributionDate || !options.requireAtomic || activationIds.length > 12))
    throw new ApiFailure(400, 'La activación requiere una distribución confirmada y atómica.');
  if (options.distributionDate) {
    if (!options.requireAtomic || options.allowConflictOverride || options.deletedIds?.length || !rows.length || rows.length > 12 ||
      rows.some(r => r.fecha !== options.distributionDate || !Number.isInteger(options.expectedVersions?.[r.id])))
      throw new ApiFailure(400, 'La distribución requiere de 1 a 12 actividades de la jornada, versiones y guardado atómico sin forzar conflictos.');
  }
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
    ...(options.distributionDate ? { distributionDate: options.distributionDate } : {}),
    ...(activationIds.length ? { activateSpaceIds: activationIds } : {}),
  });
  const receipt = await auditRef.get(),
    old = receipt.data();
  if (options.distributionDate && !old) validateDistributionDate(options.distributionDate);
  let confirmedAudit = old;
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
        if (chunk.every((id) => known.has(id))) {
          confirmedAudit = metadata;
          return chunk.flatMap((id) =>
            current.has(id) ? [current.get(id)!] : [],
          );
        }
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
        const spaceConfig = active.length ? await tx.get(db.doc('configuracion_sistema/espacios')) : undefined;
        const configuredSpaces = Array.isArray(spaceConfig?.data()?.data) ? spaceConfig!.data()!.data : SPACES_LIST;
        const activationSet = new Set(activationIds);
        const selectedSpaces: SpaceInfo[] = configuredSpaces.filter((space: SpaceInfo) => activationSet.has(space.id));
        if (activationIds.length) {
          requireManager(fresh);
          if (selectedSpaces.length !== activationIds.length || selectedSpaces.some(space => !active.some(row =>
            getConstituentSpaces(row.espacio).includes(normalizeSpace(space.name)) || normalizeSpace(row.espacio) === normalizeSpace(space.name))))
            throw new ApiFailure(409, 'Los espacios a activar cambiaron o no forman parte del plan. Recalcula la distribución.');
        }
        const activatedSpaces = selectedSpaces.filter(space => space.activo === false);
        const disabledSpaces = getDisabledSpaceNames(configuredSpaces.filter((space: SpaceInfo) => !activationSet.has(space.id)));
        for (const row of active) {
          const original = current.get(row.id);
          const changesOccupancy = !original || !isReservationActiveForAvailability(original, new Set()) ||
            getConstituentSpaces(original.espacio).sort().join('|') !== getConstituentSpaces(row.espacio).sort().join('|') ||
            Boolean(original.terminaDiaSiguiente) !== Boolean(row.terminaDiaSiguiente) ||
            ['fecha', 'horaInicio', 'horaFin'].some(key => (original as any)[key] !== (row as any)[key]);
          if (changesOccupancy && (disabledSpaces.has(normalizeSpace(row.espacio)) || getConstituentSpaces(row.espacio).some(name => disabledSpaces.has(name))))
            throw new ApiFailure(409, 'El espacio está desactivado. Elige un espacio activo para reservar o cambiar el horario.');
        }
        if (
          active.some(
            (r) => isChileanHoliday(r.fecha) || r.horarioExtendidoAutorizado,
          )
        )
          requireManager(fresh);
        if (
          active.length && !options.allowConflictOverride &&
          findMaintenanceBlockConflicts(
            active,
            // Long blocks starting before the reservation must still match.
            // A single range field avoids the extra index-range read category.
            (await tx.get(db.collection("bloqueos_espacios").where(
              "fechaFin", ">=", active.reduce((date, r) => r.fecha < date ? r.fecha : date, active[0].fecha),
            ))).docs.map((d: any) => ({ ...d.data(), id: d.id })),
          ).length
        )
          throw new ApiFailure(
            409,
            "El espacio tiene un bloqueo de mantenimiento. No se guardó este grupo.",
          );
        if (options.distributionDate) {
          const spaces = configuredSpaces;
          for (const row of active) {
            const space = spaces.find((s: any) => normalizeSpace(s.name) === normalizeSpace(row.espacio));
            if (!space || !Number.isInteger(row.cantidadParticipantes) || row.cantidadParticipantes! < 1 ||
              space.capacity !== undefined && row.cantidadParticipantes! > space.capacity)
              throw new ApiFailure(409, 'La sala o su capacidad cambió. Recalcula la distribución.');
            if (row.terminaDiaSiguiente || timeToMinutes(row.horaInicio) < REGULAR_LOAN_START_MINUTES || timeToMinutes(row.horaFin) > REGULAR_LOAN_END_MINUTES)
              throw new ApiFailure(400, 'La distribución debe quedar entre 08:30 y 22:00 de la misma jornada.');
            const original = current.get(row.id);
            if (original && original.fecha !== row.fecha) throw new ApiFailure(409, 'La reserva cambió de jornada. Recalcula la distribución.');
            if (original && ['serieRecurrente', 'recurrenteId', 'indiceEnSerie', 'totalEnSerie', 'tipoRecurrencia', 'fechaInicioRecurrencia', 'fechaFinRecurrencia', 'diasSemana'].some(key => (original as any)[key] !== (row as any)[key]))
              throw new ApiFailure(400, 'La distribución solo puede modificar las ocurrencias seleccionadas, conservando la serie.');
          }
          const previousDay = new Date(Date.parse(`${options.distributionDate}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
          const agenda = await tx.get(db.collection('reservas').where('fecha', '>=', previousDay).where('fecha', '<=', options.distributionDate));
          if (findReservationConflicts(active, agenda.docs.map((doc: any) => ({ ...doc.data(), id: doc.id })), { excludeReservationIds: new Set(chunk), allowCandidateSelfConflicts: false }).length)
            throw new ApiFailure(409, 'Conflicto en la agenda actual. Recalcula la distribución.');
        }
        const commitEquipment = await prepareEquipmentAllocation(db, tx.__native || tx, current, saved, chunk);
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
        // A small, single-transaction operation needs only the manifest write.
        // Keep large/multi-chunk snapshots in parts so audit listeners stay light.
        const inlineSnapshot = !metadata &&
          chunk.length === trustedRows.length + deletions.length && Buffer.byteLength(payload) <= 16_000;
        const pieces = inlineSnapshot ? [] : splitBackupPayload(payload, 700000);
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
          (options.distributionDate ? `Distribución de salas y montaje para ${options.distributionDate}${activatedSpaces.length ? `; activados: ${activatedSpaces.map(space => space.name).join(', ')}` : ''}` : '') ||
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
          ...(activatedSpaces.length ? { activatedSpaces: activatedSpaces.map(({ id, name }) => ({ id, name })) } : {}),
          ...(inlineSnapshot ? JSON.parse(payload) : {
            operationParts: [
              ...(metadata?.operationParts || []),
              { keys: pieces.map((_, i) => `${key}_${i}`) },
            ],
          }),
        };
        if (Buffer.byteLength(JSON.stringify(entry)) > 900000)
          throw new ApiFailure(
            413,
            "La operación contiene demasiados registros. Divide la importación.",
          );
        return () => {
          commitEquipment();
          if (activatedSpaces.length) tx.set(db.doc('configuracion_sistema/espacios'), {
            data: configuredSpaces.map((space: SpaceInfo) => activationSet.has(space.id) ? { ...space, activo: true } : space),
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          pieces.forEach((payload, i) =>
            tx.set(db.doc(`audit_logs/${auditRef.id}/partes/${key}_${i}`), {
              payload,
            }),
          );
          tx.set(auditRef, clean(entry));
          confirmedAudit = clean(entry);
        };
      },
    },
  }).catch(error => {
    if (error instanceof ReservationWriteError && acknowledged.size) {
      error.discardPending = false;
      error.result.confirmedIds = [...new Set([...acknowledged, ...error.result.confirmedIds])];
    }
    throw error;
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
  // The manifest is already confirmed by the transaction (or durable receipt).
  // Returning it avoids a second post-commit read for the API response.
  return { ...result, auditEntry: auditSummary(confirmedAudit) };
}

export function registerReservationApi(
  app: Express,
  db: Firestore,
  sessions: AppSessions,
) {
  registerDistributionPlanningApi(app, db, sessions);
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
          distributionDate: input.distributionDate,
          activateSpaceIds: input.activateSpaceIds,
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
        const { auditEntry, ...result } = await commitTrusted(
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
          auditEntry,
        });
      } catch (error) {
        if (error instanceof ReservationWriteError) {
          reply({ success: true, error: error.message, result: error.result, discardPending: error.discardPending });
        } else if (streaming && res.headersSent)
          reply({ success: false, error: (error as Error).message, status: (error as any).status || 500 });
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

function auditSummary(data: any) {
  if (!data) return null;
  const { fingerprint, operationActor, confirmedIds, ...entry } = data;
  return entry;
}
