// Test-only: never load real .env credentials or make external HTTP requests.
const fs = require('node:fs');
const originalRead = fs.readFileSync;
fs.readFileSync = function(path, options) {
  if (typeof path === 'string' && /[\\/]\.env(?:\.[^\\/]+)?$/.test(path)) {
    return typeof options === 'string' || options?.encoding ? '' : Buffer.alloc(0);
  }
  return originalRead.call(this, path, options);
};
require('dotenv').config = () => ({ parsed: {} });
const allowed = value => ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(value);
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!allowed(url.hostname)) throw new Error('Audit blocked external fetch');
  return originalFetch(input, options);
};
for (const module of ['node:http', 'node:https']) {
  const api = require(module);
  const request = api.request;
  api.request = function(input, ...args) {
    const host = typeof input === 'string' || input instanceof URL ? new URL(input).hostname : input.hostname || input.host || 'localhost';
    if (!allowed(host)) throw new Error('Audit blocked external HTTP request');
    return request.call(this, input, ...args);
  };
}
require('node:module').syncBuiltinESMExports();
