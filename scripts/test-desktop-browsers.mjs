import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { build, preview } from 'vite';

const targets = {
  edge: [chromium, 'msedge'],
  chrome: [chromium, 'chrome'],
  firefox: [firefox],
  webkit: [webkit],
};
const selected = process.argv.slice(2);
if (!selected.length) selected.push('edge', 'chrome', 'firefox');
for (const target of selected) assert.ok(Object.hasOwn(targets, target), `Navegador desconocido: ${target}`);

const room = {
  id: 'SALA QA',
  name: 'SALA QA',
  category: 'General',
  iconName: 'Layers',
  color: '#0284c7',
  description: 'Espacio de prueba',
  activo: false,
};

async function configureContext(context, origin, state) {
  await context.addInitScript(() => {
    if (localStorage.getItem('espacios_auth_user')) return;
    localStorage.setItem('cc_sidebar_hidden_v1', '0');
    localStorage.setItem('espacios_auth_user', JSON.stringify({
      username: 'qa', name: 'Control de calidad', role: 'Administrador', initials: 'QA',
    }));
    localStorage.setItem('espacios_auth_token_v2', 'fixture.fixture');
    localStorage.setItem('espacios_auth_session_start_v1', String(Date.now()));
    localStorage.setItem('espacios_auth_session_expiry_v1', String(Date.now() + 3_600_000));
    localStorage.setItem('espacios_auth_token_expiry_v1', String(Date.now() + 3_600_000));
  });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();

    const catalog = { id: 'espacios', data: { data: [state.room] } };
    if (url.pathname === '/api/data/listen-batch') {
      return route.fulfill({ json: { success: true, results: request.postDataJSON().queries.map(query => ({
        version: String(state.version),
        docs: query.path === 'configuracion_sistema' ? [catalog] : [],
      })) } });
    }
    if (url.pathname === '/api/data/write') {
      const writes = request.postDataJSON().writes;
      const next = writes[0]?.data?.data?.[0];
      if (writes.length !== 1 || writes[0].path !== 'configuracion_sistema/espacios'
        || next?.id !== room.id || typeof next.activo !== 'boolean'
        || request.headers().authorization !== 'Bearer fixture.fixture') {
        state.unexpectedWrites.push(writes);
        return route.fulfill({ status: 400, json: { success: false, error: 'Escritura inesperada' } });
      }
      state.attempts.push(next.activo);
      if (state.reject) {
        state.reject = false;
        return route.fulfill({ status: 403, json: { success: false, error: 'Cambio de prueba denegado' } });
      }
      state.room = next;
      state.version += 1;
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({ json: { success: true, docs: [], users: [], connected: false } });
  });
}

async function openAdmin(page, origin) {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('#nav-tab-admin').click();
}

const activate = page => page.getByRole('button', { name: 'Activar SALA QA', exact: true });
const deactivate = page => page.getByRole('button', { name: 'Desactivar SALA QA', exact: true });

async function checkBrowser(target, origin) {
  const [engine, channel] = targets[target];
  const browser = await engine.launch({ channel });
  const state = { room, version: 0, reject: true, attempts: [], unexpectedWrites: [] };
  try {
    const options = { serviceWorkers: 'block', viewport: { width: 1440, height: 900 } };
    const context = await browser.newContext(options);
    const observer = await browser.newContext(options);
    await configureContext(context, origin, state);
    await configureContext(observer, origin, state);
    const page = await context.newPage();
    const secondPage = await observer.newPage();
    const errors = [];
    for (const tab of [page, secondPage]) {
      tab.setDefaultTimeout(15_000);
      tab.on('pageerror', error => errors.push(error.message));
    }
    await openAdmin(page, origin);
    await activate(page).click();
    await page.getByRole('alert').getByText('Cambio de prueba denegado', { exact: true }).waitFor();
    assert.equal(state.room.activo, false);

    const refreshedCatalog = page.waitForResponse(response =>
      response.url() === `${origin}/api/data/listen-batch`
      && response.request().postDataJSON().queries.some(query => query.path === 'configuracion_sistema')
      && state.version === 1);
    await activate(page).click();
    await deactivate(page).waitFor();
    await (await refreshedCatalog).finished();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#nav-tab-admin').click();
    await deactivate(page).waitFor();

    await openAdmin(secondPage, origin);
    await deactivate(secondPage).waitFor();
    await secondPage.locator('#nav-tab-spaces').click();
    await secondPage.getByText(room.name, { exact: true }).first().waitFor();

    await deactivate(page).click();
    await activate(page).waitFor();
    await openAdmin(secondPage, origin);
    await activate(secondPage).waitFor();
    await secondPage.locator('#nav-tab-spaces').click();
    await secondPage.getByText(room.name, { exact: true }).waitFor({ state: 'hidden' });
    assert.deepEqual(state.attempts, [true, true, false]);
    assert.deepEqual(state.unexpectedWrites, []);
    assert.deepEqual(errors, []);
    console.log(`${target} ${browser.version()} · rechazo, reintento, recarga y directorio correctos en dos sesiones`);
  } finally {
    await browser.close();
  }
}

const outDir = await mkdtemp(join(tmpdir(), 'espacios-browser-'));
const previousTestMode = process.env.VITE_LOCAL_TEST_MODE;
let server;
try {
  process.env.VITE_LOCAL_TEST_MODE = 'true';
  await build({ build: { outDir }, logLevel: 'error' });
  server = await preview({ build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const results = await Promise.allSettled(selected.map(target => checkBrowser(target, origin)));
  for (const [index, result] of results.entries()) {
    if (result.status !== 'rejected') continue;
    console.error(selected[index], result.reason);
    process.exitCode = 1;
  }
} finally {
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  if (previousTestMode === undefined) delete process.env.VITE_LOCAL_TEST_MODE;
  else process.env.VITE_LOCAL_TEST_MODE = previousTestMode;
  await rm(outDir, { recursive: true, force: true });
}
