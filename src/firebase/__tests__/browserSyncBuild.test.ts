import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { build, createServer } from 'vite';
import { expect, it, vi } from 'vitest';

it('resolves sibling Firebase imports to browser adapters in development', async () => {
  const server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    for (const [source, importer, target] of [
      ['./gateway', 'sharedSnapshot.ts', 'gateway.browser.ts'],
      ['./config', 'authClient.ts', 'config.browser.ts'],
      ['../firebase/gateway', '../services/reservationService.ts', 'gateway.browser.ts'],
    ]) {
      const resolved = await server.pluginContainer.resolveId(source, path.resolve('src/firebase', importer));
      expect(resolved?.id.replaceAll('\\', '/')).toBe(path.resolve('src/firebase', target).replaceAll('\\', '/'));
    }
  } finally { await server.close(); }
});

it('delivers reservation and document snapshots through the actual production bundle', async () => {
  const entry = path.resolve('src/browser-sync-fixture.ts');
  const result = await build({
    logLevel: 'silent',
    plugins: [{
      name: 'browser-sync-fixture',
      outputOptions: options => ({ ...options, manualChunks: undefined }),
      resolveId: source => source === entry ? entry : null,
      load: id => id === entry ? `
        export { collection, doc, query, where } from './firebase/gateway';
        export { getDb } from './firebase/config';
        export { sharedOnSnapshot } from './firebase/sharedSnapshot';
      ` : null,
    }],
    build: {
      write: false,
      minify: false,
      rollupOptions: { input: entry, preserveEntrySignatures: 'strict', output: { format: 'iife', name: 'BrowserSyncFixture', inlineDynamicImports: true } },
    },
  });
  if (Array.isArray(result) || !('output' in result)) throw new Error('Expected a browser bundle');
  const chunk = result.output.find(output => output.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing browser entry');
  // The old aliases leaked gateway.ts and the native Firestore SDK into this bundle.
  expect(Object.keys(chunk.modules).some(id => /\/firebase\/(gateway|config)\.ts$/.test(id))).toBe(false);
  expect(Object.keys(chunk.modules).some(id => id.includes('@firebase/firestore'))).toBe(false);

  const storage = new Map([
    ['espacios_auth_user', JSON.stringify({ username: 'fixture' })],
    ['espacios_auth_token_v2', 'fixture.fixture'],
  ]);
  const fetchMock = vi.fn(async (_url, options) => {
    const { queries } = JSON.parse(options.body);
    return { ok: true, status: 200, text: async () => JSON.stringify({
      success: true,
      results: queries.map((query: any) => ({ version: '1', docs: query.path === 'reservas'
        ? [{ id: 'booking', data: { fecha: '2026-11-27' } }]
        : [{ id: 'espacios', data: { data: ['SALA 1'] } }] })),
    }) };
  });
  const api = runInNewContext(`${chunk.code}; BrowserSyncFixture;`, {
    console, setTimeout, clearTimeout, AbortController, Event,
    window: new EventTarget(),
    document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    localStorage: { getItem: (key: string) => storage.get(key) ?? null },
    fetch: fetchMock,
  });
  const failures = vi.fn();
  const reservations = vi.fn(), catalog = vi.fn();
  const stops = [
    api.sharedOnSnapshot(api.query(api.collection(api.getDb(), 'reservas'), api.where('fecha', '>=', '2026-11-01')), reservations, failures),
    api.sharedOnSnapshot(api.doc(api.getDb(), 'configuracion_sistema', 'espacios'), catalog, failures),
  ];
  try {
    await vi.waitFor(() => {
      expect(reservations).toHaveBeenCalled();
      expect(catalog).toHaveBeenCalled();
    });
    expect(failures).not.toHaveBeenCalled();
    expect(reservations.mock.calls[0][0].docs[0].data()).toEqual({ fecha: '2026-11-27' });
    expect(catalog.mock.calls[0][0].data()).toEqual({ data: ['SALA 1'] });
    expect(catalog.mock.calls[0][0].ref.parent.path).toBe('configuracion_sistema');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer fixture.fixture');
  } finally {
    stops.forEach(stop => stop());
    // Shared subscriptions keep a one-second remount grace period.
    await new Promise(resolve => setTimeout(resolve, 1100));
  }
}, 30_000);
