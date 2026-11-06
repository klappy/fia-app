import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {auditLocalMediaReuse} from '../../scripts/audit-local-media-reuse.mjs';
const root=new URL('../../',import.meta.url).pathname;
const readBytes=path=>readFileSync(resolve(root,path));
test('all11 actual local payloads verify and exact canonical joins cover four explicit dimensions',()=>{
 const report=auditLocalMediaReuse({root});assert.equal(report.assets.length,11);assert.equal(report.totalVerifiedBytes,28819911);assert.equal(report.newAdmissions,0);
 assert.deepEqual(report.coverage.map(c=>({group:c.group,packs:c.observedPacks,bindings:c.candidateBindings,candidates:c.candidatePackCount,newAdmissions:c.newAdmissions})),[
 {group:'eng.MRK',packs:68,bindings:{image:9,map:4,video:6},candidates:4,newAdmissions:0},
 {group:'spa.MRK',packs:68,bindings:{image:9,map:0,video:6},candidates:4,newAdmissions:0},
 {group:'eng.LUK',packs:97,bindings:{image:12,map:0,video:9},candidates:8,newAdmissions:0},
 {group:'spa.LUK',packs:97,bindings:{image:12,map:0,video:9},candidates:8,newAdmissions:0}]);
 for(const a of report.assets){assert.equal(a.admission,'candidate-only-no-new-admission');assert.equal(a.sha256.length,64);assert.equal(a.sourceIdentity.sourceFileSha256.length,64);}
 assert.equal(report.assets.filter(a=>a.provenance.standaloneMetadata).length,3);
 assert.equal(report.assets.filter(a=>a.provenance.videoReplacementLedger).length,3);
});
test('same URL Spanish maps lacking matching canonical revision are excluded',()=>{
 const report=auditLocalMediaReuse({root});for(const a of report.assets.filter(a=>a.kind==='map'))assert.deepEqual(a.candidatePackIds,['eng.MRK-1-1-13']);
});
test('corrupt local bytes, archive pin and resource bindings refuse report construction',()=>{
 for(const target of ['apps/web/public/assets/mark-1-1-13/a112.jpg','server/fia/compiler/presentation/source-packs-luk.json.gz','server/fia/compiler/presentation/source-bindings.json'])assert.throws(()=>auditLocalMediaReuse({root,readBytes:path=>{const bytes=readBytes(path);if(path!==target)return bytes;if(path.endsWith('.json')){const doc=JSON.parse(bytes);doc['eng.MRK-1-1-13'].resources='0'.repeat(64);return Buffer.from(JSON.stringify(doc));}return Buffer.concat([bytes,Buffer.from('x')]);}}),/reuse-(local-byte-pin|archive-pin|resource-binding)/);
});
test('read-only report is deterministic and does not request network access',()=>{
 const previous=globalThis.fetch;globalThis.fetch=()=>{throw Error('network forbidden');};try{assert.deepEqual(auditLocalMediaReuse({root}),auditLocalMediaReuse({root}));}finally{globalThis.fetch=previous;}
});
