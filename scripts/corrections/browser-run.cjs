const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { scryptSync } = require('node:crypto');
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8087';
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const fixtureApp=initializeApp({projectId:'demo-espacios'},'corrections-browser');
const fixtureDb=getFirestore(fixtureApp);
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:8788';
const base = 'http://127.0.0.1:8087/v1/projects/demo-espacios/databases/(default)/documents';
const output = 'outputs/correcciones-2026-10-08-browser';
mkdirSync(output, { recursive: true });
const evidence = { harness: 'Real React CRUD hook, application services, IndexedDB, SDK and unchanged app UI; operations driven through diagnostic bridge', steps: [], checks: [], blockedExternalRequests: 0 };
const field = value => typeof value === 'string' ? { stringValue: value } : typeof value === 'boolean' ? { booleanValue: value } : typeof value === 'number' ? { integerValue: String(value) } : Array.isArray(value) ? { arrayValue: { values: value.map(field) } } : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k,v]) => [k, field(v)])) } };
async function put(path, data) {
  await fixtureDb.doc(path).set(data);
}
async function main() {
  await fetch('http://127.0.0.1:8087/emulator/v1/projects/demo-espacios/databases/(default)/documents', { method: 'DELETE' });
  const users = ['audit-a','audit-b','audit-reader'].map((username, index) => ({ username, name: username, role: index === 2 ? 'Auxiliar' : 'Administrador', initials: 'AT', avatarColor: 'bg-blue-600', canCreateReservations: index !== 2, canEditReservations: index !== 2, canDeleteReservations: index !== 2,
    passwordHash: 'scrypt$'+'01'.repeat(16)+'$'+scryptSync('Synthetic-only-123!','01'.repeat(16),64).toString('hex') }));
  for (const user of users) await put(`usuarios_sistema/${user.username}`, user);
  await put('configuracion_sistema/backup_schedule_config', { data: { enabled: false, intervalDays: 15 }, updatedAt: new Date().toISOString() });
  const browser = await chromium.launch({ executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const contexts = [];
  try {
    async function client(user, width = 1200) {
      const login = await fetch('http://127.0.0.1:3000/api/auth/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user.username, password: 'Synthetic-only-123!' }) });
      const session = await login.json(); assert.equal(session.success, true);
      const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: 'America/Santiago' }); contexts.push(context);
      await context.route('**/*', route => {
        if (['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)) return route.continue();
        evidence.blockedExternalRequests++; return route.abort('blockedbyclient');
      });
      await context.addInitScript(({ user, token, users }) => {
        if (!localStorage.getItem('audit-initialized')) {
          localStorage.setItem('espacios_auth_user', JSON.stringify(user));
          localStorage.setItem('espacios_auth_session_expiry_v1', String(Date.now()+3600000));
          localStorage.setItem('espacios_auth_session_start_v1', String(Date.now()));
          localStorage.setItem('espacios_auth_token_v2', token); sessionStorage.setItem('espacios_auth_token_v2', token);
          localStorage.setItem('espacios_users_accounts_v2', JSON.stringify(users));
          localStorage.setItem('reservas_comunitarias_cache_v6', '[]');
          localStorage.setItem('app_view_preference','calendar'); localStorage.setItem('audit-initialized','true');
        }
      }, { user: session.user, token: session.token, users:users.map(({passwordHash,...u})=>({...u,passwordHash:''})) });
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(120000);
      page.setDefaultTimeout(60000);
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => import('/scripts/corrections/browser-entry.tsx'));
      await page.waitForFunction(() => window.audit?.driver);
      return { page, context };
    }
    const a = await client(users[0]); const b = await client(users[1]);
    async function refresh() {
      await Promise.all([a.page,b.page].map(p => p.evaluate(() => window.audit.refresh())));
      // The production cache intentionally excludes cancelled rows; reloadAll
      // returns the full collection. Do not require those different scopes to match.
      await Promise.all([a.page,b.page].map(p => p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))));
    }
    async function capture(step) {
      await refresh();
      const data = await a.page.evaluate(async () => {
        const a = window.audit, f = a.firebase;
        const read = async c => (await f.getDocs(f.collection(a.db,c))).docs.map(d => ({ ...d.data(), id:d.id }));
        return { reservas: await read('reservas'), slots: await read('schedule_slots'), logs: await read('audit_logs'), cache: a.service.getLocalCache(), pending: await a.journal.readPendingOperations(), events: a.events.slice(-5), interfaceCount: a.rows.length, formOpen:a.formOpen };
      });
      const remoteIds = data.reservas.map(r => r.id).sort();
      const activeIds = data.reservas.filter(r => !['cancelada','rechazada','eliminada'].includes(r.estado)).map(r=>r.id).sort();
      const cacheIds = data.cache.map(r => r.id).sort();
      const summary = { step, reservas:remoteIds.length, slots:data.slots.length, logs:data.logs.length, pending:data.pending.length, cacheMatchesActive:JSON.stringify(activeIds)===JSON.stringify(cacheIds), interfaceCount:data.interfaceCount };
      evidence.steps.push(summary); writeFileSync(`${output}/${step}.json`, JSON.stringify(data,null,2));
      await a.page.screenshot({ path:`${output}/${step}.png` }); console.log(JSON.stringify(summary));
      return data;
    }
    const seriesCreated = await a.page.evaluate(async () => window.audit.driver.handleCreateOrUpdate({ id:'integrated-series',fecha:'2026-10-13',horaInicio:'10:00',horaFin:'11:00',espacio:'SALA 2',responsable:'Synthetic',descripcion:'Integrated series',tipoActividad:'Taller',actividadRecurrente:'Sí',estado:'activa',version:0 },true,['2026-10-13','2026-10-20','2026-10-27','2026-11-03']));
    assert.equal(seriesCreated,true); await capture('01-series');
    const replaced = await a.page.evaluate(async () => {
      const a=window.audit, original=a.rows.find(r=>r.id==='integrated-series');
      const next={...original,id:'integrated-replacement',descripcion:'Integrated exception',version:0};
      const batch=a.replacement.buildReplacementBatch(original,next,next.id,'Synthetic replacement');
      return a.driver.handleCreateOrUpdate(batch.updatedReservations[1],false,undefined,false,batch);
    }); assert.equal(replaced,true); await capture('02-replacement');
    await a.page.evaluate(async () => {
      const a=window.audit; await a.service.saveReservation({id:'integrated-blocker',fecha:'2026-10-27',horaInicio:'12:00',horaFin:'13:00',espacio:'SALA 2',responsable:'Synthetic',descripcion:'Synthetic conflict',tipoActividad:'Taller',actividadRecurrente:'No',estado:'activa',version:0});
    }); await refresh();
    const moved = await a.page.evaluate(async () => { const a=window.audit, original=a.rows.find(r=>r.fecha==='2026-10-20'); return a.driver.handleMoveReservation(original,{...original,horaInicio:'12:00',horaFin:'13:00'},'future'); });
    assert.equal(moved,true); const movedData=await capture('03-move');
    assert.equal(movedData.reservas.find(r=>r.fecha==='2026-10-27'&&r.serieRecurrente)?.horaInicio,'10:00');
    assert.equal(movedData.reservas.find(r=>r.fecha==='2026-11-03')?.horaInicio,'12:00');
    const edited = await b.page.evaluate(async () => { const a=window.audit, row=a.rows.find(r=>r.fecha==='2026-10-20'); return a.driver.handleCreateOrUpdate({...row,descripcion:'Editor B confirmed'},false); });
    assert.equal(edited,true); await capture('04-other-editor');
    const interruption = await a.page.evaluate(async () => {
      const a=window.audit, original=a.rows.find(r=>r.fecha==='2026-10-20');
      const batch=[{...original,comentarios:'Interrupted batch'},...Array.from({length:499},(_,i)=>({id:`integrated-batch-${i}`,fecha:'2026-11-10',horaInicio:'10:00',horaFin:'11:00',espacio:`SYNTHETIC ${i}`,responsable:'Synthetic',descripcion:'Synthetic pending',tipoActividad:'Taller',actividadRecurrente:'No',estado:'activa',version:0}))];
      a.openForm();
      try { await a.service.commitReservationChanges(batch,{onProgress:r=>{if(r.pendingIds.length)throw new Error('Audit injected interruption after confirmed chunk');}}); return {interrupted:false}; }
      catch(error){ return {interrupted:true,confirmed:error.result?.confirmedIds.length,pending:error.result?.pendingIds.length}; }
    }); assert.equal(interruption.interrupted,true); assert(interruption.confirmed>0&&interruption.pending>0); await capture('05-interrupted');
    await b.page.evaluate(async () => { const a=window.audit; await a.refresh(); const original=(await a.service.fetchReservationById('RSV_integrated-series_2')); await a.service.saveReservation({...original,descripcion:'Editor B after partial commit'}); });
    await a.page.reload({waitUntil:'domcontentloaded'}); await a.page.evaluate(()=>import('/scripts/corrections/browser-entry.tsx')); await a.page.waitForFunction(()=>window.audit?.driver);
    const recovered = await a.page.evaluate(async () => {const a=window.audit,ops=await a.journal.readPendingOperations();await a.service.resumeReservationOperation(ops[0].id);return (await a.service.fetchReservationById('RSV_integrated-series_2')).descripcion;});
    assert.equal(recovered,'Editor B after partial commit'); const recovery=await capture('06-recovered');
    assert.equal(recovery.reservas.length,505); assert.equal(recovery.pending.length,0);
    // A completed partial journal currently does not recreate the CRUD audit entry.
    evidence.checks.push({scenario:'Recovered operation audit',status:recovery.logs.some(l=>l.affectedCount===500 && l.operationParts?.length>1)?'passed':'failed',observed:'Snapshots captured atomically in each confirmed chunk, including recovery'});
    const restored = await a.page.evaluate(async () => {
      const a=window.audit, f=a.firebase;
      const rows=(await f.getDocs(f.collection(a.db,'audit_logs'))).docs.map(d=>({...d.data(),id:d.id}));
      const log=rows.find(l=>l.action==='UPDATE'&&String(l.description).includes('Movidas'));
      // A newer edit must prevent undo of that whole operation.
      const blocked=await a.logs.restoreAuditChange(log.id,a.auth.getStoredAuthUser());
      const replace=rows.find(l=>String(l.description).includes('Reemplazada solo'));
      const allowed=await a.logs.restoreAuditChange(replace.id,a.auth.getStoredAuthUser());
      return {blocked,allowed};
    }); assert.equal(restored.blocked.success,false); assert.equal(restored.allowed.success,true); evidence.checks.push({scenario:'Restore after later edit',status:'passed',...restored}); await capture('07-audit-restore');
    const backupComparison = await a.page.evaluate(async () => {
      const a=window.audit,f=a.firebase,backup=await a.backup.createDatabaseBackup({tipo:'manual',creadoPor:'audit-a'});
      const before=(await f.getDocs(f.collection(a.db,'reservas'))).docs.map(d=>d.data());
      const target=before.find(r=>r.id==='integrated-series'); await a.service.saveReservation({...target,descripcion:'After backup mutation'});
      const reloaded=await a.backup.fetchFullBackupRecord(backup.id); const result=await a.backup.restoreDatabaseFromBackup(reloaded,a.auth.getStoredAuthUser());
      const after=(await f.getDocs(f.collection(a.db,'reservas'))).docs.map(d=>d.data());
      const stable=rows=>JSON.stringify(rows.map(({version,createdAt,updatedAt,lastOperationId,restoredStateVersion,editadoPor,fechaEdicion,...r})=>r).sort((a,b)=>a.id.localeCompare(b.id)));
      return {success:result.success,count:after.length,domainFieldsEqual:stable(before)===stable(after),error:result.error,backupCollections:Object.keys(backup.data),backupId:backup.id};
    }); console.log(JSON.stringify(backupComparison)); assert.equal(backupComparison.success,true); assert.equal(backupComparison.domainFieldsEqual,true); evidence.checks.push({scenario:'Backup reservations round trip',status:'passed',...backupComparison}); await capture('08-backup-restore');
    const reader=await client(users[2],390);
    await reader.page.locator('#btn-new-reservation').click();
    evidence.checks.push({scenario:'Reader UI blocks creation after click',status:await reader.page.locator('[role=dialog]').count()===0?'passed':'failed',dialogs:await reader.page.locator('[role=dialog]').count()});
    await reader.page.screenshot({path:`${output}/09-reader-mobile.png`});
    // A second tab of the same account sees shared storage but the journal is not filtered by actor.
    const isolation=await a.page.evaluate(async()=>{const a=window.audit;await a.journal.updateOperationJournal({id:'isolation-a',actor:'audit-a',reservations:[],deletedIds:[],confirmedIds:[],allowConflictOverride:false});a.auth.clearAuthUser();a.auth.saveAuthUser({username:'audit-b',name:'audit-b',role:'Administrador',canCreateReservations:true,canEditReservations:true,canDeleteReservations:true});return (await a.journal.readPendingOperations()).map(o=>({id:o.id,actor:o.actor}));});
    const blockedResume=await a.page.evaluate(async()=>{try{await window.audit.service.resumeReservationOperation('isolation-a');return false;}catch{return true;}});
    evidence.checks.push({scenario:'Cross-account recovery authorization',status:blockedResume?'passed':'failed',rawSharedJournal:isolation,blockedResume});
    console.log('Integrated browser scenario completed');
  } finally { for(const c of contexts)await c.close();await browser.close(); }
}
main().finally(async()=>{await fixtureDb.terminate();await deleteApp(fixtureApp);}).catch(error=>{evidence.error=String(error.stack);process.exitCode=1;console.error(error.message);}).finally(()=>writeFileSync(`${output}/summary.json`,JSON.stringify(evidence,null,2)));
