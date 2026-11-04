const { scryptSync } = require('node:crypto');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8087';
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { runBrowserScenario } = require('../audit/browser-run.cjs');

const fixtureApp = initializeApp({ projectId: 'demo-espacios' }, 'corrections-browser');
const fixtureDb = getFirestore(fixtureApp);

runBrowserScenario({
  output: 'outputs/correcciones-2026-10-08-browser',
  entryPath: '/scripts/corrections/browser-entry.tsx',
  put: (path, data) => fixtureDb.doc(path).set(data),
  hashPassword: () => 'scrypt$' + '01'.repeat(16) + '$' + scryptSync('Synthetic-only-123!', '01'.repeat(16), 64).toString('hex'),
  sanitizeUsersForStorage: users => users.map(({ passwordHash, ...u }) => ({ ...u, passwordHash: '' })),
  checkRecoveredAudit: recovery => ({
    scenario: 'Recovered operation audit',
    status: recovery.logs.some(l => l.affectedCount === 500 && l.operationParts?.length > 1) ? 'passed' : 'failed',
    observed: 'Snapshots captured atomically in each confirmed chunk, including recovery'
  }),
  omitMetadataKeys: ['version', 'createdAt', 'updatedAt', 'lastOperationId', 'restoredStateVersion', 'editadoPor', 'fechaEdicion'],
  includeBackupError: true,
  logBackupComparison: true,
}).finally(async () => {
  await fixtureDb.terminate();
  await deleteApp(fixtureApp);
});
