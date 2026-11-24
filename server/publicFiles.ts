import express, { type Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';

export function registerPublicFiles(app: Express, distPath: string) {
  const assets = path.join(distPath, 'assets');
  const variants = new Set(fs.existsSync(assets) ? fs.readdirSync(assets).filter(name => /\.(js|css)\.gz$/.test(name)) : []);
  const immutable = { maxAge: '1y', immutable: true };
  app.use('/assets', (req, res, next) => {
    const name = req.path.slice(1);
    if (!variants.has(name + '.gz') || !['GET', 'HEAD'].includes(req.method)) return next();
    res.vary('Accept-Encoding');
    const encoding = req.headers.range && req.acceptsEncodings('identity')
      ? 'identity'
      : req.acceptsEncodings('gzip', 'identity');
    if (!encoding) return res.status(406).end();
    if (encoding === 'identity') return next();
    res.type(name.endsWith('.js') ? 'application/javascript' : 'text/css');
    res.set('Content-Encoding', 'gzip');
    res.sendFile(name + '.gz', { root: assets, ...immutable });
  }, express.static(assets, immutable));

  // Only literal frontend filenames may reach the static handler rooted at dist.
  // This directory also contains the Node executable and its source map.
  const publicFiles = new Set(fs.readdirSync(distPath).filter(name =>
    /\.(html|png|ico|webmanifest)$/i.test(name) ||
    ['sw.js', 'firebase-messaging-sw.js', 'build-info.json', 'manifest.json'].includes(name)
  ).map(name => '/' + name));
  const serve = express.static(distPath, {
    ...immutable,
    setHeaders(res, filename) {
      if (/\.html$|(?:manifest\.json|build-info\.json|sw\.js)$/.test(filename)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  });
  app.use((req, res, next) => {
    if (req.path === '/' || publicFiles.has(req.path)) return serve(req, res, next);
    if (/\/server\.cjs(?:\.map)?$/i.test(req.path)) return res.sendStatus(404);
    next();
  });
}
