import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, getFirestore, Firestore, setLogLevel, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { firestoreReadPolicy } from './readPolicy';
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
const localTestMode = (import.meta as any).env?.VITE_LOCAL_TEST_MODE === 'true' || (typeof process !== 'undefined' && process.env.VITE_LOCAL_TEST_MODE === 'true');

// Suppress internal Firebase transient connection and retry warnings
try {
  setLogLevel('silent');
} catch {
  // ignore
}

// Initialize Firebase App
export function getFirebaseApp() {
  if (localTestMode) return getApps().find(app=>app.name==='local-demo') || initializeApp({ projectId:'demo-espacios',apiKey:'local-only',authDomain:'localhost' },'local-demo');
  if (!getApps().length) {
    return initializeApp(localTestMode ? { projectId: 'demo-espacios', apiKey: 'local-only', authDomain: 'localhost' } : firebaseConfig);
  }
  return getApp();
}

let dbInstance: Firestore | null = null;

export function getDb(): Firestore {
  if (!dbInstance) {
    const app = getFirebaseApp();
    const databaseId = localTestMode ? '(default)' : (firebaseConfig as Record<string, any>).firestoreDatabaseId;
    const settings = {
      experimentalAutoDetectLongPolling: true,
      ignoreUndefinedProperties: true,
      ...(!localTestMode && firestoreReadPolicy.persistentCache && typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
        ? { localCache: persistentLocalCache({ cacheSizeBytes: firestoreReadPolicy.cacheSizeBytes, tabManager: persistentMultipleTabManager() }) }
        : {})
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
    if (localTestMode) connectFirestoreEmulator(dbInstance!, '127.0.0.1', 8087);
  }
  return dbInstance;
}

let authInstance: Auth | null = null;
export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
    if (localTestMode) connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
  return authInstance;
}
export const auth = getFirebaseAuth();

