import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {writeSnapshot} from '../server/faces/worker/export-snapshot.mjs';
const closure=JSON.parse(readFileSync('server/faces/worker/BACKEND-CLOSURE.json'));
for(const file of closure.files){const bytes=readFileSync(file.path);if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Unreviewed backend dependency: '+file.path);}
// Dynamic import follows closure verification: publication startup cannot precede trust checks.
const {createService}=await import('../server/fia/publication/service.mjs');
const snapshot=writeSnapshot(createService(),'server/faces/worker/authority.json','server/faces/worker/generated/snapshot.json');
const {buildGeneralizedSnapshot}=await import('../server/fia/publication/generalized.mjs');
const extension=buildGeneralizedSnapshot('dist',JSON.parse(readFileSync('server/fia/publication/trusted-generalized.json')));
for(const record of extension.records){if(snapshot.current[record.packId])throw Error('duplicate-generalized-record');snapshot.records.push(record);snapshot.current[record.packId]=record.revision;}
snapshot.staticArtifacts=extension.staticArtifacts.filter(item=>!snapshot.artifacts.some(a=>a.descriptor.sha256===item.descriptor.sha256));
snapshot.generalizedAuthority=extension.authority;
const {exportGuideSources}=await import('../server/fia/compiler/presentation/export-guide-sources.mjs');
snapshot.canonicalSources=exportGuideSources({outputRoot:'dist',sourceRevision:extension.authority.sourceCommit});
const {buildApprovedAudioProofIndex}=await import('./approved-audio-proof-index.mjs');
const approved=await buildApprovedAudioProofIndex({publicRoot:'dist',authority:{registrySha256:extension.authority.catalog.sha256,sourceRevision:extension.authority.sourceCommit}});
mkdirSync('dist/content/approved-audio',{recursive:true});
writeFileSync('dist'+approved.descriptor.path,approved.bytes);
snapshot.approvedAudioProofIndex=approved.descriptor;
writeFileSync('server/faces/worker/generated/snapshot.json',JSON.stringify(snapshot)+'\n');
console.log(`Worker read bundle: ${snapshot.records.length} accepted immutable records; no media copied`);
