import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBundledVisualEvidence} from '../../server/fia/preparation/bundled-visual-evidence.mjs';
const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root));
function inputs(){const publicationBytes=read('server/fia/publication/approved-presentation.json'),p=JSON.parse(publicationBytes);return {allowlistBytes:read('tests/release/runtime-allowlist.json'),publicationBytes,markArchiveBytes:read('server/fia/compiler/presentation/source-packs.json.gz'),lukeArchiveBytes:read('server/fia/compiler/presentation/source-packs-luk.json.gz'),payloads:Object.fromEntries(Object.values(p.assets).filter(a=>['image','map'].includes(a.kind)&&a.src?.startsWith('/assets/mark-1-1-13/')).map(a=>[a.src,read('apps/web/public'+a.src)]))};}
test('all8 existing local visuals have actual byte, full current decode and canonical rights evidence but no new admission',async()=>{
 const report=await buildBundledVisualEvidence(inputs());assert.equal(report.verifiedBundlePayloads,8);assert.equal(report.candidateBindings,46);assert.equal(report.newReuseAdmissions,0);
 for(const e of report.entries){assert.equal(e.evidenceKind,'verified-existing-published-bundle');assert.equal(e.decode.pixelsSha256.length,64);assert.ok(e.decode.width>0&&e.decode.height>0);assert.equal(e.decode.format,e.mime);assert.equal(e.rights.record.revision,e.sourceIdentity.revision);assert.equal(e.reuse.state,'blocked');assert.equal(e.review.status,'missing');assert.equal(e.grantsFreshOriginalCustody,false);assert.equal(e.grantsPublicationAdmission,false);}
 assert.equal(report.entries.filter(e=>e.kind==='map').reduce((n,e)=>n+e.candidatePackIds.length,0),4);
});
test('authority tampering, absent payload and byte corruption fail closed',async()=>{
 for(const field of ['allowlistBytes','publicationBytes','markArchiveBytes','lukeArchiveBytes']){const p=inputs();p[field]=Buffer.from('{}');await assert.rejects(buildBundledVisualEvidence(p),/bundled-visual-(authority|archive)-pin/);}
 for(const corrupt of [false,true]){const p=inputs(),key=Object.keys(p.payloads)[0];if(corrupt)p.payloads[key]=Buffer.from('not a visual');else delete p.payloads[key];await assert.rejects(buildBundledVisualEvidence(p),/bundled-visual-byte-pin/);}
});
