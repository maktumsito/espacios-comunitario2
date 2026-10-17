import { getSourceHash } from './build-info.mjs';

const origin = process.argv[2];
if (!origin || !/^https?:\/\//.test(origin)) throw new Error('Uso: npm run verify:deployment -- https://DOMINIO');
const expected = getSourceHash();
const read = async pathname => {
  const response = await fetch(new URL(pathname, origin), { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`${pathname}: HTTP ${response.status}, no se recibió JSON de la versión.`);
  }
  return response.json();
};
try {
  const [frontend, backend] = await Promise.all([read('/build-info.json'), read('/api/health')]);
  const html = await fetch(new URL('/', origin), { cache: 'no-store', signal: AbortSignal.timeout(20_000) }).then(r => r.text());
  const servedHash = html.match(/<meta\b(?=[^>]*\bname=["']app-source-hash["'])[^>]*\bcontent=["']([^"']+)["']/)?.[1];
  const verified = backend.status === 'ok' && frontend.sourceHash === expected && backend.build?.sourceHash === expected
    && servedHash === expected && frontend.builtAt === backend.build?.builtAt;
  console.log(JSON.stringify({ origin, verified, expectedSourceHash: expected, frontend, backend: backend.build ?? null,
    servedHtmlSourceHash: servedHash ?? null }, null, 2));
  if (!verified) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ origin, verified: false, expectedSourceHash: expected, error: error.message }, null, 2));
  process.exitCode = 1;
}
