// The previous benchmark predates the signed-token UI bootstrap check. Supply
// a synthetic token of the expected shape for this cloud-blocked rendering benchmark.
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const file = resolve('scripts/measure-browser.cjs');
const source = readFileSync(file,'utf8').replace("localStorage.setItem('app_view_preference','calendar');", "localStorage.setItem('espacios_auth_token_v2','synthetic.benchmark'); localStorage.setItem('app_view_preference','calendar');");
const runner = new Module(file); runner.filename=file;runner.paths=Module._nodeModulePaths(resolve('scripts'));
runner._compile(source,file);
