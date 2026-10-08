const { chromium } = require('playwright');
const { writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const origin='http://127.0.0.1:8788',base='http://127.0.0.1:8087/v1/projects/demo-espacios/databases/(default)/documents';
const field=v=>typeof v==='string'?{stringValue:v}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{integerValue:String(v)}:Array.isArray(v)?{arrayValue:{values:v.map(field)}}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,v])=>[k,field(v)]))}};
async function put(path,data){const r=await fetch(base+'/'+path,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,field(v)]))})});assert(r.ok);}
const evidence={checks:[]};
(async()=>{
  await fetch('http://127.0.0.1:8087/emulator/v1/projects/demo-espacios/databases/(default)/documents',{method:'DELETE'});
  const users=['audit-a','audit-reader'].map((username,i)=>({username,name:username,role:i?'Auxiliar':'Administrador',initials:'AT',avatarColor:'blue',canCreateReservations:!i,canEditReservations:!i,canDeleteReservations:!i,passwordHash:createHash('sha256').update('espacios_community_salt_2026:Synthetic-only-123!').digest('hex')}));
  for(const user of users)await put('usuarios_sistema/'+user.username,user);
  await put('configuracion_sistema/backup_schedule_config',{data:{enabled:false,intervalDays:15},updatedAt:new Date().toISOString()});
  const row=(id,fecha)=>({id,fecha,horaInicio:'10:00',horaFin:'11:00',espacio:'SALA 2',responsable:'Synthetic',descripcion:id,tipoActividad:'Taller',actividadRecurrente:'No',estado:'activa',terminaDiaSiguiente:false,version:1});
  await put('reservas/check-current',row('check-current','2026-10-13'));
  await put('reservas/check-history',row('check-history','2025-05-13'));
  const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const contexts=[];
  try{
    async function client(user,width){
      const r=await fetch('http://127.0.0.1:3000/api/auth/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user.username,password:'Synthetic-only-123!'})});const session=await r.json();assert(session.success);
      const c=await browser.newContext({viewport:{width,height:844},timezoneId:'America/Santiago'});contexts.push(c);
      await c.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
      await c.addInitScript(({user,token,users})=>{localStorage.setItem('reservas_comunitarias_cache_v6','[]');localStorage.setItem('espacios_auth_user',JSON.stringify(user));localStorage.setItem('espacios_auth_session_expiry_v1',String(Date.now()+3600000));localStorage.setItem('espacios_auth_session_start_v1',String(Date.now()));localStorage.setItem('espacios_auth_token_v2',token);localStorage.setItem('espacios_users_accounts_v2',JSON.stringify(users));localStorage.setItem('app_view_preference','calendar');},{user:session.user,token:session.token,users});
      const p=await c.newPage();p.setDefaultNavigationTimeout(120000);p.setDefaultTimeout(60000);await p.goto(origin,{waitUntil:'domcontentloaded'});await p.evaluate(()=>import('/scripts/audit/browser-entry.tsx'));await p.waitForFunction(()=>window.audit?.driver);return p;
    }
    const editor=await client(users[0],1200),reader=await client(users[1],390);
    await reader.locator('#btn-new-reservation').click();
    const readerModal=await reader.locator('[role=dialog]').count();
    evidence.checks.push({scenario:'Reader UI blocks creation after click',status:readerModal===0?'passed':'failed',dialogs:readerModal});
    await reader.screenshot({path:'outputs/audit-2026-10-08-reader-click.png'});
    await editor.locator('#btn-new-reservation').click();await editor.locator('[role=dialog]').first().waitFor();
    const focus=await editor.evaluate(()=>!!document.activeElement?.closest('[role=dialog]'));
    await editor.keyboard.press('Escape');await editor.waitForFunction(()=>document.querySelectorAll('[role=dialog]').length===0);
    evidence.checks.push({scenario:'Desktop modal initial focus and Escape',status:focus?'passed':'failed',focusInside:focus,dialogsAfterEscape:await editor.locator('[role=dialog]').count()});
    const holiday=await editor.evaluate(async()=>{const a=window.audit;await a.service.saveReservation({id:'check-holiday',fecha:'2026-12-25',horaInicio:'10:00',horaFin:'11:00',espacio:'SALA 2',responsable:'Synthetic',descripcion:'Authorized holiday',tipoActividad:'Taller',actividadRecurrente:'No',estado:'activa',version:0,claveAutorizacionFeriado:'CCD'});return {persisted:(await a.firebase.getDoc(a.firebase.doc(a.db,'reservas','check-holiday'))).exists(),cacheVisible:a.service.getLocalCache().some(r=>r.id==='check-holiday')};});
    evidence.checks.push({scenario:'Authorized holiday cache',status:holiday.cacheVisible?'passed':'failed',...holiday});
    await editor.locator('#btn-navbar-more-options').click();await editor.getByRole('button',{name:/Copias de Seguridad y Base de Datos/}).click();await editor.locator('#tab-btn-csv').click();
    const text=await editor.locator('[role=dialog]').last().innerText();
    const downloadPromise=editor.waitForEvent('download');await editor.locator('#btn-modal-export-csv').click();const download=await downloadPromise;const stream=await download.createReadStream();let csv='';for await(const chunk of stream)csv+=chunk.toString('utf8');
    evidence.checks.push({scenario:'CSV loaded scope',status:'observed',currentIncluded:csv.includes('check-current'),historyIncluded:csv.includes('check-history'),holidayIncluded:csv.includes('check-holiday'),scopeLabel:text.match(/registros actualmente disponibles/)?.[0]||null});
    await editor.keyboard.press('Escape');
    await editor.locator('#nav-tab-analytics').click();await editor.getByText('Total de Reservas',{exact:true}).waitFor();
    const total=await editor.getByText('Total de Reservas',{exact:true}).evaluate(e=>e.parentElement.innerText);
    evidence.checks.push({scenario:'Statistics dataset scope',status:'observed',totalCard:total,firestoreRows:3});
    const isolation=await editor.evaluate(async()=>{const a=window.audit;await a.journal.updateOperationJournal({id:'isolation-a',actor:'audit-a',reservations:[],deletedIds:[],confirmedIds:[],allowConflictOverride:false});a.auth.clearAuthUser();a.auth.saveAuthUser({username:'audit-reader',name:'audit-reader',role:'Auxiliar',canCreateReservations:false,canEditReservations:false,canDeleteReservations:false});const visible=(await a.journal.readPendingOperations()).map(o=>({id:o.id,actor:o.actor}));let blocked=false;try{await a.service.resumeReservationOperation('isolation-a');}catch{blocked=true;}return {visible,blocked};});
    evidence.checks.push({scenario:'Cross-account journal resume',status:isolation.blocked?'passed':'failed',...isolation});
    // Same browser profile, second tab: durable journal is shared; authorization remains per actor.
    const tab=await contexts[0].newPage();await tab.goto(origin,{waitUntil:'domcontentloaded'});await tab.evaluate(()=>import('/scripts/audit/browser-entry.tsx'));await tab.waitForFunction(()=>window.audit?.driver);
    const tabJournal=await tab.evaluate(async()=> (await window.audit.journal.readPendingOperations()).map(o=>o.id));
    evidence.checks.push({scenario:'Second tab sees durable journal',status:tabJournal.includes('isolation-a')?'passed':'failed',operationIds:tabJournal});
    await editor.screenshot({path:'outputs/audit-2026-10-08-statistics.png'});
  }finally{for(const c of contexts)await c.close();await browser.close();}
})().catch(error=>{evidence.error=error.stack;process.exitCode=1;console.error(error.message);}).finally(()=>{writeFileSync('outputs/audit-2026-10-08-browser-checks.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));});
