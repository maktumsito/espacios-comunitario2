import type { Express } from "express";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from 'node:crypto';
import type { AppSessions } from "./appSession";
import {
  accountId,
  apiError,
  ApiFailure,
  manager,
  requireManager,
  validateUserPermissions,
} from "./dataApi";
import { validateBackupRecord } from "../src/utils/backupIntegrity";
import { isReservationPermissionAdmin, RESERVATION_PERMISSION_ADMIN_USERNAME } from '../src/utils/userPermissions';
import { isReservationActiveForAvailability } from '../src/utils/conflictDetector';
import type { Reservation } from '../src/types';
import { commitTrusted } from './reservationApi';
import { createScheduledBackup } from './scheduledBackup';
import { restoreLockPath } from './restoreLock';
import { hasReservationMaterialChange } from '../src/services/reservationWriter';
import { cleanReservationForFirestore } from '../src/services/reservationService';

/** Catalog/profile restoration is atomic and preserves credentials, private
 * configuration and append-only audit history. Large restores fail before the
 * reservation phase rather than silently declaring partial success. */
async function prepareEntities(
  db: Firestore,
  tx: Transaction,
  record: any,
  actor: any,
) {
  const d = record.data;
  const names = [
    "usuarios_sistema",
    "calificaciones_espacios",
    ...(d.bloqueos ? ["bloqueos_espacios"] : []),
  ];
  const snapshots = await Promise.all(
    names.map((n) => tx.get(db.collection(n))),
  );
  const stockRef = db.doc('_reservation_inventory/cakes_2026_2027');
  const stock = await tx.get(stockRef);
  const expectedAllocations = Object.fromEntries((d.reservas as Reservation[])
    .filter(row => row.cantidadTortas && isReservationActiveForAvailability(row, new Set()))
    .map(row => [row.id, { quantity: row.cantidadTortas, date: row.fecha, series: row.serieRecurrente || row.recurrenteId || null }]));
  const stockToValidate = d.stockTortas === undefined ? stock.data() : d.stockTortas;
  if (!isDeepStrictEqual(stockToValidate?.allocations ?? {}, expectedAllocations)) {
    throw new ApiFailure(409, 'Las asignaciones de tortas de las reservas no concuerdan con el stock disponible para restaurar.');
  }
  const inventorySnapshots = [];
  if (d.inventario !== undefined) {
    const places = await tx.get(db.collection('inventario_lugares'));
    inventorySnapshots.push(places);
    for (const place of places.docs) {
      const generation = place.get('generation');
      inventorySnapshots.push(await tx.get(place.ref.collection(generation ? `articulos_${generation}` : 'articulos')));
    }
  }
  const accounts = new Map(snapshots[0].docs.map((s) => [s.id, s.data()]));
  if (
    new Set(d.usuarios.map((u: any) => accountId(u.username || ""))).size !==
    d.usuarios.length
  )
    throw new ApiFailure(400, "Perfiles repetidos en el respaldo.");
  for (const u of d.usuarios) {
    const existing = accounts.get(accountId(u.username || ""));
    if (!existing)
      throw new ApiFailure(
        409,
        "El respaldo contiene perfiles que requieren alta y contraseña individual antes de restaurarlos.",
      );
    validateUserPermissions(actor, u, existing);
    if (existing.username === RESERVATION_PERMISSION_ADMIN_USERNAME && !isReservationPermissionAdmin(actor) && u.role !== existing.role)
      throw new ApiFailure(403, 'El respaldo intenta modificar la cuenta de administración de permisos.');
    if (
      existing.isMasterAdmin !== u.isMasterAdmin &&
      actor.isMasterAdmin !== true
    )
      throw new ApiFailure(
        403,
        "El respaldo intenta modificar permisos maestros.",
      );
    if (
      ![
        "Administrador",
        "Coordinador",
        "Recepción",
        "Gestión",
        "Auxiliar",
        "Técnico",
      ].includes(u.role)
    )
      throw new ApiFailure(400, "Rol de perfil no válido.");
  }
  for (const [id, u] of accounts)
    if (
      (u.isMasterAdmin || u.username === RESERVATION_PERMISSION_ADMIN_USERNAME) &&
      !d.usuarios.some((p: any) => accountId(p.username) === id)
    )
      throw new ApiFailure(
        409,
        "El respaldo omite un administrador maestro protegido.",
      );
  if (!d.usuarios.some(manager))
    throw new ApiFailure(409, "Debe conservarse un administrador.");
  const candidateWrites: [string, any][] = [
    ["configuracion_sistema/espacios", { data: d.espacios }],
    ["configuracion_sistema/tipos_prestamo", { data: d.tiposPrestamo }],
    ["configuracion_sistema/tipos_actividad", { data: d.tiposActividad }],
    ["configuracion_sistema/equipamiento", { items: d.equipamiento }],
  ];
  for (const u of d.usuarios) {
    const existing = accounts.get(accountId(u.username))!;
    const {
      passwordHash: _password,
      password: _plain,
      sessionVersion: _version,
      ...profile
    } = u;
    candidateWrites.push([
      `usuarios_sistema/${accountId(u.username)}`,
      {
        ...profile,
        ...Object.fromEntries(['canCreateReservations', 'canEditReservations', 'canDeleteReservations']
          .filter(key => existing[key] !== undefined && profile[key] === undefined)
          .map(key => [key, existing[key]])),
        passwordHash: existing.passwordHash,
        sessionVersion: existing.sessionVersion || 0,
      },
    ]);
  }
  for (const rating of d.calificaciones)
    candidateWrites.push([`calificaciones_espacios/${rating.id}`, rating]);
  for (const block of d.bloqueos || [])
    candidateWrites.push([`bloqueos_espacios/${block.id}`, block]);
  for (const place of d.inventario || []) {
    const path = `inventario_lugares/${place.id}`;
    const articles = place.data.generation ? `articulos_${place.data.generation}` : 'articulos';
    candidateWrites.push([path, place.data]);
    for (const item of place.articulos) candidateWrites.push([`${path}/${articles}/${item.id}`, item.data]);
  }
  if (d.stockTortas) candidateWrites.push([stockRef.path, d.stockTortas]);
  const targetPaths = new Set(candidateWrites.map((w) => w[0]));
  const existingByPath = new Map<string, any>();
  for (const snap of snapshots) {
    for (const docSnap of snap.docs) {
      existingByPath.set(docSnap.ref.path, docSnap.data());
    }
  }
  for (const snapshot of inventorySnapshots) for (const doc of snapshot.docs) existingByPath.set(doc.ref.path, doc.data());
  if (stock.exists) existingByPath.set(stockRef.path, stock.data());
  const writes = candidateWrites.filter(
    ([path, data]) => !existingByPath.has(path) || !isDeepStrictEqual(existingByPath.get(path), data),
  );
  const deletes = [...snapshots, ...inventorySnapshots].flatMap((s) =>
    s.docs.filter((doc) => !targetPaths.has(doc.ref.path)).map((doc) => doc.ref),
  );
  if (d.stockTortas === null && stock.exists) deletes.push(stockRef);
  if (writes.length + deletes.length > 440)
    throw new ApiFailure(
      413,
      "Los catálogos y perfiles exceden el alcance de una restauración atómica. No se inició la restauración.",
    );
  if (
    writes.some((w) => Buffer.byteLength(JSON.stringify(w[1])) > 900000) ||
    Buffer.byteLength(JSON.stringify(writes)) > 8000000
  )
    throw new ApiFailure(
      413,
      "Los catálogos exceden el tamaño transaccional seguro.",
    );
  return { writes, deletes };
}
export function registerBackupApi(
  app: Express,
  db: Firestore,
  sessions: AppSessions,
) {
  app.post('/api/backups/restore', sessions.requireAuth, async (req, res) => {
    const actor = (req as any).user;
    const token = req.get('authorization') || '';
    const lock = db.doc(restoreLockPath);
    const attempt = randomUUID();
    let jobId = '';
    let recoveryId = '';
    try {
      requireManager(actor);
      const record = req.body?.record;
      if (!record?.data) throw new ApiFailure(400, 'Selecciona un respaldo válido.');
      try { await validateBackupRecord(record); }
      catch (error) { throw new ApiFailure(400, (error as Error).message); }
      const claim = await db.runTransaction(async tx => {
        const job = (await tx.get(lock)).data();
        if (job?.active && job.expiresAt > Date.now()) throw new ApiFailure(409, 'Ya hay una restauración ejecutándose.');
        const rollingBack = job?.active && job.recoveryId === record.id;
        if (job?.active && !rollingBack && job.checksum !== record.checksum) {
          throw new ApiFailure(409, 'Reanuda el respaldo pendiente o selecciona su copia previa.');
        }
        const data = {
          id: job?.active ? job.id : randomUUID(),
          backupId: record.id, checksum: record.checksum, active: true, attempt,
          expiresAt: Date.now() + 15 * 60_000,
          stage: job?.active && !rollingBack ? job.stage : 'prepare',
          recoveryId: job?.active ? job.recoveryId || '' : '',
        };
        await prepareEntities(db, tx, record, actor);
        tx.set(lock, data);
        return data;
      });
      jobId = claim.id;
      recoveryId = claim.recoveryId;
      const checkpoint = async (change: { stage: 'reservations' | 'entities'; recoveryId?: string }) => db.runTransaction(async tx => {
        if ((await tx.get(lock)).get('attempt') !== attempt) throw new ApiFailure(409, 'La restauración cambió de sesión.');
        tx.update(lock, change);
      });
      if (!recoveryId) {
        recoveryId = await createScheduledBackup(db, true) || '';
        if (!recoveryId) throw new ApiFailure(503, 'No se confirmó una copia previa. Reintenta la restauración.');
        await checkpoint({ recoveryId, stage: 'reservations' });
      }
      if (claim.stage !== 'entities') {
        const current = (await db.collection('reservas').get()).docs;
        const byId = new Map(current.map(doc => [doc.id, { ...doc.data(), id: doc.id } as Reservation]));
        const desired = (record.data.reservas as Reservation[]).map(row => ({ ...row, version: byId.get(row.id)?.version ?? 0 }));
        const keep = new Set(desired.map(row => row.id));
        const deletedIds = current.map(doc => doc.id).filter(id => !keep.has(id));
        const changed = desired.filter(row => hasReservationMaterialChange(byId.get(row.id), row, cleanReservationForFirestore));
        if (changed.length || deletedIds.length) {
          await commitTrusted(db, sessions, token, actor, changed, {
            operationId: `backup_${attempt}`, backupRestoreId: jobId, backupRestoreAttempt: attempt,
            backupRestoreCakeCapacity: record.data.stockTortas?.capacity,
            deletedIds, expectedVersions: Object.fromEntries(current.map(doc => [doc.id, doc.get('version') ?? 0])),
            allowConflictOverride: true,
          });
        }
        await checkpoint({ stage: 'entities' });
      }
      await db.runTransaction(async tx => {
        if ((await tx.get(lock)).get('attempt') !== attempt) throw new ApiFailure(409, 'La restauración cambió de sesión.');
        const account = (await tx.get(db.doc(`usuarios_sistema/${accountId(actor.username)}`))).data();
        if (!sessions.acceptsAccount(token, account as any)) throw new ApiFailure(401, 'La sesión cambió.');
        requireManager(account);
        const { writes, deletes } = await prepareEntities(db, tx, record, account);
        deletes.forEach(ref => tx.delete(ref));
        writes.forEach(([path, data]) => tx.set(db.doc(path), data));
        tx.update(lock, { active: false, expiresAt: 0, stage: 'complete' });
        const audit = db.collection('audit_logs').doc();
        tx.create(audit, { id: audit.id, action: 'BACKUP_RESTORED', user: actor.username,
          timestamp: new Date().toISOString(), backupId: record.id, recoveryId, affectedCount: record.totalReservas });
      });
      res.set('Cache-Control', 'no-store').json({ success: true, recoveryId, count: record.totalReservas });
    } catch (error) {
      if (jobId) {
        await db.runTransaction(async tx => {
          if ((await tx.get(lock)).get('attempt') !== attempt) return;
          tx.update(lock, { active: Boolean(recoveryId), expiresAt: 0 });
        }).catch(() => {});
      }
      if (recoveryId) {
        const reason = error instanceof ApiFailure ? error.message : 'No se completó la restauración.';
        res.status(error instanceof ApiFailure ? error.status : 503).json({ success: false, recoveryId,
          error: `${reason} Vuelve a elegir el mismo respaldo para reanudar o restaura la copia previa ${recoveryId}.` });
      } else apiError(res, error);
    }
  });
  for (const stage of ["validate", "entities"])
    app.post(
      `/api/backups/${stage}`,
      sessions.requireAuth,
      async (req, res) => {
        try {
          const actor = (req as any).user;
          requireManager(actor);
          const record = req.body.record;
          await validateBackupRecord(record);
          await db.runTransaction(async (tx) => {
            const account = (
              await tx.get(
                db.doc(`usuarios_sistema/${accountId(actor.username)}`),
              )
            ).data();
            if (
              !sessions.acceptsAccount(
                req.get("authorization") || "",
                account as any,
              )
            )
              throw new ApiFailure(401, "La sesión cambió.");
            requireManager(account);
            const { writes, deletes } = await prepareEntities(
              db,
              tx,
              record,
              account,
            );
            if (stage === "entities") {
              deletes.forEach((ref) => tx.delete(ref));
              writes.forEach(([path, data]) => tx.set(db.doc(path), data));
            }
          });
          res.json({ success: true });
        } catch (error) {
          apiError(
            res,
            error instanceof ApiFailure
              ? error
              : new ApiFailure(400, (error as Error).message),
          );
        }
      },
    );
}
