import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, getDocs, collection, terminate } from 'firebase/firestore';
import type { Reservation } from '../src/types';
const context=vi.hoisted(()=>({db:null as any}));
vi.mock('../src/firebase/config',()=>({getDb:()=>context.db}));
const phase=process.env.BENCH_PHASE || 'after';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8087') throw new Error('Only the localhost demo emulator is allowed');
const app=initializeApp({projectId:'demo-espacios',apiKey:'local-only'},'write-measurement');
context.db=getFirestore(app);connectFirestoreEmulator(context.db,'127.0.0.1',8087);
let service:any;let baselineConfig:any;
const results:any[]=[];
beforeAll(async()=> {
  if(phase==='before') {
    service=await import(pathToFileURL(resolve('work/baseline-source/src/services/reservationService.ts')).href);
    baselineConfig=await import(pathToFileURL(resolve('work/baseline-source/src/firebase/config.ts')).href);
  } else service=await import('../src/services/reservationService');
});
afterAll(async()=> {
  writeFileSync(`outputs/${phase}-write-performance.json`,JSON.stringify({phase,runs:30,warmups:3,project:'demo-espacios',pollIntervalMs:10,results},null,2));
  await terminate(context.db);await deleteApp(app);
  if(baselineConfig) {await terminate(baselineConfig.getDb());await deleteApp(baselineConfig.getFirebaseApp());}
});
describe('confirmed reservation and availability persistence',()=> {
  it.each([1,50,500])('%i occurrences', async count=> {
    const samples:any[]=[];
    for(let run=0;run<33;run++) {
      await fetch('http://127.0.0.1:8087/emulator/v1/projects/demo-espacios/databases/(default)/documents',{method:'DELETE'});
      localStorage.clear();service.setLocalCache([]);
      const rows:Reservation[]=Array.from({length:count},(_,i)=>({id:`measure-${count}-${run}-${i}`,fecha:new Date(Date.UTC(2027,0,1+i)).toISOString().slice(0,10),horaInicio:'10:00',horaFin:'11:00',espacio:'SALA 2',responsable:'Vecino Test',descripcion:'Medición de serie',tipoActividad:'Taller',actividadRecurrente:count>1?'Sí':'No',serieRecurrente:`series-${count}-${run}`,claveAutorizacion:'CCD',estado:'activa',terminaDiaSiguiente:false,version:0}));
      const start=performance.now();
      if(count===1) await service.saveReservation(rows[0],{intent:'create'});else await service.saveReservationsBatch(rows,{intent:'create'});
      const returnedMs=performance.now()-start;
      const last=rows[rows.length-1];
      const key=`${last.fecha}_${encodeURIComponent('SALA 2')}`;
      const url=`http://127.0.0.1:8087/v1/projects/demo-espacios/databases/(default)/documents/schedule_slots/${encodeURIComponent(key)}`;
      let confirmed=false;
      while(performance.now()-start<60000) {
        const response=await fetch(url);
        if(response.ok) {
          const data:any=await response.json();
          if(data.fields?.bookings?.arrayValue?.values?.some((b:any)=>b.mapValue?.fields?.id?.stringValue===last.id)) {confirmed=true;break;}
        }
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(confirmed).toBe(true);
      const confirmedMs=performance.now()-start;
      const db=phase==='before'?baselineConfig.getDb():context.db;
      const [reservations,slots]=await Promise.all([getDocs(collection(db,'reservas')),getDocs(collection(db,'schedule_slots'))]);
      expect(reservations.size).toBe(count);expect(slots.size).toBe(count);
      expect(slots.docs.every(d=>d.data().bookings.length===1)).toBe(true);
      if(run>=3)samples.push({returnedMs,confirmedMs});
    }
    const metric=(key:string)=> {const sorted=samples.map(s=>s[key]).sort((a,b)=>a-b);return {medianMs:sorted[15],p95Ms:sorted[28]};};
    results.push({count,returned:metric('returnedMs'),confirmed:metric('confirmedMs'),samples});
    console.log(`${phase}: ${count} occurrences completed`);
  });
});
