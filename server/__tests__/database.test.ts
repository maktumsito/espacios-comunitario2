import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initializeApp: vi.fn((_options: unknown, name: string) => ({ name })),
  applicationDefault: vi.fn(() => 'server-credentials'),
  settings: vi.fn(),
  getFirestore: vi.fn(),
}));
vi.mock('firebase-admin/app', () => ({ ...mocks, getApps: () => [] }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: mocks.getFirestore }));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
// Fail immediately if production ever falls back to the denied client SDK.
vi.mock('../../src/firebase/config', () => { throw new Error('Client database used on server'); });

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('VITE_LOCAL_TEST_MODE', 'false');
  vi.stubEnv('FIRESTORE_EMULATOR_HOST', '');
  mocks.getFirestore.mockReturnValue({ settings: mocks.settings });
});
afterEach(() => vi.unstubAllEnvs());

it('uses Admin credentials and the configured named database in production', async () => {
  const config = (await import('../../firebase-applet-config.json')).default;
  const { getServerDatabase } = await import('../database');
  const db = getServerDatabase();
  expect(mocks.initializeApp).toHaveBeenCalledWith(
    { projectId: config.projectId, credential: 'server-credentials' }, 'trusted-server');
  expect(mocks.getFirestore).toHaveBeenCalledWith({ name: 'trusted-server' }, config.firestoreDatabaseId);
  expect(mocks.settings).toHaveBeenCalledWith({ ignoreUndefinedProperties: true });
  expect(getServerDatabase()).toBe(db);
  expect(mocks.getFirestore).toHaveBeenCalledTimes(1);
});

it.each(['test-mode', 'explicit-host'])('keeps %s isolated in the demo database', async mode => {
  if (mode === 'test-mode') vi.stubEnv('VITE_LOCAL_TEST_MODE', 'true');
  else vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8087');
  const { getServerDatabase } = await import('../database');
  getServerDatabase();
  expect(mocks.initializeApp).toHaveBeenCalledWith({ projectId: 'demo-espacios' }, 'trusted-demo-server');
  expect(mocks.getFirestore).toHaveBeenCalledWith({ name: 'trusted-demo-server' }, '(default)');
  expect(mocks.applicationDefault).not.toHaveBeenCalled();
});
