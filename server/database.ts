import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import config from "../firebase-applet-config.json";

const usesEmulator = () =>
  process.env.VITE_LOCAL_TEST_MODE === "true" ||
  !!process.env.FIRESTORE_EMULATOR_HOST;

export function serverApp() {
  const local = usesEmulator();
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

let database: Firestore | undefined;
export function getServerDatabase(): Firestore {
  if (!database) {
    // The authenticated API authorizes each operation. Client SDK access is
    // denied by Firestore rules and cannot replace this privileged connection.
    const databaseId = usesEmulator()
      ? "(default)"
      : config.firestoreDatabaseId || "(default)";
    database = getFirestore(serverApp(), databaseId);
    database.settings({ ignoreUndefinedProperties: true });
  }
  return database;
}
export const serverAuth = () => getAuth(serverApp());
