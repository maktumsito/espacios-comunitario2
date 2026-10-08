import * as sdk from "firebase/firestore";
export * from "firebase/firestore";

// Browsers use authenticated HTTP. Server code adapts the Admin SDK; Vitest
// can still exercise local SDK mocks and the shared transactional domain code.
export const usesDataApi = () =>
  typeof window !== "undefined" &&
  !(typeof process !== "undefined" && process.env.VITEST);
export const sessionToken = () =>
  typeof sessionStorage === "undefined"
    ? ""
    : sessionStorage.getItem("espacios_auth_token_v2") ||
      localStorage.getItem("espacios_auth_token_v2") ||
      "";
export class DataApiError extends Error {
  constructor(
    message: string,
    public status = 500,
    public code = "unavailable",
  ) {
    super(message);
  }
}
export async function dataRequest(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<any> {
  if (!sessionToken())
    throw new DataApiError(
      "Inicia sesión para acceder a los datos.",
      401,
      "unauthenticated",
    );
  const response = await fetch(path, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken()}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || result.success === false)
    throw new DataApiError(
      result.error || "No se pudo completar la operación.",
      response.status,
      result.code,
    );
  if (!["/api/data/read", "/api/data/listen"].includes(path))
    announceDataChange();
  return result;
}
export function announceDataChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("data-changed"));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("espacios-data-v1");
    channel.postMessage("changed");
    channel.close();
  }
}
export async function reservationRequest(
  body: unknown,
  onProgress: (result: any) => Promise<void>,
): Promise<any> {
  const controller = new AbortController();
  const response = await fetch("/api/reservations/commit", {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
      Authorization: `Bearer ${sessionToken()}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const result = await response.json();
    throw new DataApiError(result.error, response.status);
  }
  const reader = response.body!.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    final: any;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const packet = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        if (packet.progress) await onProgress(packet.progress);
        else final = packet;
      }
    }
    if (!final || final.success === false)
      throw new DataApiError(
        final?.error ||
          "Se perdió la confirmación del servidor. Reanuda el guardado.",
      );
    announceDataChange();
    return final;
  } finally {
    await reader.cancel().catch(() => {});
    controller.abort();
  }
}
export interface DataReference {
  path: string;
  kind: "document" | "query";
  constraints?: any[];
}
const refs = new WeakMap<object, DataReference>(),
  parts = new WeakMap<object, any>();
const native = (value: any) =>
  typeof value?.collection === "function" ||
  (typeof value?.get === "function" && !value?.firestore?.app);
const describe = (ref: any): DataReference =>
  refs.get(ref) || {
    path: ref.path,
    kind:
      ref.type === "document" || ref.path?.split("/").length % 2 === 0
        ? "document"
        : "query",
  };
export const collection = ((parent: any, ...paths: string[]) => {
  const ref = native(parent)
    ? parent.collection(paths.join("/"))
    : sdk.collection(parent, ...(paths as [string, ...string[]]));
  if (ref && typeof ref === "object")
    refs.set(ref, { path: ref.path, kind: "query", constraints: [] });
  return ref;
}) as typeof sdk.collection;
export const doc = ((parent: any, ...paths: string[]) => {
  const ref = native(parent)
    ? parent.doc(paths.join("/"))
    : sdk.doc(parent, ...(paths as [string, ...string[]]));
  if (ref && typeof ref === "object")
    refs.set(ref, { path: ref.path, kind: "document" });
  return ref;
}) as typeof sdk.doc;
function constraint(make: any, description: (args: any[]) => any) {
  return (...args: any[]) => {
    const result = make(...args);
    if (result && typeof result === "object")
      parts.set(result, description(args));
    return result;
  };
}
export const where = constraint(
  (...args: any[]) => (sdk.where as any)(...args),
  ([field, op, value]) => ({
    type: "where",
    field: typeof field === "string" ? field : "__name__",
    op,
    value,
  }),
) as typeof sdk.where;
export const orderBy = constraint(
  (...args: any[]) => (sdk.orderBy as any)(...args),
  ([field, direction = "asc"]) => ({
    type: "orderBy",
    field: typeof field === "string" ? field : "__name__",
    direction,
  }),
) as typeof sdk.orderBy;
export const limit = constraint(
  (...args: any[]) => (sdk.limit as any)(...args),
  ([count]) => ({ type: "limit", count }),
) as typeof sdk.limit;
export const startAfter = constraint(
  (...args: any[]) => (sdk.startAfter as any)(...args),
  (values) => ({ type: "startAfter", values }),
) as typeof sdk.startAfter;
export const query = ((ref: any, ...constraints: any[]) => {
  if (!native(ref) && !usesDataApi()) return sdk.query(ref, ...constraints);
  const description = {
    ...describe(ref),
    kind: "query" as const,
    constraints: [
      ...(describe(ref).constraints || []),
      ...constraints.map((c) => parts.get(c)),
    ],
  };
  let result = ref;
  if (!native(ref)) result = sdk.query(ref, ...constraints);
  else
    for (const c of constraints.map((c) => parts.get(c))) {
      if (!c) throw new Error("Restricción no soportada.");
      if (c.type === "where") result = result.where(c.field, c.op, c.value);
      if (c.type === "orderBy") result = result.orderBy(c.field, c.direction);
      if (c.type === "limit") result = result.limit(c.count);
      if (c.type === "startAfter")
        result = result.startAfter(
          ...c.values.map((s: any) => s?.__native || s),
        );
    }
  refs.set(result, description);
  return result;
}) as typeof sdk.query;
export const refEqual = ((a: any, b: any) =>
  native(a) || native(b)
    ? a.isEqual(b)
    : sdk.refEqual(a, b)) as typeof sdk.refEqual;
export const queryEqual = ((a: any, b: any) =>
  native(a) || native(b)
    ? a.isEqual(b)
    : sdk.queryEqual(a, b)) as typeof sdk.queryEqual;
function wrap(snapshot: any): any {
  if (typeof snapshot.exists === "boolean")
    return {
      __native: snapshot,
      id: snapshot.id,
      ref: snapshot.ref,
      exists: () => snapshot.exists,
      data: () => snapshot.data(),
      get: (field: string) => snapshot.get(field),
      metadata: { fromCache: false, hasPendingWrites: false },
    };
  const docs = snapshot.docs.map(wrap);
  return {
    __native: snapshot,
    docs,
    size: docs.length,
    empty: !docs.length,
    metadata: { fromCache: false, hasPendingWrites: false },
    forEach: (fn: any) => docs.forEach(fn),
    docChanges: () =>
      snapshot.docChanges().map((c: any) => ({ ...c, doc: wrap(c.doc) })),
  };
}
const cache = new Map<string, any>();
let cacheToken = "";
function key(ref: any) {
  const token = sessionToken();
  if (cacheToken !== token) {
    cache.clear();
    cacheToken = token;
  }
  return JSON.stringify(describe(ref));
}
function clientSnapshot(
  ref: any,
  records: any[],
  changes: any[] = [],
  fromCache = false,
): any {
  const d = describe(ref),
    parent =
      d.kind === "document" ? d.path.split("/").slice(0, -1).join("/") : d.path;
  const docs = records.map((r) => ({
    id: r.id,
    ref: sdk.doc(ref.firestore, `${parent}/${r.id}`),
    exists: () => r.data !== null,
    data: () => (r.data === null ? undefined : r.data),
    get: (f: string) => r.data?.[f],
    metadata: { fromCache, hasPendingWrites: false },
  }));
  if (d.kind === "document")
    return (
      docs[0] || {
        id: d.path.split("/").at(-1),
        ref,
        exists: () => false,
        data: () => undefined,
        metadata: { fromCache, hasPendingWrites: false },
      }
    );
  return {
    docs,
    size: docs.length,
    empty: !docs.length,
    metadata: { fromCache, hasPendingWrites: false },
    forEach: (fn: any) => docs.forEach(fn),
    docChanges: () =>
      changes.length
        ? changes.map((c) => ({
            ...c,
            doc: docs.find((x: any) => x.id === c.id) || {
              id: c.id,
              data: () => c.data,
              ref: sdk.doc(ref.firestore, `${d.path}/${c.id}`),
            },
          }))
        : docs.map((doc: any, i: number) => ({
            type: "added",
            doc,
            oldIndex: -1,
            newIndex: i,
          })),
  };
}
async function read(ref: any) {
  const result = await dataRequest("/api/data/read", describe(ref));
  cache.set(key(ref), result.docs);
  return clientSnapshot(ref, result.docs);
}
export const getDoc = ((ref: any) =>
  usesDataApi()
    ? read(ref)
    : native(ref)
      ? ref.get().then(wrap)
      : sdk.getDoc(ref)) as typeof sdk.getDoc;
export const getDocFromServer = ((ref: any) =>
  usesDataApi()
    ? read(ref)
    : native(ref)
      ? ref.get().then(wrap)
      : sdk.getDocFromServer(ref)) as typeof sdk.getDocFromServer;
export const getDocs = ((ref: any) =>
  usesDataApi()
    ? read(ref)
    : native(ref)
      ? ref.get().then(wrap)
      : sdk.getDocs(ref)) as typeof sdk.getDocs;
export const getDocsFromServer = ((ref: any) =>
  usesDataApi()
    ? read(ref)
    : native(ref)
      ? ref.get().then(wrap)
      : sdk.getDocsFromServer(ref)) as typeof sdk.getDocsFromServer;
export const getDocsFromCache = ((ref: any) =>
  usesDataApi()
    ? Promise.resolve(clientSnapshot(ref, cache.get(key(ref)) || [], [], true))
    : sdk.getDocsFromCache(ref)) as typeof sdk.getDocsFromCache;
export const setDoc = ((ref: any, data: any, options?: any) =>
  usesDataApi()
    ? dataRequest("/api/data/write", {
        writes: [{ path: ref.path, data, options, type: "set" }],
      }).then(() => undefined)
    : native(ref)
      ? ref.set(data, options || {})
      : sdk.setDoc(ref, data, options || {})) as typeof sdk.setDoc;
export const updateDoc = ((ref: any, data: any) =>
  usesDataApi()
    ? dataRequest("/api/data/write", {
        writes: [{ path: ref.path, data, type: "update" }],
      }).then(() => undefined)
    : native(ref)
      ? ref.update(data)
      : sdk.updateDoc(ref, data)) as typeof sdk.updateDoc;
export const deleteDoc = ((ref: any) =>
  usesDataApi()
    ? dataRequest("/api/data/write", {
        writes: [{ path: ref.path, type: "delete" }],
      }).then(() => undefined)
    : native(ref)
      ? ref.delete()
      : sdk.deleteDoc(ref)) as typeof sdk.deleteDoc;
export const writeBatch = ((db: any) => {
  if (!usesDataApi()) return native(db) ? db.batch() : sdk.writeBatch(db);
  const writes: any[] = [];
  const batch = {
    set: (ref: any, data: any, options?: any) => {
      writes.push({ path: ref.path, data, options, type: "set" });
      return batch;
    },
    update: (ref: any, data: any) => {
      writes.push({ path: ref.path, data, type: "update" });
      return batch;
    },
    delete: (ref: any) => {
      writes.push({ path: ref.path, type: "delete" });
      return batch;
    },
    commit: () =>
      dataRequest("/api/data/write", { writes }).then(() => undefined),
  };
  return batch;
}) as typeof sdk.writeBatch;
export const runTransaction = ((db: any, update: any, options?: any) => {
  if (usesDataApi())
    throw new Error(
      "La transacción debe ejecutarse mediante la operación autorizada del servidor.",
    );
  if (!native(db)) return sdk.runTransaction(db, update, options);
  return db.runTransaction(
    (tx: any) =>
      update({
        get: (ref: any) => tx.get(ref).then(wrap),
        set: (ref: any, data: any, opts?: any) => tx.set(ref, data, opts || {}),
        delete: (ref: any) => tx.delete(ref),
        update: (ref: any, data: any) => tx.update(ref, data),
        __native: tx,
      }),
    options,
  );
}) as typeof sdk.runTransaction;
export const onSnapshot = ((ref: any, ...args: any[]) => {
  const next = typeof args[0] === "function" ? args[0] : args[1],
    error = typeof args[0] === "function" ? args[1] : args[2];
  if (!usesDataApi())
    return native(ref)
      ? ref.onSnapshot((s: any) => next(wrap(s)), error)
      : (sdk.onSnapshot as any)(ref, ...args);
  let controller: AbortController | undefined,
    disposed = false,
    retry: any,
    records: any[] = [],
    version: string | undefined;
  const start = async () => {
    controller?.abort();
    clearTimeout(retry);
    if (disposed || !sessionToken()) return;
    controller = new AbortController();
    try {
      const response = await fetch("/api/data/listen", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken()}`,
        },
        body: JSON.stringify({ ...describe(ref), version: version }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new DataApiError(result.error, response.status);
      }
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          if (!line.trim()) continue;
          const message = JSON.parse(line);
          if (message.error)
            throw new DataApiError(message.error, message.status);
          if (message.docs) {
            const previous = records;
            records = message.docs;
            const currentIds = new Set(records.map((r) => r.id));
            const previousById = new Map(
              previous.map((r, i) => [r.id, { ...r, index: i }]),
            );
            message.changes = previous
              .filter((r) => !currentIds.has(r.id))
              .map((r) => ({
                type: "removed",
                id: r.id,
                data: r.data,
                oldIndex: previousById.get(r.id)!.index,
                newIndex: -1,
              }));
            records.forEach((r, i) => {
              const old = previousById.get(r.id);
              if (
                !old ||
                old.index !== i ||
                JSON.stringify(old.data) !== JSON.stringify(r.data)
              )
                message.changes.push({
                  type: old ? "modified" : "added",
                  id: r.id,
                  data: r.data,
                  oldIndex: old?.index ?? -1,
                  newIndex: i,
                });
            });
          } else
            for (const c of message.changes || []) {
              const old = records.findIndex((r) => r.id === c.id);
              if (old >= 0) records.splice(old, 1);
              if (c.type !== "removed")
                records.splice(c.newIndex, 0, { id: c.id, data: c.data });
            }
          version = message.version ?? version;
          if (message.unchanged) continue;
          cache.set(key(ref), [...records]);
          next(clientSnapshot(ref, records, message.changes || []));
        }
      }
      // Brief requests avoid keeping a hosted HTTP/CPU allocation active.
      if (!disposed) retry = setTimeout(start, 30000);
    } catch (failure: any) {
      if (failure.name === "AbortError" || disposed) return;
      error?.(failure);
      if (failure.status !== 401 && failure.status !== 403)
        retry = setTimeout(start, 3000);
    }
  };
  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel("espacios-data-v1")
      : undefined;
  const changed = (e: Event) => {
    if (e instanceof StorageEvent && e.key !== "espacios_auth_token_v2") return;
    cache.clear();
    version = undefined;
    void start();
  };
  const focus = () => {
    if (document.visibilityState === "visible") void start();
  };
  channel?.addEventListener("message", focus);
  window.addEventListener("auth-session-changed", changed);
  window.addEventListener("storage", changed);
  window.addEventListener("data-changed", focus);
  window.addEventListener("focus", focus);
  document.addEventListener("visibilitychange", focus);
  void start();
  return () => {
    disposed = true;
    controller?.abort();
    clearTimeout(retry);
    channel?.close();
    window.removeEventListener("auth-session-changed", changed);
    window.removeEventListener("storage", changed);
    window.removeEventListener("data-changed", focus);
    window.removeEventListener("focus", focus);
    document.removeEventListener("visibilitychange", focus);
  };
}) as typeof sdk.onSnapshot;
