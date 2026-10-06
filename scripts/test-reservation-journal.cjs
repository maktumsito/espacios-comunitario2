// Exercises the real browser storage APIs on an isolated local origin; no cloud writes.
const { chromium } = require('playwright');
const { build } = require('esbuild');
const { createServer } = require('node:http');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const bundled = await build({ entryPoints: [resolve('src/services/reservationOperationJournal.ts')],
    bundle: true, write: false, format: 'esm', platform: 'browser' });
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/journal.js' ? 'application/javascript' : 'text/html');
    response.end(request.url === '/journal.js' ? bundled.outputFiles[0].text :
      '<script type="module">import * as journal from "/journal.js"; window.journal = journal;</script>');
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    async function fixture() {
      const context = await browser.newContext();
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.goto(origin); await page.waitForFunction(() => window.journal);
      return { context, page };
    }
    const { context, page } = await fixture();
    const migration = await page.evaluate(async () => {
      const op = { id: 'legacy', actor: 'test', reservations: [{ id: 'original' }], deletedIds: ['deleted'], confirmedIds: [],
        allowConflictOverride: false, requireAtomic: true, expectedVersions: { original: 2 } };
      localStorage.setItem('reservation_pending_operations_v1', JSON.stringify([op]));
      localStorage.setItem('unrelated-data', 'keep');
      const rows = await window.journal.readPendingOperations();
      return { rows, legacy: localStorage.getItem('reservation_pending_operations_v1'), unrelated: localStorage.getItem('unrelated-data') };
    });
    assert.equal(migration.rows[0].expectedVersions.original, 2);
    assert.equal(migration.rows[0].requireAtomic, true);
    assert.equal(migration.legacy, null); assert.equal(migration.unrelated, 'keep');
    console.log('PASS: migrate pending payload, IDs and version guards without clearing unrelated storage');

    const large = await page.evaluate(async () => {
      const operation = { id: 'large', actor: 'test', reservations: Array.from({ length: 40 }, (_, i) =>
        ({ id: `session-${i}`, cartaCompromisoAdjunta: { data: 'x'.repeat(160000) } })),
        deletedIds: [], confirmedIds: [], allowConflictOverride: false };
      let quotaExceeded = false;
      try { localStorage.setItem('reservation_pending_operations_v1', JSON.stringify([operation])); }
      catch (error) { quotaExceeded = error.name === 'QuotaExceededError'; }
      if (!quotaExceeded) throw new Error('Fixture did not reproduce localStorage quota exhaustion');
      // Simulate all remaining localStorage capacity being occupied as well.
      localStorage.setItem('full-storage', 'x'.repeat(5000000));
      await window.journal.updateOperationJournal(operation);
      return { quotaExceeded, count: (await window.journal.readPendingOperations()).length };
    });
    assert.equal(large.quotaExceeded, true); assert.equal(large.count, 2);
    await page.reload(); await page.waitForFunction(() => window.journal);
    const reloaded = await page.evaluate(async () => {
      const rows = await window.journal.readPendingOperations();
      const large = rows.find(row => row.id === 'large');
      return { ids: rows.map(row => row.id).sort(), count: large.reservations.length,
        attachment: large.reservations[39].cartaCompromisoAdjunta.data.length };
    });
    assert.deepEqual(reloaded.ids, ['large', 'legacy']); assert.equal(reloaded.count, 40); assert.equal(reloaded.attachment, 160000);
    console.log('PASS: payload exceeding localStorage quota persists and recovers after reload');

    const completion = await page.evaluate(async () => {
      const rows = await window.journal.readPendingOperations();
      await Promise.all(['concurrent-a', 'concurrent-b'].map(id => window.journal.updateOperationJournal({ ...rows[0], id })));
      const before = await window.journal.readPendingOperations();
      await window.journal.updateOperationJournal(rows.find(row => row.id === 'legacy'), true);
      // A stale legacy copy must not resurrect an operation already completed.
      localStorage.removeItem('full-storage');
      localStorage.setItem('reservation_pending_operations_v1', JSON.stringify([rows.find(row => row.id === 'legacy')]));
      return { before: before.map(row => row.id).sort(), after: (await window.journal.readPendingOperations()).map(row => row.id).sort() };
    });
    assert.deepEqual(completion.before, ['concurrent-a', 'concurrent-b', 'large', 'legacy']);
    assert.deepEqual(completion.after, ['concurrent-a', 'concurrent-b', 'large']);
    console.log('PASS: concurrent updates retain both operations; completion removes only its own entry');

    const abortedWrite = await page.evaluate(async () => {
      const originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value, key) {
        const request = originalPut.call(this, value, key);
        if (key === 'aborted') request.addEventListener('success', () => this.transaction.abort());
        return request;
      };
      let rejected = false;
      try { await window.journal.updateOperationJournal({ id: 'aborted', reservations: [], deletedIds: [], confirmedIds: [], allowConflictOverride: false }); }
      catch { rejected = true; }
      finally { IDBObjectStore.prototype.put = originalPut; }
      return { rejected, ids: (await window.journal.readPendingOperations()).map(row => row.id) };
    });
    assert.equal(abortedWrite.rejected, true); assert.equal(abortedWrite.ids.includes('aborted'), false);
    console.log('PASS: request success followed by transaction abort is never reported as durable storage');
    await context.close();

    const failure = await fixture();
    const failedMigration = await failure.page.evaluate(async () => {
      const operation = { id: 'not-migrated', reservations: [], deletedIds: [], confirmedIds: [], allowConflictOverride: false };
      localStorage.setItem('reservation_pending_operations_v1', JSON.stringify([operation]));
      const originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value, key) {
        if (key === '__legacy_migrated__') throw new Error('Simulated storage failure');
        return originalPut.call(this, value, key);
      };
      let rejected = false;
      try { await window.journal.readPendingOperations(); } catch { rejected = true; }
      finally { IDBObjectStore.prototype.put = originalPut; }
      const legacyRetained = Boolean(localStorage.getItem('reservation_pending_operations_v1'));
      return { rejected, legacyRetained, recovered: (await window.journal.readPendingOperations()).map(row => row.id) };
    });
    assert.equal(failedMigration.rejected, true); assert.equal(failedMigration.legacyRetained, true);
    assert.deepEqual(failedMigration.recovered, ['not-migrated']);
    console.log('PASS: aborted migration retains the legacy copy and succeeds on retry');
    await failure.context.close();
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
