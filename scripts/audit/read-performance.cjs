// Explicit demo REST seeding and real SDK queries. No production config import.
const { performance } = require('node:perf_hooks');
const { writeFileSync } = require('node:fs');
(async()=>{
  const apps=await import('firebase/app'),sdk=await import('firebase/firestore');
  const app=apps.initializeApp({projectId:'demo-espacios',apiKey:'local-only'},'audit-read-performance');
  const db=sdk.getFirestore(app);sdk.connectFirestoreEmulator(db,'127.0.0.1',8087);
  const base='http://127.0.0.1:8087/v1/projects/demo-espacios/databases/(default)/documents',results=[];
  for(const count of [500,2500,10000]){
    await fetch('http://127.0.0.1:8087/emulator/v1/projects/demo-espacios/databases/(default)/documents',{method:'DELETE'});
    const writes=Array.from({length:count},(_,i)=>({update:{name:`projects/demo-espacios/databases/(default)/documents/reservas/read-${i}`,fields:Object.fromEntries(Object.entries({id:`read-${i}`,fecha:i%4===0?'2026-10-13':i%4===1?'2026-10-20':'2025-05-13',horaInicio:'10:00',horaFin:'11:00',espacio:'SALA 2',responsable:'Synthetic',tipoActividad:'Taller',descripcion:'Synthetic read benchmark'}).map(([k,v])=>[k,{stringValue:v}]))}}));
    for(let start=0;start<writes.length;start+=400){const r=await fetch(base+':commit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({writes:writes.slice(start,start+400)})});if(!r.ok)throw new Error(`seed: ${r.status}`);}
    const ref=sdk.collection(db,'reservas');
    const queries=[['complete',ref],['editor-active',sdk.query(ref,sdk.where('fecha','>=','2026-09-08'),sdk.orderBy('fecha'))],['reader-day',sdk.query(ref,sdk.where('fecha','==','2026-10-13'))]];
    for(const [scope,q] of queries){
      const start=performance.now();const first=await sdk.getDocsFromServer(q);const serverMs=performance.now()-start;
      const cacheStart=performance.now();const cached=await sdk.getDocsFromCache(q);const cacheMs=performance.now()-cacheStart;
      results.push({count,scope,observedReturnedDocuments:first.size,serverMs,cacheMs,serverFromCache:first.metadata.fromCache,cacheReturnedDocuments:cached.size,cacheFromCache:cached.metadata.fromCache});
    }
    console.log(`Measured ${count} synthetic documents`);
  }
  writeFileSync('outputs/audit-2026-10-08-read-performance.json',JSON.stringify({project:'demo-espacios',billing:'not measured',scope:'SDK query timings; REST fixtures do not construct availability slots',runsPerScope:1,results},null,2));
  await sdk.terminate(db);await apps.deleteApp(app);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
