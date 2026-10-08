const { createHash } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const base='http://127.0.0.1:3000',docBase='http://127.0.0.1:8087/v1/projects/demo-espacios/databases/(default)/documents/usuarios_sistema/';
const evidence=[];
async function account(username,canWrite,password='Synthetic-only-123!'){
  const data={username,name:'Synthetic',role:canWrite?'Administrador':'Auxiliar',canCreateReservations:canWrite,canEditReservations:canWrite,canDeleteReservations:canWrite,passwordHash:createHash('sha256').update('espacios_community_salt_2026:'+password).digest('hex')};
  const r=await fetch(docBase+username,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typeof v==='boolean'?{booleanValue:v}:{stringValue:v}]))})});assert(r.ok);
}
async function login(username){const r=await fetch(base+'/api/auth/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password:'Synthetic-only-123!'})});const j=await r.json();assert(j.success);return j.token;}
async function send(name,token,expected){const r=await fetch(base+'/api/email/send',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify({to:['synthetic@example.test'],subject:'Synthetic audit',bodyText:'Local simulator only',attachments:[]})});const body=await r.json();evidence.push({name,status:r.status,success:body.success,mode:body.mode});assert.equal(r.status,expected);}
(async()=>{
  await account('api-writer',true);await account('api-reader',false);
  await send('Anonymous API rejection','',401);await send('Forged session rejection','synthetic.forged',401);
  const reader=await login('api-reader');await send('Read-only API rejection',reader,403);
  const writer=await login('api-writer');await send('Verified writer local manual mail',writer,200);
  await account('api-writer',false);await send('Revoked permission applied to active session',writer,403);
  await account('api-writer',true,'Synthetic-rotated-password');await send('Old session survives password rotation',writer,200);
  await fetch(docBase+'api-writer',{method:'DELETE'});await send('Deleted account revoked',writer,401);
})().catch(error=>{evidence.push({error:error.message});process.exitCode=1;console.error(error.message);}).finally(()=>{writeFileSync('outputs/audit-2026-10-08-api.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));});
