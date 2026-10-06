import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, getFirestore, Firestore, doc, getDocFromServer, setLogLevel } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Suppress internal Firebase transient connection and retry warnings
try {
  setLogLevel('silent');
} catch {
  // ignore
}

// Initialize Firebase App
export function getFirebaseApp() {
  if (!getApps().length) {
    return initializeApp(firebaseConfig);
  }
  return getApp();
}

let dbInstance: Firestore | null = null;

export function getDb(): Firestore {
  if (!dbInstance) {
    const app = getFirebaseApp();
    const databaseId = (firebaseConfig as Record<string, any>).firestoreDatabaseId;
    const settings = {
      experimentalAutoDetectLongPolling: true,
      ignoreUndefinedProperties: true
    };

    try {
      if (databaseId && databaseId !== '(default)') {
        dbInstance = initializeFirestore(app, settings, databaseId);
      } else {
        dbInstance = initializeFirestore(app, settings);
      }
    } catch {
      // In case initializeFirestore was already called on this app
      if (databaseId && databaseId !== '(default)') {
        dbInstance = getFirestore(app, databaseId);
      } else {
        dbInstance = getFirestore(app);
      }
    }
  }
  return dbInstance;
}

// Function to test connectivity safely without uncaught runtime crashes
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    const db = getDb();
    await getDocFromServer(doc(db, '_connection_test', 'ping'));
    return true;
  } catch (error) {
    // Firestore works offline / optimistic as well
    console.debug('Firestore connection probe:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

let authInstance: Auth | null = null;
export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
  }
  return authInstance;
}
export const auth = getFirebaseAuth();

