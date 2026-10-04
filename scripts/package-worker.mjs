import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {writeSnapshot} from '../server/faces/worker/export-snapshot.mjs';
const closure=JSON.parse(readFileSync('server/faces/worker/BACKEND-CLOSURE.json'));
for(const file of closure.files){const bytes=readFileSync(file.path);if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Unreviewed backend dependency: '+file.path);}
// Dynamic import follows closure verification: publication startup cannot precede trust checks.
const {createService}=await import('../server/fia/publication/service.mjs');
const snapshot=writeSnapshot(createService(),'server/faces/worker/authority.json','server/faces/worker/generated/snapshot.json');
console.log(`Worker read bundle: ${snapshot.records.length} accepted immutable records; no media copied`);
