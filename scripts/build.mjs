import { build as buildFrontend } from 'vite';
import { build as buildServer } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { createBuildInfo } from './build-info.mjs';

const info = createBuildInfo();
const define = { __APP_BUILD_INFO__: JSON.stringify(info) };
await buildFrontend({ define, plugins: [{
  name: 'app-build-info',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'app-source-hash', content: info.sourceHash }, injectTo: 'head' }],
}] });
await buildServer({ entryPoints: ['server.ts'], bundle: true, platform: 'node', format: 'cjs',
  packages: 'external', sourcemap: true, outfile: 'dist/server.cjs',
  define: { ...define, 'import.meta.env': '{}' } });
await writeFile('dist/build-info.json', `${JSON.stringify(info, null, 2)}\n`);
console.log(`Build verified: ${info.sourceHash} (Git: ${info.revision || 'unavailable'})`);
