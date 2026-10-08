// Compile the unchanged server's declarations in two isolated module instances.
// Only automatic app startup is omitted. All mail uses the built-in local simulator.
const { buildSync } = require('esbuild');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
process.env.VITE_LOCAL_TEST_MODE = 'true';
require('./server-preload.cjs');
const original = readFileSync('server.ts', 'utf8');
const cut = original.lastIndexOf('\nstartServer().catch');
assert(cut > 0);
const source = original.slice(0,cut).replace('if (localTestMode) return { success: true', 'if (localTestMode) await globalThis.__auditDeliveryBarrier();\n  if (localTestMode) return { success: true') + '\nexport const auditScheduler = { executeScheduledDispatchServer };';
let arrivals=0,release;const barrier=new Promise(resolve=>release=resolve);
globalThis.__auditDeliveryBarrier=()=>{arrivals++;if(arrivals===2)release();return arrivals<=2?barrier:Promise.resolve();};
const bundled = buildSync({ stdin: { contents: source, resolveDir: process.cwd(), sourcefile: 'server.ts', loader: 'ts' }, bundle:true, write:false, platform:'node', format:'cjs', packages:'external', define: { 'import.meta.env':'{}' } }).outputFiles[0].text;
let rejectMarker = false;
function instance(name) {
  const filename = resolve('work', name+'.cjs'); const module = new Module(filename); module.filename=filename; module.paths=Module._nodeModulePaths(process.cwd());
  const requireOriginal=module.require.bind(module);
  module.require = name => {
    const value=requireOriginal(name);
    if(name!=='firebase/firestore')return value;
    return {...value,setDoc:(ref,data,...args)=>{
      if(rejectMarker&&ref.id==='gmail_dispatch_config'&&data?.schedule?.ultimaFechaDespacho)throw new Error('Audit marker failure after simulated delivery');
      return value.setDoc(ref,data,...args);
    }};
  };
  module._compile(bundled,filename);return module.exports.auditScheduler;
}
(async()=>{
  const sdk=await import('firebase/firestore'), apps=await import('firebase/app');
  const app=apps.initializeApp({projectId:'demo-espacios',apiKey:'local-only'},'scheduler-audit-seed');
  const db=sdk.getFirestore(app);sdk.connectFirestoreEmulator(db,'127.0.0.1',8087);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const config={data:{defaultRecipients:['synthetic@example.test'],dispatchFilterMode:'actividades_seleccionadas',selectedActivityTypes:['Taller'],schedule:{enabled:true,horaEnvio:'00:00',diasSemana:[0,1,2,3,4,5,6],alcanceActividades:'dia_del_envio'}}};
  const reset=()=>sdk.setDoc(sdk.doc(db,'configuracion_sistema','gmail_dispatch_config'),config);
  await sdk.setDoc(sdk.doc(db,'reservas','scheduler-synthetic'),{id:'scheduler-synthetic',fecha:today,horaInicio:'09:00',horaFin:'10:00',espacio:'SALA 2',responsable:'Synthetic',tipoActividad:'Taller',descripcion:'Synthetic scheduler',estado:'activa',terminaDiaSiguiente:false});
  await reset();
  const a=instance('audit-instance-a'),b=instance('audit-instance-b');
  await reset();
  const concurrent=await Promise.all([a.executeScheduledDispatchServer(false),b.executeScheduledDispatchServer(false)]);
  await reset(); rejectMarker=true;
  const c=instance('audit-instance-c');const first=await c.executeScheduledDispatchServer(false); const sameProcess=await c.executeScheduledDispatchServer(false);
  const restarted=instance('audit-instance-restart'); const afterRestart=await restarted.executeScheduledDispatchServer(false);
  const evidence={date:today,delivery:'local simulator only',twoInstances:{successfulSimulatedDispatches:concurrent.filter(r=>r.success).length,results:concurrent.map(({success,skipped,message,attachments})=>({success,skipped,message,attachments}))},failedMarker:{first:first.success,sameProcess:sameProcess.success,afterRestart:afterRestart.success}};
  writeFileSync('outputs/audit-2026-10-08-scheduler.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
  assert.equal(evidence.twoInstances.successfulSimulatedDispatches,2);
  await sdk.terminate(db);await apps.deleteApp(app);process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1);});
