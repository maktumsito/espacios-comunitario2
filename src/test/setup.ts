import {webcrypto} from 'node:crypto';
import { vi } from 'vitest';

// Unit tests must never initialize the configured production Firebase project.
// Integration tests use their own explicit demo project and localhost emulator.
vi.mock('../firebase/config', () => ({
  getDb: () => undefined,
  getFirebaseApp: () => undefined,
  getFirebaseAuth: () => undefined,
  auth: undefined,
  testFirestoreConnection: async () => false,
}));

if(!globalThis.crypto.subtle)Object.defineProperty(globalThis.crypto,'subtle',{value:webcrypto.subtle,configurable:true});
