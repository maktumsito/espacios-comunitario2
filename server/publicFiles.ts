import express, { type Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';

export function registerPublicFiles(app: Express, distPath: string) {
  const assets = path.join(distPath, 'assets');
  const variants = new Set(fs.existsSync(assets) ? fs.readdirSync(assets).filter(name => /\.(js|css)\.gz$/.test(name)) : []);
  const immutable = { maxAge: '1y', immutable: true };
  app.use('/assets', (req, res, next) => {
    const name = req.path.slice(1);
    if (name.endsWith('.map')) return res.sendStatus(404);
    if (!variants.has(name + '.gz') || !['GET', 'HEAD'].includes(req.method)) return next();
    res.vary('Accept-Encoding');
    if (req.headers.range) {
      return req.acceptsEncodings('identity') ? next() : res.status(406).end();
    }
    const encoding = req.acceptsEncodings('gzip', 'identity');
    if (!encoding) return res.status(406).end();
    if (encoding === 'identity') return next();
    res.type(name.endsWith('.js') ? 'application/javascript' : 'text/css');
    res.set('Content-Encoding', 'gzip');
    res.sendFile(name + '.gz', { root: assets, ...immutable });
  }, express.static(assets, immutable));

  // Only literal frontend filenames may reach the static handler rooted at dist.
  // This directory also contains the Node executable and its source map.
  const publicFiles = new Set(fs.readdirSync(distPath).filter(name =>
    /\.(html|png|ico|svg|woff2|txt|webmanifest)$/i.test(name) ||
    ['sw.js', 'firebase-messaging-sw.js', 'build-info.json', 'manifest.json'].includes(name)
  ).map(name => '/' + name));
  const serve = express.static(distPath, {
    ...immutable,
    setHeaders(res, filename) {
      if (/\.html$|(?:manifest\.json|build-info\.json|sw\.js|firebase-messaging-sw\.js)$/.test(filename)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
      if (/(?:sw\.js|firebase-messaging-sw\.js)$/.test(filename)) {
        res.setHeader('Service-Worker-Allowed', '/');
      }
    }
  });
  app.use((req, res, next) => {
    if (req.path === '/' || publicFiles.has(req.path)) return serve(req, res, next);
    if (/\/server\.cjs(?:\.map)?$/i.test(req.path)) return res.sendStatus(404);
    next();
  });
}
