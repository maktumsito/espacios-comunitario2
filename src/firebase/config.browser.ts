import { initializeApp, getApps, getApp } from 'firebase/app';
import firebaseConfig from '../../firebase-applet-config.json';

const localTestMode =
  (import.meta as any).env?.VITE_LOCAL_TEST_MODE === 'true' ||
  (typeof process !== 'undefined' && process.env.VITE_LOCAL_TEST_MODE === 'true');

export function getFirebaseApp() {
  if (localTestMode) {
    return (
      getApps().find((app) => app.name === 'local-demo') ||
      initializeApp({ projectId: 'demo-espacios', apiKey: 'local-only', authDomain: 'localhost' }, 'local-demo')
    );
  }
  if (!getApps().length) {
    return initializeApp(firebaseConfig);
  }
  return getApp();
}

const dataApiDbStub = { __dataApi: true } as any;

/**
 * In the browser, all Firestore reads/writes flow through the authenticated Express API
 * (firestore.rules denies 100% of direct client SDK traffic). Returning a lightweight
 * descriptor stub avoids bundling and initializing @firebase/firestore (~425 KB) and
 * IndexedDB multi-tab locks on cold page load.
 */
export function getDb(): any {
  return dataApiDbStub;
}

export { getFirebaseAuth } from './authClient';
