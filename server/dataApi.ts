import type { Express, Request, Response } from "express";
import type { Firestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { gzipSync } from "node:zlib";
import type { AppSessions } from "./appSession";
import { hashPassword, publicProfile, verifyPassword } from "./passwords";
import { defaultNewUserPermissions, isReservationPermissionAdmin, reservationPermission, reservationPermissionKeys, RESERVATION_PERMISSION_ADMIN_USERNAME } from '../src/utils/userPermissions';
export { reservationPermission } from '../src/utils/userPermissions';
import {
  claimScheduledBackup,
  finishScheduledBackup,
} from "../src/services/backupScheduleCoordinator";

export class ApiFailure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const manager = (user: any) =>
  ["administrador", "coordinador"].includes(
    (user.role || "").trim().toLowerCase(),
  );
export function validateUserPermissions(actor: any, input: any, existing?: any) {
  const defaults = defaultNewUserPermissions(input.role);
  for (const key of reservationPermissionKeys) {
    if (input[key] !== undefined && typeof input[key] !== 'boolean')
      throw new ApiFailure(400, 'Los permisos de reservas deben ser valores booleanos.');
    const expected = existing ? reservationPermission(existing, key) : defaults[key];
    if (!isReservationPermissionAdmin(actor) && input[key] !== undefined && input[key] !== expected)
      throw new ApiFailure(403, 'Solo Cristian Shute puede asignar o modificar permisos de reservas.');
  }
}
export const accountId = (name: string) =>
  encodeURIComponent(name.trim().toLowerCase()).replace(/\./g, "_");
const configs = [
  "espacios",
  "tipos_prestamo",
  "tipos_actividad",
  "equipamiento",
  "backup_schedule_config",
  "gmail_dispatch_config",
  "gmail_dispatch_logs",
];
const collections = new Set([
  "reservas",
  "schedule_slots",
  "usuarios_sistema",
  "configuracion_sistema",
  "calificaciones_espacios",
  "bloqueos_espacios",
  "audit_logs",
  "fcm_tokens",
  "fcm_notificaciones",
  "copias_seguridad",
  "_connection_test",
]);
export function requireManager(user: any) {
  if (!manager(user))
    throw new ApiFailure(
      403,
      "Esta operación requiere un Administrador o Coordinador.",
    );
}
export function validatePath(path: unknown): string[] {
  if (typeof path !== "string" || path.length > 600)
    throw new ApiFailure(400, "Referencia no válida.");
  const p = path.split("/");
  if (
    p.some((s) => !s || s === "." || s === ".." || s.length > 128) ||
    !collections.has(p[0])
  )
    throw new ApiFailure(403, "Referencia no autorizada.");
  if (
    p.length > 2 &&
    !(
      p.length <= 4 &&
      ["audit_logs", "copias_seguridad"].includes(p[0]) &&
      p[2] === "partes"
    )
  )
    throw new ApiFailure(403, "Referencia no autorizada.");
  return p;
}
function readAccess(user: any, path: string[]) {
  if (["audit_logs", "copias_seguridad", "fcm_tokens"].includes(path[0]))
    requireManager(user);
  if (
    path[0] === "configuracion_sistema" &&
    path[1] &&
    !configs.includes(path[1])
  )
    throw new ApiFailure(403, "Configuración privada.");
}
function reference(db: Firestore, body: any, user: any): any {
  const p = validatePath(body.path);
  readAccess(user, p);
  if (body.kind === "document") {
    if (p.length % 2 !== 0) throw new ApiFailure(400, "Documento no válido.");
    return db.doc(body.path);
  }
  if (body.kind !== "query" || p.length % 2 !== 1)
    throw new ApiFailure(400, "Consulta no válida.");
  let query: any = db.collection(body.path);
  if (p[0] === "configuracion_sistema")
    query = query.where("__name__", "in", configs);
  if (
    !Array.isArray(body.constraints || []) ||
    (body.constraints || []).length > 12
  )
    throw new ApiFailure(400, "Consulta demasiado compleja.");
  for (const c of body.constraints || []) {
    if (c.type === "where") {
      if (
        typeof c.field !== "string" ||
        !/^(__name__|[a-zA-Z][\w.]*)$/.test(c.field) ||
        ![
          "==",
          "!=",
          "<",
          "<=",
          ">",
          ">=",
          "in",
          "not-in",
          "array-contains",
          "array-contains-any",
        ].includes(c.op)
      )
        throw new ApiFailure(400, "Filtro no válido.");
      query = query.where(c.field, c.op, c.value);
    } else if (c.type === "orderBy") {
      if (
        typeof c.field !== "string" ||
        !/^(__name__|[a-zA-Z][\w.]*)$/.test(c.field) ||
        !["asc", "desc"].includes(c.direction)
      )
        throw new ApiFailure(400, "Orden no válido.");
      query = query.orderBy(c.field, c.direction);
    } else if (c.type === "limit") {
      if (!Number.isInteger(c.count) || c.count < 1 || c.count > 10000)
        throw new ApiFailure(400, "Límite no válido.");
      query = query.limit(c.count);
    } else throw new ApiFailure(400, "Restricción no soportada.");
  }
  return query;
}
function records(snapshot: any, path: string) {
  const sanitize = (data: any) =>
    path.startsWith("usuarios_sistema") ? publicProfile(data) : data;
  return typeof snapshot.exists === "boolean"
    ? [
        {
          id: snapshot.id,
          data: snapshot.exists ? sanitize(snapshot.data()) : null,
        },
      ]
    : snapshot.docs.map((d: any) => ({ id: d.id, data: sanitize(d.data()) }));
}
export function apiError(res: Response, error: any) {
  if (res.headersSent) return res.end();
  res.status(error instanceof ApiFailure ? error.status : 503).json({
    success: false,
    error:
      error instanceof ApiFailure
        ? error.message
        : "No se pudo completar la operación. Conserva tus datos y vuelve a intentar.",
  });
}
const wrap =
  (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response) => {
    void fn(req, res).catch((error) => apiError(res, error));
  };

/** Shared native listeners and short conditional responses: no permanent HTTP
 * connection, no read/poll of the reservation collection for each browser tick. */
export function registerDataApi(
  app: Express,
  db: Firestore,
  sessions: AppSessions,
) {
  const views = new Map<
    string,
    {
      snapshot: any;
      version: string;
      lastUse: number;
      stop: () => void;
      ready: Promise<void>;
    }
  >();
  const expireViews = setInterval(() => {
    for (const [key, view] of views)
      if (Date.now() - view.lastUse > 120000) {
        view.stop();
        views.delete(key);
      }
  }, 60000);
  expireViews.unref();
  app.post(
    "/api/data/read",
    sessions.requireAuth,
    wrap(async (req, res) => {
      const ref = reference(db, req.body, (req as any).user);
      const snapshot = await ref.get();
      res
        .set("Cache-Control", "no-store")
        .json({ success: true, docs: records(snapshot, req.body.path) });
    }),
  );
  const readView = async (body: any, user: any) => {
      // Revalidate access even when the native snapshot is already shared.
      const ref = reference(db, body, user),
        key = JSON.stringify({
          path: body.path,
          kind: body.kind,
          constraints: body.constraints || [],
        });
      for (const [id, v] of views)
        if (Date.now() - v.lastUse > 120000) {
          v.stop();
          views.delete(id);
        }
      let view = views.get(key);
      if (!view) {
        if (views.size >= 100)
          throw new ApiFailure(
            429,
            "Hay demasiadas consultas activas. Cierra vistas y vuelve a intentar.",
          );
        let ready!: () => void, fail!: (error: any) => void;
        const epoch = randomUUID();
        let sequence = 0;
        view = {
          snapshot: null,
          version: "",
          lastUse: Date.now(),
          stop: () => {},
          ready: new Promise<void>((r, j) => {
            ready = r;
            fail = j;
          }),
        };
        const current = view;
        current.stop = ref.onSnapshot(
          (snapshot: any) => {
            current.snapshot = snapshot;
            current.version = `${epoch}:${++sequence}`;
            ready();
          },
          (error: any) => {
            views.delete(key);
            current.stop();
            fail(error);
          },
        );
        views.set(key, current);
      }
      view.lastUse = Date.now();
      await view.ready;
      const message =
        body.version === view.version
          ? { version: view.version, unchanged: true }
          : {
              version: view.version,
              docs: records(view.snapshot, body.path),
            };
      return message;
  };
  app.post(
    "/api/data/listen",
    sessions.requireAuth,
    wrap(async (req, res) => {
      const message = await readView(req.body, (req as any).user);
      const content = Buffer.from(JSON.stringify(message) + "\n");
      res.set({
        "Cache-Control": "no-store",
        "Content-Type": "application/x-ndjson",
      });
      if (
        content.length > 2048 &&
        req.get("accept-encoding")?.includes("gzip")
      ) {
        res.set("Content-Encoding", "gzip");
        res.end(gzipSync(content));
      } else res.end(content);
    }),
  );
  app.post('/api/data/listen-batch', sessions.requireAuth, wrap(async (req, res) => {
    const queries = req.body.queries;
    if (!Array.isArray(queries) || !queries.length || queries.length > 50 || queries.some(query => !query || typeof query !== 'object')) {
      throw new ApiFailure(400, 'Lote de consultas no válido.');
    }
    const results = await Promise.all(queries.map(async query => {
      try { return await readView(query, (req as any).user); }
      catch (error) {
        return { error: error instanceof ApiFailure ? error.message : 'No se pudo sincronizar esta vista. Conserva tus datos y vuelve a intentar.',
          status: error instanceof ApiFailure ? error.status : 503, retryAfterMs: 60_000 };
      }
    }));
    const content = Buffer.from(JSON.stringify({ success: true, results }));
    res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
    if (content.length > 2048 && req.get('accept-encoding')?.includes('gzip')) {
      res.set('Content-Encoding', 'gzip');
      res.end(gzipSync(content));
    } else res.end(content);
  }));
  app.post(
    "/api/data/write",
    sessions.requireAuth,
    wrap(async (req, res) => {
      const user = (req as any).user,
        writes = req.body.writes;
      if (!Array.isArray(writes) || !writes.length || writes.length > 450)
        throw new ApiFailure(400, "Lote no válido.");
      if (writes.some(w => typeof w.path === 'string' && w.path.startsWith('copias_seguridad/'))) {
        requireManager(user);
        for (const write of writes) {
          const path = validatePath(write.path);
          if (path[0] !== 'copias_seguridad' || ![2, 4].includes(path.length) || write.type !== 'set' || write.options?.merge ||
            !write.data || typeof write.data !== 'object' || Array.isArray(write.data) ||
            ['protected', 'protectedAt', 'protectedBy'].some(key => write.data[key] !== undefined))
            throw new ApiFailure(403, 'Las copias son inmutables. Usa las herramientas de conservación de respaldos.');
          if (Buffer.byteLength(JSON.stringify(write.data)) > 900000) throw new ApiFailure(400, 'Parte de respaldo demasiado grande.');
        }
        await db.runTransaction(async tx => {
          const paths = [...new Set(writes.flatMap(w => [w.path, w.path.split('/').slice(0, 2).join('/')]))] as string[];
          const snapshots = await Promise.all(paths.map(path => tx.get(db.doc(path))));
          const existing = new Map(paths.map((path, index) => [path, snapshots[index]]));
          const additions = writes.filter(write => {
            const target = existing.get(write.path)!;
            if (target.exists) {
              if (isDeepStrictEqual(target.data(), write.data)) return false;
              throw new ApiFailure(409, 'La copia ya existe y no puede sobrescribirse.');
            }
            if (write.path.split('/').length === 4 && existing.get(write.path.split('/').slice(0, 2).join('/'))!.exists)
              throw new ApiFailure(409, 'No pueden añadirse partes a una copia publicada.');
            return true;
          });
          additions.forEach(write => tx.create(db.doc(write.path), write.data));
        });
        res.json({ success: true });
        return;
      }
      const batch = db.batch();
      for (const w of writes) {
        const p = validatePath(w.path);
        if (!["set", "update", "delete"].includes(w.type) || p.length % 2 !== 0)
          throw new ApiFailure(400, "Escritura no válida.");
        if (
          [
            "reservas",
            "schedule_slots",
            "usuarios_sistema",
            "audit_logs",
            "_connection_test",
          ].includes(p[0])
        )
          throw new ApiFailure(
            403,
            "Utiliza la operación autorizada específica.",
          );
        if (
          [
            "configuracion_sistema",
            "copias_seguridad",
            "bloqueos_espacios",
          ].includes(p[0])
        )
          requireManager(user);
        else if (p[0] === "fcm_tokens") {
          const old = await db.doc(w.path).get();
          if (old.exists && old.get("owner") !== user.username)
            requireManager(user);
        } else if (
          !reservationPermission(user, "canCreateReservations") &&
          !reservationPermission(user, "canEditReservations")
        )
          throw new ApiFailure(403, "Tu cuenta tiene acceso de lectura.");
        if (p[0] === "configuracion_sistema" && !configs.includes(p[1]))
          throw new ApiFailure(403, "Configuración privada.");
        if (
          w.type !== "delete" &&
          (!w.data ||
            Array.isArray(w.data) ||
            typeof w.data !== "object" ||
            Buffer.byteLength(JSON.stringify(w.data)) > 900000)
        )
          throw new ApiFailure(400, "Documento no válido o demasiado grande.");
        const data =
            p[0] === "fcm_tokens"
              ? { ...w.data, owner: user.username }
              : w.data,
          ref = db.doc(w.path);
        if (w.type === "delete") batch.delete(ref);
        else if (w.type === "update") batch.update(ref, data);
        else batch.set(ref, data, w.options?.merge ? { merge: true } : {});
      }
      await batch.commit();
      res.json({ success: true });
    }),
  );
  app.post(
    "/api/users/save",
    sessions.requireAuth,
    wrap(async (req, res) => {
      const actor = (req as any).user;
      requireManager(actor);
      const input = req.body.user || {};
      const username = String(input.username || "")
          .trim()
          .toLowerCase(),
        oldName = String(req.body.originalUsername || username)
          .trim()
          .toLowerCase();
      if ([username, oldName].includes(RESERVATION_PERMISSION_ADMIN_USERNAME) && !isReservationPermissionAdmin(actor))
        throw new ApiFailure(403, 'Solo Cristian Shute puede modificar su cuenta de administración de permisos.');
      if (
        !username ||
        username.length > 150 ||
        typeof input.name !== "string" ||
        !input.name.trim() ||
        input.name.length > 200 ||
        ![
          "Administrador",
          "Coordinador",
          "Recepción",
          "Gestión",
          "Auxiliar",
          "Técnico",
        ].includes(input.role)
      )
        throw new ApiFailure(400, "Perfil no válido.");
      const password = req.body.password;
      if (password !== undefined && typeof password !== 'string')
        throw new ApiFailure(400, 'Contraseña no válida.');
      const cleanPassword = password?.trim();
      if (cleanPassword && (cleanPassword.length < 8 || cleanPassword.length > 256))
        throw new ApiFailure(400, 'La contraseña debe tener entre 8 y 256 caracteres.');
      const newHash = cleanPassword ? await hashPassword(cleanPassword) : undefined;
      const users = await db.runTransaction(async (tx) => {
        const oldRef = db.doc(`usuarios_sistema/${accountId(oldName)}`),
          newRef = db.doc(`usuarios_sistema/${accountId(username)}`);
        const all = await tx.get(db.collection("usuarios_sistema"));
        const old = all.docs.find(d => d.id === oldRef.id);
        if (old && old.get('username')?.trim().toLowerCase() !== oldName)
          throw new ApiFailure(409, 'El identificador coincide con otra cuenta existente. Usa un identificador diferente.');
        validateUserPermissions(actor, input, old?.data());
        if (input.isMasterAdmin !== undefined && typeof input.isMasterAdmin !== 'boolean')
          throw new ApiFailure(400, 'El permiso maestro debe ser un valor booleano.');
        if (oldName !== username && all.docs.some((d) => d.id === newRef.id))
          throw new ApiFailure(409, "El identificador ya está en uso.");
        if (!old && !newHash)
          throw new ApiFailure(
            400,
            "Asigna una contraseña de al menos ocho caracteres.",
          );
        if (
          (input.isMasterAdmin || old?.get("isMasterAdmin")) &&
          actor.isMasterAdmin !== true
        )
          throw new ApiFailure(
            403,
            "El perfil maestro requiere un administrador maestro.",
          );
        if (
          old &&
          manager(old.data()) &&
          !manager(input) &&
          all.docs.filter((d) => manager(d.data())).length <= 1
        )
          throw new ApiFailure(409, "Debe conservarse un administrador.");
        const allowed = [
          "name",
          "role",
          "initials",
          "avatarColor",
          "email",
          "phone",
          "isCustom",
          "isMasterAdmin",
          "canCreateReservations",
          "canEditReservations",
          "canDeleteReservations",
        ];
        const profile = Object.fromEntries(
          allowed
            .filter((k) => input[k] !== undefined)
            .map((k) => [k, input[k]]),
        );
        if (!isReservationPermissionAdmin(actor)) {
          for (const key of reservationPermissionKeys) delete profile[key];
        }
        const updated = {
          ...(!old ? defaultNewUserPermissions(input.role) : {}),
          ...old?.data(),
          ...profile,
          username,
          passwordHash: newHash || old?.get("passwordHash"),
          createdAt: old?.get("createdAt") || new Date().toISOString(),
          sessionVersion:
            (old?.get("sessionVersion") || 0) +
            (newHash || oldName !== username ? 1 : 0),
        };
        if (!old || !isDeepStrictEqual(old.data(), updated)) tx.set(newRef, updated);
        if (old && oldName !== username) tx.delete(oldRef);
        return [...all.docs.filter(d => d.id !== oldRef.id && d.id !== newRef.id)
          .map(d => publicProfile(d.data())), publicProfile(updated)];
      });
      sessions.invalidateAccount(username);
      sessions.invalidateAccount(oldName);
      res.json({
        success: true,
        users,
      });
    }),
  );
  app.post(
    "/api/users/delete",
    sessions.requireAuth,
    wrap(async (req, res) => {
      const actor = (req as any).user;
      requireManager(actor);
      const username = String(req.body.username || "")
        .trim()
        .toLowerCase();
      const users = await db.runTransaction(async (tx) => {
        const all = await tx.get(db.collection("usuarios_sistema")),
          target = all.docs.find((d) => d.id === accountId(username));
        if (!target) return all.docs.map(d => publicProfile(d.data()));
        if (target.get("isMasterAdmin") || username === RESERVATION_PERMISSION_ADMIN_USERNAME)
          throw new ApiFailure(403, "El perfil maestro está protegido.");
        if (
          manager(target.data()) &&
          all.docs.filter((d) => manager(d.data())).length <= 1
        )
          throw new ApiFailure(409, "Debe conservarse un administrador.");
        tx.delete(target.ref);
        return all.docs.filter(d => d.id !== target.id).map(d => publicProfile(d.data()));
      });
      sessions.invalidateAccount(username);
      res.json({
        success: true,
        users,
      });
    }),
  );
  app.post(
    "/api/users/password",
    sessions.requireAuth,
    wrap(async (req, res) => {
      const actor = (req as any).user,
        username = String(req.body.username || "")
          .trim()
          .toLowerCase(),
        override = req.body.override === true && actor.isMasterAdmin === true;
      if (username !== actor.username && !override)
        throw new ApiFailure(403, "Solo puedes cambiar tu propia contraseña.");
      const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword.trim() : '';
      const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword.trim() : '';
      if (newPassword.length < 8 || newPassword.length > 256)
        throw new ApiFailure(400, 'La contraseña debe tener entre 8 y 256 caracteres.');
      const next = await hashPassword(newPassword);
      await db.runTransaction(async (tx) => {
        const ref = db.doc(`usuarios_sistema/${accountId(username)}`),
          old = await tx.get(ref);
        if (!old.exists) throw new ApiFailure(404, "No se encontró la cuenta.");
        if (
          !override &&
          !(await verifyPassword(
            currentPassword,
            old.get("passwordHash"),
          ))
        )
          throw new ApiFailure(403, "La contraseña actual no es válida.");
        tx.update(ref, {
          passwordHash: next,
          sessionVersion: (old.get("sessionVersion") || 0) + 1,
        });
      });
      res.json({
        success: true,
        message:
          "Contraseña actualizada. Inicia sesión con tu nueva contraseña.",
      });
    }),
  );
  app.post(
    "/api/backups/claim",
    sessions.requireAuth,
    wrap(async (req, res) => {
      requireManager((req as any).user);
      res.json({
        success: true,
        claim: await claimScheduledBackup(db as any, req.body.config),
      });
    }),
  );
  app.post(
    "/api/backups/finish",
    sessions.requireAuth,
    wrap(async (req, res) => {
      requireManager((req as any).user);
      await finishScheduledBackup(db as any, req.body.claim, req.body.backup);
      res.json({ success: true });
    }),
  );
  return () => {
    clearInterval(expireViews);
    for (const view of views.values()) view.stop();
    views.clear();
  };
}
