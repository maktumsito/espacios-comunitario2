// Redact credentials and predefined account identities from generated test reports.
// This only touches this audit's artifacts, never earlier reports or application files.
const fs = require('node:fs');
const path = require('node:path');
const source=fs.readFileSync('src/services/authService.ts','utf8');
const credentials=[...source.matchAll(/passwordHash:\s*'([^']+)'[^\r\n]+\/\/ hash\(([^)]+)\)/g)].flatMap(m=>[m[1],m[2]]);
const identities=[...source.matchAll(/(?:name|username|email):\s*'([^']+)'/g)].map(m=>m[1]);
const masks=[...new Set([...credentials,...identities])].filter(s=>s.length>3).sort((a,b)=>b.length-a.length);
const files=fs.readdirSync('outputs').filter(n=>/^audit-2026-10-08.*\.json$/.test(n)).map(n=>path.join('outputs',n));
if(fs.existsSync('outputs/audit-2026-10-08-browser'))for(const name of fs.readdirSync('outputs/audit-2026-10-08-browser'))if(name.endsWith('.json'))files.push(path.join('outputs/audit-2026-10-08-browser',name));
let changed=0;
for(const file of files){const raw=fs.readFileSync(file,'utf8');let safe=raw;for(const mask of masks)safe=safe.split(mask).join('[REDACTED_PREDEFINED_ACCOUNT]');if(raw!==safe){JSON.parse(safe);fs.writeFileSync(file,safe);changed++;}}
console.log(JSON.stringify({reportsInspected:files.length,reportsRedacted:changed}));
