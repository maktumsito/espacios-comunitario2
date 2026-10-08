import type { Express } from "express";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { AppSessions } from "./appSession";
import {
  accountId,
  apiError,
  ApiFailure,
  manager,
  requireManager,
} from "./dataApi";
import { validateBackupRecord } from "../src/utils/backupIntegrity";

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
      u.isMasterAdmin &&
      !d.usuarios.some((p: any) => accountId(p.username) === id)
    )
      throw new ApiFailure(
        409,
        "El respaldo omite un administrador maestro protegido.",
      );
  if (!d.usuarios.some(manager))
    throw new ApiFailure(409, "Debe conservarse un administrador.");
  const writes: any[] = [
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
    writes.push([
      `usuarios_sistema/${accountId(u.username)}`,
      {
        ...profile,
        passwordHash: existing.passwordHash,
        sessionVersion: existing.sessionVersion || 0,
      },
    ]);
  }
  for (const rating of d.calificaciones)
    writes.push([`calificaciones_espacios/${rating.id}`, rating]);
  for (const block of d.bloqueos || [])
    writes.push([`bloqueos_espacios/${block.id}`, block]);
  const paths = new Set(writes.map((w) => w[0]));
  const deletes = snapshots.flatMap((s) =>
    s.docs.filter((doc) => !paths.has(doc.ref.path)).map((doc) => doc.ref),
  );
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
