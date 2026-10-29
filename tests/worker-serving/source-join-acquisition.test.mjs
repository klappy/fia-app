import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {buildGeneralizedSnapshot} from '../../server/fia/publication/generalized.mjs';
import {exportGuideSources,exportAssociationSources} from '../../server/fia/compiler/presentation/export-guide-sources.mjs';
import {buildApprovedAudioProofIndex} from '../../scripts/approved-audio-proof-index.mjs';
import {guideFragmentIdentity} from '../../server/fia/preparation/guide-fragment.mjs';
import {descriptorOf} from '../../server/fia/preparation/source-associations/composer.mjs';

// #313 QA (comment 6499486774): a normal Open acquires the archive-pinned guide file cold, retains it and consumes its join, with
// no priming and no injected decision. OPT-IN and LOCAL: FIA_GUIDE_PINNED_FILE names a local copy of the pinned bytes (sha
// 7d22f64b…, from an earlier retained run). The Worker's outbound is a stub that serves those bytes for the one archive-composed
// URL and refuses everything else; nothing reaches the network. Without the file the test is skipped.
const pinned=process.env.FIA_GUIDE_PINNED_FILE;
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://dev.fiaguide.app',publicRoot='apps/web/public',PACK='eng.MRK-4-35-41',UNIT='S03-U017';
const hex=b=>createHash('sha256').update(b).digest('hex');

test('a normal Open acquires the pinned guide cold, retains it, consumes the a293 join; reads never acquire; a warm Open fetches nothing',{skip:!pinned&&'FIA_GUIDE_PINNED_FILE not set (opt-in local proof)'},async()=>{
 const archive=JSON.parse(gunzipSync(await readFile('server/fia/compiler/presentation/source-packs.json.gz'),{maxOutputLength:134217728})),descriptor=descriptorOf(archive.packs[PACK].guide);
 const bytes=new Uint8Array(await readFile(pinned));assert.equal(hex(bytes),descriptor.fileSha256,'the local copy is the pinned file');
 const identity=await guideFragmentIdentity({repo:`${descriptor.owner}/${descriptor.collection}`,revision:descriptor.revision,path:descriptor.path});
 const dir=await mkdtemp(join(tmpdir(),'fia-source-join-acquisition-')),authority=JSON.parse(await readFile('server/fia/publication/trusted-generalized.json')),extension=buildGeneralizedSnapshot(publicRoot,authority);
 const canonicalSources=exportGuideSources({outputRoot:dir,sourceRevision:authority.sourceCommit}),associationSources=exportAssociationSources({outputRoot:dir,sourceRevision:authority.sourceCommit});
 const proof=await buildApprovedAudioProofIndex({publicRoot,authority:{registrySha256:authority.catalog.sha256,sourceRevision:authority.sourceCommit}});
 const snapshot={schema:'fia.worker-read-snapshot.v1',records:extension.records,current:extension.current,staticArtifacts:extension.staticArtifacts,artifacts:[],canonicalSources,associationSources,generalizedAuthority:extension.authority,approvedAudioProofIndex:proof.descriptor};
 const counts={outbound:0,refused:[]};
 // The release Worker as built; no test door.
 const entry=`export {default,FiaPreparationJobs} from ${JSON.stringify(resolve('server/faces/worker/entry.mjs'))};`;
 const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'source-join-acquisition-entry.mjs',loader:'js'},bundle:true,platform:'browser',format:'esm',external:['node:*'],write:false,plugins:[{name:'snapshot',setup(b){b.onResolve({filter:/generated\/snapshot\.json$/},()=>({path:'snapshot',namespace:'sj'}));b.onLoad({filter:/.*/,namespace:'sj'},()=>({contents:JSON.stringify(snapshot),loader:'json'}));}}]});
 const mf=new Miniflare({...convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}},r2Buckets:['FIA_ORIGINALS'],
  serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname;let b;try{b=path===proof.descriptor.path?proof.bytes:await readFile((path.startsWith('/content/source-guides/')?dir:publicRoot)+path);}catch(error){if(error.code!=='ENOENT')throw error;return new Response('Not found',{status:404});}return new Response(b,{headers:{'Content-Type':'application/json','Content-Length':String(b.length)}});}},
  outboundService:request=>{if(request.url!==identity.url||request.method!=='GET'){counts.refused.push(request.url);throw Error('outbound refused');}counts.outbound++;return new Response(bytes,{status:200,headers:{'content-type':'text/plain; charset=utf-8','content-length':String(bytes.length)}});}}),resourcePersistencePath:join(dir,'storage')});
 try{
  const read=async(path,init)=>{const r=await mf.dispatchFetch(origin+path,init);return {status:r.status,body:await r.json()};};
  const current=await read('/v1/packs/'+PACK);assert.equal(current.status,200);assert.ok(current.body.preparationDemand);
  assert.equal(counts.outbound,0,'a read never acquires');
  const open=()=>read('/v1/presentation-preparations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(current.body.preparationDemand)});
  const ready=await open();assert.equal(ready.status,200,JSON.stringify(ready.body));assert.equal(ready.body.status,'ready');
  assert.equal(counts.outbound,1,'cold: one upstream GET of the composed URL');assert.deepEqual(counts.refused,[]);
  const presentation=await read('/v1/artifacts/'+ready.body.record.revision);
  assert.equal(presentation.body.activities.find(a=>a.sourceUnitId===UNIT)?.execution?.focalAssetId,'a293','consumed: S03-U017 is placed on a293');
  await read('/v1/packs/'+PACK);await read(`/v1/packs/${PACK}?revision=${ready.body.record.revision}`);
  const again=await open();assert.equal(again.body.status,'ready');assert.equal(again.body.record.revision,ready.body.record.revision);
  assert.equal(counts.outbound,1,'warm: zero upstream calls (Q14)');
  console.log(JSON.stringify({receipt:'source-join-acquisition',jobId:ready.body.jobId,record:ready.body.record.revision,decisionEvidenceSha256:ready.body.record.execution.provenance.decisionEvidenceSha256,outbound:counts.outbound}));
 }finally{await mf.dispose();await rm(dir,{recursive:true,force:true});}
});
