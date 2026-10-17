import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export function getSourceHash(root = process.cwd()) {
  const files = [];
  const visit = relative => {
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (entry.name === '__tests__' || /\.(test|spec)\./.test(entry.name)) continue;
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(name);
      else files.push(name);
    }
  };
  for (const dir of ['src', 'server', 'public']) visit(dir);
  // Installation may generate a lockfile in AI Studio exports; it is not an
  // application source file and must not change the source identification.
  for (const file of ['server.ts', 'index.html', 'vite.config.ts', 'package.json',
    'firebase-applet-config.json', 'scripts/build.mjs', 'scripts/build-info.mjs']) {
    if (existsSync(path.join(root, file))) files.push(file);
  }
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    const raw = readFileSync(path.join(root, file));
    const contents = /\.(tsx?|[cm]?js|css|html|json|svg|txt|webmanifest)$/.test(file)
      ? raw.toString('utf8').replace(/\r\n/g, '\n') : raw;
    hash.update(file).update('\0').update(contents).update('\0');
  }
  return hash.digest('hex');
}

export function createBuildInfo() {
  let revision = null, dirty = null;
  try {
    revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    dirty = Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  } catch { /* AI Studio source exports may not contain Git metadata. */ }
  return { revision, dirty, sourceHash: getSourceHash(), builtAt: new Date().toISOString() };
}
