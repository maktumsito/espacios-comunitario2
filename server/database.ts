import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import * as webFirestore from "firebase/firestore";
import { getDb } from "../src/firebase/config";
import config from "../firebase-applet-config.json";

export function serverApp() {
  const local =
    process.env.VITE_LOCAL_TEST_MODE === "true" ||
    !!process.env.FIRESTORE_EMULATOR_HOST;
  if (local) {
    process.env.FIRESTORE_EMULATOR_HOST =
      process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8087";
    process.env.FIREBASE_AUTH_EMULATOR_HOST =
      process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
  }
  const name = local ? "trusted-demo-server" : "trusted-server";
  return (
    getApps().find((a) => a.name === name) ||
    initializeApp(
      local
        ? { projectId: "demo-espacios" }
        : { projectId: config.projectId, credential: applicationDefault() },
      name,
    )
  );
}

function createWebAdapter(db: webFirestore.Firestore): Firestore {
  function toDocRef(refOrPath: any): webFirestore.DocumentReference {
    if (typeof refOrPath === "string") return webFirestore.doc(db, refOrPath);
    if (refOrPath && refOrPath._ref) return refOrPath._ref;
    if (refOrPath && refOrPath.path) return webFirestore.doc(db, refOrPath.path);
    return refOrPath;
  }

  function wrapDocSnapshot(snap: any) {
    return {
      id: snap.id,
      ref: wrapDocRef(snap.ref),
      exists: typeof snap.exists === "function" ? snap.exists() : Boolean(snap.exists),
      data: () => (typeof snap.data === "function" ? snap.data() : snap.data),
      get: (field: string) => (typeof snap.data === "function" ? snap.data()?.[field] : snap.data?.[field]),
    };
  }

  function wrapQuerySnapshot(snap: any) {
    const docs = snap.docs.map(wrapDocSnapshot);
    return {
      docs,
      size: snap.size,
      empty: snap.empty,
      forEach: (fn: any) => docs.forEach(fn),
    };
  }

  function wrapDocRef(ref: webFirestore.DocumentReference): any {
    return {
      _type: "doc" as const,
      _ref: ref,
      id: ref.id,
      path: ref.path,
      get: async () => wrapDocSnapshot(await webFirestore.getDoc(ref)),
      set: async (data: any, options?: any) =>
        webFirestore.setDoc(ref, data, options || {}),
      update: async (data: any) => webFirestore.updateDoc(ref, data),
      delete: async () => webFirestore.deleteDoc(ref),
    };
  }

  function wrapQuery(q: webFirestore.Query, path: string): any {
    return {
      _type: "query" as const,
      _query: q,
      path,
      where(field: string, op: any, val: any) {
        return wrapQuery(
          webFirestore.query(q, webFirestore.where(field, op, val)),
          path,
        );
      },
      orderBy(field: string, dir?: any) {
        return wrapQuery(
          webFirestore.query(q, webFirestore.orderBy(field, dir || "asc")),
          path,
        );
      },
      limit(n: number) {
        return wrapQuery(
          webFirestore.query(q, webFirestore.limit(n)),
          path,
        );
      },
      startAfter(...vals: any[]) {
        const unwrapped = vals.map((v) => v?._ref || v);
        return wrapQuery(
          webFirestore.query(q, webFirestore.startAfter(...unwrapped)),
          path,
        );
      },
      select(..._fields: string[]) {
        return this;
      },
      get: async () => wrapQuerySnapshot(await webFirestore.getDocs(q)),
    };
  }

  return {
    doc(path: string) {
      return wrapDocRef(webFirestore.doc(db, path));
    },
    collection(path: string) {
      const colRef = webFirestore.collection(db, path);
      const queryObj = wrapQuery(colRef, path);
      return {
        ...queryObj,
        _type: "query" as const,
        _query: colRef,
        id: colRef.id,
        path: colRef.path,
        doc(id?: string) {
          return wrapDocRef(
            id ? webFirestore.doc(colRef, id) : webFirestore.doc(colRef),
          );
        },
      };
    },
    async runTransaction(updateFunction: (tx: any) => Promise<any>) {
      return webFirestore.runTransaction(db, async (webTx) => {
        const tx = {
          async get(target: any) {
            if (target && target._type === "query") {
              const snap = await webFirestore.getDocs(target._query);
              return wrapQuerySnapshot(snap);
            }
            const snap = await webTx.get(toDocRef(target));
            return wrapDocSnapshot(snap);
          },
          set(refOrPath: any, data: any, options?: any) {
            webTx.set(toDocRef(refOrPath), data, options || {});
            return tx;
          },
          update(refOrPath: any, data: any) {
            webTx.update(toDocRef(refOrPath), data);
            return tx;
          },
          delete(refOrPath: any) {
            webTx.delete(toDocRef(refOrPath));
            return tx;
          },
          create(refOrPath: any, data: any) {
            webTx.set(toDocRef(refOrPath), data);
            return tx;
          },
        };
        return updateFunction(tx);
      });
    },
    batch() {
      const b = webFirestore.writeBatch(db);
      const batchObj = {
        set(refOrPath: any, data: any, options?: any) {
          b.set(toDocRef(refOrPath), data, options || {});
          return batchObj;
        },
        update(refOrPath: any, data: any) {
          b.update(toDocRef(refOrPath), data);
          return batchObj;
        },
        delete(refOrPath: any) {
          b.delete(toDocRef(refOrPath));
          return batchObj;
        },
        commit: async () => b.commit(),
      };
      return batchObj;
    },
  } as unknown as Firestore;
}

let database: Firestore | undefined;
export function getServerDatabase(): Firestore {
  if (!database) {
    const isEmulator =
      process.env.VITE_LOCAL_TEST_MODE === "true" ||
      !!process.env.FIRESTORE_EMULATOR_HOST;

    if (isEmulator) {
      const id = "(default)";
      database = getFirestore(serverApp(), id);
      database.settings({ ignoreUndefinedProperties: true });
    } else {
      database = createWebAdapter(getDb());
    }
  }
  return database;
}
export const serverAuth = () => getAuth(serverApp());
