import express from 'express';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { registerPublicFiles } from '../publicFiles';

it('serves equivalent static variants, preserves byte ranges and excludes backend files', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'espacios-public-'));
  const js = 'console.log("agenda")';
  await mkdir(path.join(dir, 'assets'));
  await Promise.all([
    writeFile(path.join(dir, 'assets', 'app.js'), js),
    writeFile(path.join(dir, 'assets', 'app.js.gz'), gzipSync(js)),
    writeFile(path.join(dir, 'server.cjs'), 'backend fixture'),
    writeFile(path.join(dir, 'server.cjs.map'), 'map fixture'),
  ]);
  const app = express();
  registerPublicFiles(app, dir);
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    for (const accept of ['gzip', 'gzip;q=0, identity;q=1']) {
      const result = await fetch(base + '/assets/app.js', { headers: { 'Accept-Encoding': accept } });
      expect(result.status).toBe(200);
      expect(result.headers.get('content-encoding')).toBe(accept === 'gzip' ? 'gzip' : null);
      expect(result.headers.get('vary')).toContain('Accept-Encoding');
      expect(await result.text()).toBe(js);
    }
    const range = await fetch(base + '/assets/app.js', { headers: { Range: 'bytes=0-2' } });
    expect(range.status).toBe(206);
    expect(await range.text()).toBe('con');
    for (const filename of ['server.cjs', 'server.cjs.map']) {
      expect((await fetch(base + '/' + filename)).status).toBe(404);
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true });
  }
});
