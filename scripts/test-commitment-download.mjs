import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build, preview } from 'vite';
import { chromium } from 'playwright';

// Exercise real browser downloads against the production bundle with synthetic data.
const root = await mkdtemp(resolve('.letter-qa-'));
let server;
try {
  const source = resolve('src').replaceAll('\\', '/');
  await writeFile(join(root, 'index.html'), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
  await writeFile(join(root, 'entry.tsx'), `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {CommitmentLetterCard} from '${source}/components/CommitmentLetterCard';
import {downloadCommitmentLetterPdf} from '${source}/utils/commitmentLetterPdf';
const reservation={id:'QA-LETTER',fecha:'2026-11-23',horaInicio:'10:00',horaFin:'12:00',espacio:'SALA 2',responsable:'Persona de prueba',rut:12345678,telefonoContacto:912345678,tipoActividad:'PRÉSTAMO',estado:'activa'};
createRoot(document.getElementById('root')).render(<><CommitmentLetterCard reservation={reservation}/><button onClick={async()=>{await new Promise(r=>setTimeout(r,500));await downloadCommitmentLetterPdf(reservation)}}>Descarga tras guardar</button></>);
`);
  await build({ root, build: { outDir: join(root, 'dist') }, logLevel: 'error' });
  server = await preview({ root, preview: { host: '127.0.0.1', port: 0 } });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const channel of ['chrome', 'msedge']) {
    const browser = await chromium.launch({ channel });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));

      await page.goto(origin);
      for (const name of ['Descargar PDF', 'Descarga tras guardar']) {
        const download = page.waitForEvent('download', { timeout: 15000 });
        download.catch(()=>{});
        await page.getByRole('button', { name, exact: true }).click();
        const file = await download;
        assert.equal(await file.failure(), null);
        assert.match(file.suggestedFilename(), /^Carta_Compromiso_.*\.pdf$/);
        assert.equal((await readFile(await file.path())).subarray(0, 5).toString(), '%PDF-');
      }
      await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
      const download = page.waitForEvent('download', { timeout: 15000 });
      download.catch(()=>{});
      await page.getByRole('dialog').getByRole('button', { name: 'Descargar PDF', exact: true }).click();
      assert.equal(await (await download).failure(), null);
      assert.deepEqual(errors, []);
      console.log(`${channel}: tarjeta, carta y descarga tras guardar correctas`);
    } finally {
      await browser.close();
    }
  }
} finally {
  if (server) await new Promise(done => server.httpServer.close(done));
  await rm(root, { recursive: true, force: true });
}
