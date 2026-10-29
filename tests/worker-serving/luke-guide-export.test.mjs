import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {buildGeneralizedSnapshot} from '../../server/fia/publication/generalized.mjs';
import {exportGuideSources,SOURCE_ARCHIVE_SHA256,LUKE_SOURCE_ARCHIVE_SHA256} from '../../server/fia/compiler/presentation/export-guide-sources.mjs';
import {buildApprovedAudioProofIndex} from '../../scripts/approved-audio-proof-index.mjs';
import {createExecutionTransport} from '../../apps/web/src/lib/execution-transport.js';
import {selectServerPresentation} from '../../apps/web/src/lib/library.js';
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://dev.fiaguide.app',publicRoot='apps/web/public',REVISION='f8776d92b090b5af5b17b17dc1137f25fb059ed0',sha=b=>createHash('sha256').update(b).digest('hex');
const archive=name=>readFile(new URL(`../../server/fia/compiler/presentation/${name}`,import.meta.url));

test('the exporter pins both retained archives, keeps Mark byte-identical, and exports every Luke guide against source-bindings',async t=>{
 const [mark,luke]=await Promise.all([archive('source-packs.json.gz'),archive('source-packs-luk.json.gz')]);assert.equal(sha(mark),SOURCE_ARCHIVE_SHA256);assert.equal(sha(luke),LUKE_SOURCE_ARCHIVE_SHA256);
 const a=await mkdtemp(join(tmpdir(),'guide-export-mark-')),b=await mkdtemp(join(tmpdir(),'guide-export-all-'));t.after(()=>Promise.all([rm(a,{recursive:true,force:true}),rm(b,{recursive:true,force:true})]));
 const markOnly=exportGuideSources({outputRoot:a,sourceRevision:REVISION,archiveBytes:mark}),all=exportGuideSources({outputRoot:b,sourceRevision:REVISION});
 assert.equal(markOnly.length,136);assert.equal(all.length,330);assert.deepEqual(all.slice(0,136),markOnly,'Mark descriptors are unchanged and come first');
 for(const d of markOnly)assert.deepEqual(await readFile(join(b,d.staticPath)),await readFile(join(a,d.staticPath)),`${d.packId}: Mark bytes are identical`);
 const bindings=JSON.parse(await readFile(new URL('../../server/fia/compiler/presentation/source-bindings.json',import.meta.url)));
 const lukes=all.slice(136);assert.equal(lukes.length,194);assert.ok(lukes.every(d=>/^(eng|spa)\.LUK-/.test(d.packId)&&d.sourceRevision===REVISION&&bindings[d.packId].guide===d.sha256));
 for(const d of lukes){const bytes=await readFile(join(b,d.staticPath));assert.equal(bytes.length,d.bytes);assert.equal(sha(bytes),d.sha256);}
 assert.equal((await readdir(join(b,'content/source-guides'))).length,330);
});
test('the exporter fails closed before any write: wrong pins, wrong revision, duplicate packs, unbound guides',async t=>{
 const [mark,luke]=await Promise.all([archive('source-packs.json.gz'),archive('source-packs-luk.json.gz')]),dir=await mkdtemp(join(tmpdir(),'guide-export-refused-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const run=o=>()=>exportGuideSources({outputRoot:dir,sourceRevision:REVISION,...o});
 assert.throws(run({archives:[{sha256:SOURCE_ARCHIVE_SHA256,bytes:luke}]}),/canonical-source-archive-pin/,'Luke bytes under the Mark pin');
 assert.throws(run({archives:[{sha256:'0'.repeat(64),bytes:mark}]}),/canonical-source-archive-pin/,'an unpinned archive');
 assert.throws(run({archiveBytes:luke}),/canonical-source-archive-pin/,'the earlier one-archive interface stays Mark-pinned');
 assert.throws(()=>exportGuideSources({outputRoot:dir,sourceRevision:'0'.repeat(40)}),/canonical-source-revision/);
 assert.throws(run({archives:[{sha256:SOURCE_ARCHIVE_SHA256,bytes:mark},{sha256:SOURCE_ARCHIVE_SHA256,bytes:mark}]}),/canonical-source-duplicate-pack/);
 const bindings=JSON.parse(await readFile(new URL('../../server/fia/compiler/presentation/source-bindings.json',import.meta.url)));
 assert.throws(run({sourceBindings:{...bindings,'spa.LUK-1-1-4':{...bindings['spa.LUK-1-1-4'],guide:'0'.repeat(64)}}}),/canonical-source-guide-pin/);
 assert.deepEqual(await readdir(dir),[],'nothing is written when any check fails');
});
// Behaviour change (Auggie's condition): with Luke in canonicalSources, an explicit Open of a Luke pack prepares and opens an
// executable presentation instead of staying on the base passage. Luke has no trusted rows or guideSources, so it gets no
// decisions or visuals. The plain read keeps its base shape.
const entry=`import worker,{FiaPreparationJobs} from ${JSON.stringify(resolve('server/faces/worker/entry.mjs'))};export {FiaPreparationJobs};export default worker;`;
test('an explicit Open of one English and one Spanish Luke pack prepares a ready executable record through selectServerPresentation; the plain read keeps its base shape',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'luke-open-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const authority=JSON.parse(await readFile('server/fia/publication/trusted-generalized.json')),extension=buildGeneralizedSnapshot(publicRoot,authority),canonicalSources=exportGuideSources({outputRoot:dir,sourceRevision:authority.sourceCommit});
 const proof=await buildApprovedAudioProofIndex({publicRoot,authority:{registrySha256:authority.catalog.sha256,sourceRevision:authority.sourceCommit}});
 const snapshot={schema:'fia.worker-read-snapshot.v1',records:extension.records,current:extension.current,staticArtifacts:extension.staticArtifacts,artifacts:[],canonicalSources,generalizedAuthority:extension.authority,approvedAudioProofIndex:proof.descriptor};
 const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'luke-entry.mjs',loader:'js'},bundle:true,platform:'browser',format:'esm',external:['node:*'],write:false,plugins:[{name:'luke-snapshot',setup(b){b.onResolve({filter:/generated\/snapshot\.json$/},()=>({path:'snapshot',namespace:'luke'}));b.onLoad({filter:/.*/,namespace:'luke'},()=>({contents:JSON.stringify(snapshot),loader:'json'}));}}]});
 let external=0;
 const mf=new Miniflare({...convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}},r2Buckets:['FIA_ORIGINALS'],
  serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname;assert.ok(/^\/content\/[a-zA-Z0-9._/-]+$/.test(path)&&!path.includes('..'),path);let bytes;try{bytes=path===proof.descriptor.path?proof.bytes:await readFile((path.startsWith('/content/source-guides/')?dir:publicRoot)+path);}catch(error){if(error.code!=='ENOENT')throw error;return new Response('Not found',{status:404});}return new Response(bytes,{headers:{'Content-Type':'application/json','Content-Length':String(bytes.length)}});}},
  outboundService:()=>{external++;throw Error('External work forbidden');}}),resourcePersistencePath:join(dir,'storage')});
 t.after(()=>mf.dispose());
 const read=async path=>{const r=await mf.dispatchFetch(origin+path);return {status:r.status,body:await r.json()};};
 const transport=createExecutionTransport({fetch:(url,init={})=>mf.dispatchFetch(origin+url,{method:init.method,headers:init.headers,body:init.body})});
 for(const packId of ['eng.LUK-1-1-4','spa.LUK-1-1-4']){
  const base=await read('/v1/packs/'+packId);assert.equal(base.status,200,JSON.stringify(base.body));assert.equal(base.body.status,'ready');assert.equal(base.body.execution,undefined,'the plain read is the base shape');assert.ok(base.body.preparationDemand,`${packId} is preparable now that its guide record is exported`);
  const restored=await selectServerPresentation(packId,{transport});assert.equal(restored.descriptor.revision,base.body.revision);assert.equal(restored.presentation.execution,undefined,'a quiet restore keeps the base');
  let opened;try{opened=await selectServerPresentation(packId,{explicit:true,transport});}catch(error){assert.fail(`${packId}: the explicit Open must not fail (${error?.message})`);}
  assert.notEqual(opened.descriptor.revision,base.body.revision);assert.ok(opened.presentation.execution,'an executable presentation');
  const current=await read('/v1/packs/'+packId);assert.equal(current.status,200);assert.equal(current.body.revision,opened.descriptor.revision);assert.equal(current.body.execution.schema,'fia-executable-catalog@1');
  const focal=p=>p.activities.flatMap(a=>[a.assetId,...(a.relatedAssetIds??[])]).filter(Boolean).sort();
  assert.deepEqual([...new Set(focal(opened.presentation))],[...new Set(focal(restored.presentation))],`${packId}: no visual is added beyond the base (Luke has no trusted or guideSources rows, so no decisions)`);
  assert.ok(!opened.presentation.activities.some(a=>/-resource-/.test(a.id)),`${packId}: no derived resource steps`);
 }
 assert.equal(external,0,'no external work');
});
