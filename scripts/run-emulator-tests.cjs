const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const result=spawnSync(process.execPath,[resolve('node_modules/vitest/vitest.mjs'),'run','src/services/__tests__/reservationPersistence.test.ts','server/__tests__/trustedData.integration.test.ts','--maxWorkers=1','--no-file-parallelism','--testTimeout=30000','--hookTimeout=30000',...process.argv.slice(2)],{
  stdio:'inherit',env:{...process.env,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8087'},
});
process.exitCode=result.status??1;
