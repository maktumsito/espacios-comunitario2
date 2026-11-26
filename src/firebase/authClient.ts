import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import { getFirebaseApp } from './config';

const localTestMode =
  (import.meta as any).env?.VITE_LOCAL_TEST_MODE === 'true' ||
  (typeof process !== 'undefined' && process.env.VITE_LOCAL_TEST_MODE === 'true');

let authInstance: Auth | null = null;

/**
 * Lazily initializes Firebase Auth only when the user invokes Google Workspace sign-in
 * or Gmail OAuth fallback, keeping firebase/auth out of the critical initial bundle.
 */
export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
    if (localTestMode) {
      connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
  }
  return authInstance;
}
