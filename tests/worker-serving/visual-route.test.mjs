import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {buildGeneralizedSnapshot} from '../../server/fia/publication/generalized.mjs';
import {exportGuideSources} from '../../server/fia/compiler/presentation/export-guide-sources.mjs';
import {buildApprovedAudioProofIndex} from '../../scripts/approved-audio-proof-index.mjs';
import {VISUAL_FIRST_PROOF,VISUAL_RETRY_MIN_MS,visualConsumerIdentity,createVisualsPort,serveOriginalVisual} from '../../server/fia/preparation/visual-publication.mjs';
import {visualOriginalIdentity} from '../../server/fia/preparation/visual-original.mjs';
// The real packaged Worker (entry.mjs) with FiaPreparationJobs and FIA_ORIGINALS, end to end for English S02-U008:
// an admitted visualDemand (Auggie's F5a) routes through the capabilities.visuals port into the per-source visual-original@1
// object, which fetches once, decodes, and publishes for the exact execution revision; /v1/original-visuals serves the exact bytes.
// The publisher is the outbound service: by default the committed decoder fixtures stand in for the two originals; with
// FIA_VISUAL_ORIGINALS_DIR set to a folder holding the exact retained c4.png and a1400.jpg, those bytes are served instead.
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://dev.fiaguide.app',publicRoot='apps/web/public',packId='eng.MRK-1-14-20';
const sha=b=>createHash('sha256').update(b).digest('hex');
const REAL=process.env.FIA_VISUAL_ORIGINALS_DIR;
const fixture=n=>readFileSync(resolve('tests/preparation-executor/fixtures/visual/'+n));
const ORIGINALS={a1400:REAL?readFileSync(join(REAL,'a1400.jpg')):fixture('baseline-37x23.jpg'),c4:REAL?readFileSync(join(REAL,'c4.png')):fixture('rgb-31x17.png')};
const MIME={a1400:'image/jpeg',c4:'image/png'};
const entry=`import worker,{FiaPreparationJobs as Jobs} from ${JSON.stringify(resolve('server/faces/worker/entry.mjs'))};
export class FiaPreparationJobs extends Jobs{async fetch(request){const url=new URL(request.url);if(url.origin!=='https://route.test')return super.fetch(request);
 if(url.pathname==='/dump')return Response.json(Object.fromEntries(await this.ctx.storage.list()));
 const {key,value}=await request.json();if(value===null)await this.ctx.storage.delete(key);else await this.ctx.storage.put(key,value);return Response.json(true);}}
export default worker;`;
async function runtime(){
 const dir=await mkdtemp(join(tmpdir(),'fia-visual-route-')),authority=JSON.parse(await readFile('server/fia/publication/trusted-generalized.json')),extension=buildGeneralizedSnapshot(publicRoot,authority),canonicalSources=exportGuideSources({outputRoot:dir,sourceRevision:authority.sourceCommit});
 const proof=await buildApprovedAudioProofIndex({publicRoot,authority:{registrySha256:authority.catalog.sha256,sourceRevision:authority.sourceCommit}});
 const snapshot={schema:'fia.worker-read-snapshot.v1',records:extension.records,current:extension.current,staticArtifacts:extension.staticArtifacts,artifacts:[],canonicalSources,generalizedAuthority:extension.authority,approvedAudioProofIndex:proof.descriptor};
 const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'route-entry.mjs',loader:'js'},bundle:true,platform:'browser',format:'esm',external:['node:*'],write:false,plugins:[{name:'route-snapshot',setup(b){b.onResolve({filter:/generated\/snapshot\.json$/},()=>({path:'snapshot',namespace:'route'}));b.onLoad({filter:/.*/,namespace:'route'},()=>({contents:JSON.stringify(snapshot),loader:'json'}));}}]});
 const counts={publisher:{a1400:0,c4:0},other:0};
 const byUrl=new Map(VISUAL_FIRST_PROOF.map(e=>[e.source.url,e.assetId]));
 const mf=new Miniflare({...convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}},r2Buckets:['FIA_ORIGINALS'],
  serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname;let bytes;try{bytes=proof.descriptor.path===path?proof.bytes:await readFile((path.startsWith('/content/source-guides/')?dir:publicRoot)+path);}catch(error){if(error.code!=='ENOENT')throw error;return new Response('Not found',{status:404});}return new Response(bytes,{headers:{'Content-Type':'application/json','Content-Length':String(bytes.length)}});}},
  outboundService:async request=>{const id=byUrl.get(request.url);if(!id){counts.other++;throw Error('External work forbidden');}counts.publisher[id]++;const b=ORIGINALS[id];return new Response(b,{headers:{'content-type':MIME[id],'content-length':String(b.length)}});}}),resourcePersistencePath:join(dir,'storage')});
 return {mf,dir,counts};
}
const http=mf=>async(path,init)=>{const r=await mf.dispatchFetch(origin+path,init);const type=r.headers.get('content-type')??'';return {status:r.status,headers:r.headers,body:type.includes('json')?await r.json():new Uint8Array(await r.arrayBuffer())};};
const prepare=(read,demand)=>read('/v1/presentation-preparations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(demand)});
const door=async(mf,source)=>{const ns=await mf.getDurableObjectNamespace('FIA_PREPARATION_JOBS'),{name}=await visualOriginalIdentity(source),stub=ns.get(ns.idFromName(name));
 return {stub,dump:async()=>(await stub.fetch('https://route.test/dump')).json(),put:async(key,value)=>(await stub.fetch('https://route.test/put',{method:'POST',body:JSON.stringify({key,value})})).json()};};

test('the first-proof registry binds the retained base pack pin (Q19 coherence; the c4 048 re-bind is a Q14 refresh)',async()=>{
 const pack=JSON.parse(readFileSync(resolve(publicRoot,'content/packs/eng.MRK-1-14-20/92ad518474f159f6567124052ae12d180a482c949509da0b725593442e62f746.json'),'utf8'));
 for(const e of VISUAL_FIRST_PROOF){const asset=pack.assets[e.assetId];assert.equal(asset.kind,e.kind);assert.equal(asset.sourceEvidence.url,e.source.url);assert.equal(e.baseRevision,'92ad518474f159f6567124052ae12d180a482c949509da0b725593442e62f746');}
 const a=VISUAL_FIRST_PROOF.find(e=>e.assetId==='a1400').source,ae=pack.assets.a1400.sourceEvidence;
 assert.equal(a.sourceVersion,`FIAImages@${ae.titleProvenance.revision}:${ae.sourceFile}@${ae.sourceFileSha256}`);assert.equal(a.kind,'photo');assert.match(a.url,/\/media\/photos\//);
 const c=VISUAL_FIRST_PROOF.find(e=>e.assetId==='c4').source,ce=pack.assets.c4.sourceEvidence;
 assert.equal(c.kind,'map');assert.match(c.url,/\/media\/maps\//);
 assert.equal(c.sourceVersion,`FIAMaps@${ce.titleProvenance.revision}:${ce.sourceFile}@${ce.sourceFileSha256}`,'bound at the retained pack pin');
});

test('English S02-U008 end to end in the real Worker: admitted demand, original, publication, exact-byte read; typed refusals',async t=>{
 const {mf,dir,counts}=await runtime();t.after(async()=>{await mf.dispose();await rm(dir,{recursive:true,force:true});});
 const read=http(mf);
 const base=await read('/v1/packs/'+packId);const opened=await prepare(read,base.body.preparationDemand);assert.equal(opened.body.status,'ready',JSON.stringify(opened.body));
 const asking=await read('/v1/packs/'+packId+'?execution=2'),record=asking.body,resources=record.execution.visualResources;
 assert.deepEqual(resources.map(r=>[r.assetId,r.kind,r.status]),[['a1400','image','preparable'],['c4','map','preparable']]);
 for(const [i,assetId] of ['a1400','c4'].entries()){
  const entry=VISUAL_FIRST_PROOF.find(e=>e.assetId===assetId),bytes=ORIGINALS[assetId];
  const answer=await prepare(read,resources[i].preparationDemand);
  // F5a maps a decoded ready to blocked: visual-publication-unavailable until the declaration folds the publication in (F7a).
  assert.equal(answer.body.reason,'visual-publication-unavailable',JSON.stringify(answer.body));assert.equal(counts.publisher[assetId],1);
  const again=await prepare(read,resources[i].preparationDemand);assert.equal(again.body.reason,'visual-publication-unavailable');assert.equal(counts.publisher[assetId],1,'a repeat fetches nothing');
  const src=(await visualOriginalIdentity(entry.source)).sourceIdentitySha256,{consumerSha256}=await visualConsumerIdentity({packId,baseRevision:entry.baseRevision,executionRevision:record.revision,assetId,kind:entry.kind});
  const path=`/v1/original-visuals/${src}/${consumerSha256}/${sha(bytes)}`;
  const got=await read(path);assert.equal(got.status,200,JSON.stringify(got.body));assert.equal(sha(got.body),sha(bytes));assert.equal(got.body.length,bytes.length);
  assert.equal(got.headers.get('etag'),`"${sha(bytes)}"`);assert.equal(got.headers.get('content-type'),MIME[assetId]);assert.equal(got.headers.get('cache-control'),'private, no-cache');
  assert.equal((await read(path,{headers:{'If-None-Match':`"${sha(bytes)}"`}})).status,304);
  // Weak comparison (RFC 9110): a weak tag, a list containing the tag, and '*' all revalidate; another tag does not.
  for(const inm of [`W/"${sha(bytes)}"`,`"x", "${sha(bytes)}"`,'*'])assert.equal((await read(path,{headers:{'If-None-Match':inm}})).status,304,inm);
  assert.equal((await read(path,{headers:{'If-None-Match':'"other"'}})).status,200);
  const head=await mf.dispatchFetch(origin+path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(bytes.length));
  assert.equal((await read(path,{headers:{Range:'bytes=0-9'}})).body.reason,'range-not-supported');
  // Unpublished: another execution revision (or consumer) never published this original.
  const other=(await visualConsumerIdentity({packId,baseRevision:entry.baseRevision,executionRevision:'e'.repeat(64),assetId,kind:entry.kind})).consumerSha256;
  const unpublished=await read(`/v1/original-visuals/${src}/${other}/${sha(bytes)}`);assert.equal(unpublished.status,404);assert.equal(unpublished.body.reason,'visual-not-published');
  assert.equal((await read(`/v1/original-visuals/${src}/${consumerSha256}/${'0'.repeat(64)}`)).body.reason,'visual-not-published');
  assert.equal(counts.publisher[assetId],1,'reads fetch nothing');
 }
 // B1 (review 5693742032): a row for a revision that was never current is never served, even if one is written directly.
 {const a=VISUAL_FIRST_PROOF.find(e=>e.assetId==='a1400'),da=await door(mf,a.source),forged='e'.repeat(64);
  const pub=await (await da.stub.fetch('https://visual-original.internal/publish',{method:'POST',body:JSON.stringify({packId:a.packId,baseRevision:a.baseRevision,assetId:a.assetId,executionRevision:forged})})).json();
  assert.equal(pub.status,'ready','the internal operation itself records the row; serving is what the fence decides');
  const refused=await read(pub.ready.path);assert.equal(refused.status,410);assert.equal(refused.body.reason,'visual-publication-stale');assert.equal(refused.body.subReason,'execution-not-current');}
 // Review 5693896865 R1: HEAD refusals carry the same status as GET (no body to read on HEAD).
 {const a=VISUAL_FIRST_PROOF.find(e=>e.assetId==='a1400'),src=(await visualOriginalIdentity(a.source)).sourceIdentitySha256,bytes=ORIGINALS.a1400;
  const forged=(await visualConsumerIdentity({packId,baseRevision:a.baseRevision,executionRevision:'e'.repeat(64),assetId:'a1400',kind:'image'})).consumerSha256;
  const never=(await visualConsumerIdentity({packId,baseRevision:a.baseRevision,executionRevision:'9'.repeat(64),assetId:'a1400',kind:'image'})).consumerSha256;
  const current=(await visualConsumerIdentity({packId,baseRevision:a.baseRevision,executionRevision:record.revision,assetId:'a1400',kind:'image'})).consumerSha256;
  for(const [path,init,status] of [[`/v1/original-visuals/${src}/${forged}/${sha(bytes)}`,{},410],[`/v1/original-visuals/${src}/${never}/${sha(bytes)}`,{},404],[`/v1/original-visuals/${src}/${current}/${sha(bytes)}`,{headers:{Range:'bytes=0-9'}},416]]){
   const get=await mf.dispatchFetch(origin+path,init),head=await mf.dispatchFetch(origin+path,{...init,method:'HEAD'});await get.arrayBuffer();await head.arrayBuffer();
   assert.equal(get.status,status,path);assert.equal(head.status,status,'HEAD '+path);assert.equal(head.headers.get('cache-control'),'no-store');
  }}
 // Stale: a publication row from another recipe is never served. Tampered: changed retained bytes are never served.
 const c4=VISUAL_FIRST_PROOF.find(e=>e.assetId==='c4'),d=await door(mf,c4.source),rows=await d.dump(),key=Object.keys(rows).find(k=>k.startsWith('visual-publication:')),row=rows[key];
 const c4path=row.path;await d.put(key,{...row,recipeSha256:'f'.repeat(64)});
 const stale=await read(c4path);assert.equal(stale.status,410);assert.equal(stale.body.reason,'visual-publication-stale');await d.put(key,row);
 const bucket=await mf.getR2Bucket('FIA_ORIGINALS');await bucket.put(row.original.sourceKey,new Uint8Array(row.original.bytes).fill(9));
 const tampered=await read(c4path);assert.equal(tampered.status,409);assert.equal(tampered.body.reason,'visual-original-integrity');
 // The route is closed: unknown sources, extra queries, other methods and malformed paths are typed refusals.
 assert.equal((await read(`/v1/original-visuals/${'1'.repeat(64)}/${'2'.repeat(64)}/${'3'.repeat(64)}`)).body.reason,'unknown-visual');
 assert.equal((await read(c4path+'?x=1')).status,400);assert.equal((await read(c4path,{method:'POST'})).status,405);assert.equal((await read('/v1/original-visuals/abc')).status,404);
 assert.equal(counts.other,0,'no other external work');
});

test('published() is a pure read: a decoded-ready but unpublished original is visual-not-published, and nothing is written',async t=>{
 const {mf,dir,counts}=await runtime();t.after(async()=>{await mf.dispose();await rm(dir,{recursive:true,force:true});});
 const a=VISUAL_FIRST_PROOF.find(e=>e.assetId==='a1400'),d=await door(mf,a.source),executionRevision='a'.repeat(64);
 // Decode-ready through the object's own demand (no publication: only the port's demand publishes).
 const ready=await (await d.stub.fetch('https://visual-original.internal/demand',{method:'POST',body:JSON.stringify({packId:a.packId,baseRevision:a.baseRevision,assetId:a.assetId,retry:false})})).json();assert.equal(ready.state,'ready');
 const bucket=await mf.getR2Bucket('FIA_ORIGINALS'),objects=async()=>(await bucket.list()).objects.map(o=>o.key).sort();
 const rowsBefore=JSON.stringify(await d.dump()),objectsBefore=JSON.stringify(await objects()),fetchesBefore=counts.publisher.a1400;
 const read=await d.stub.fetch('https://visual-original.internal/published?'+new URLSearchParams({packId:a.packId,baseRevision:a.baseRevision,assetId:a.assetId,executionRevision}));
 assert.equal(read.status,404);assert.equal((await read.json()).reason,'visual-not-published');
 assert.equal(JSON.stringify(await d.dump()),rowsBefore,'no Durable Object row written');assert.equal(JSON.stringify(await objects()),objectsBefore,'no R2 object written');assert.equal(counts.publisher.a1400,fetchesBefore,'no fetch');
 assert.ok(!Object.keys(await d.dump()).some(k=>k.startsWith('visual-publication:')));
 // After a publish (the demand path), the same pure read returns the descriptor, still writing nothing.
 const pub=await (await d.stub.fetch('https://visual-original.internal/publish',{method:'POST',body:JSON.stringify({packId:a.packId,baseRevision:a.baseRevision,assetId:a.assetId,executionRevision})})).json();assert.equal(pub.status,'ready');
 const rowsAfterPublish=JSON.stringify(await d.dump());
 const again=await (await d.stub.fetch('https://visual-original.internal/published?'+new URLSearchParams({packId:a.packId,baseRevision:a.baseRevision,assetId:a.assetId,executionRevision}))).json();
 assert.equal(again.status,'ready');assert.deepEqual(again.manifestEntry,pub.manifestEntry);assert.equal(JSON.stringify(await d.dump()),rowsAfterPublish);
});
test('the port publishes only while executionRevision is the current pointer (checked before and after); the route types an older object',async()=>{
 const a=VISUAL_FIRST_PROOF.find(e=>e.assetId==='a1400'),calls=[];
 const fake=answer=>({FIA_ORIGINALS:{},FIA_PREPARATION_JOBS:{idFromName:n=>n,get:()=>({fetch:async request=>{const path=new URL(request.url).pathname;calls.push(path);return answer(path);}})}});
 const ok=path=>Response.json(path==='/demand'?{state:'ready'}:{status:'ready',ready:{path:'/p',sha256:'s'},manifestEntry:{path:'/p'}});
 const request={packId:a.packId,baseRevision:a.baseRevision,sourceRevision:'r',executionRevision:'a'.repeat(64),assetId:'a1400',kind:'image',retry:false};
 let pointer='b'.repeat(64);const port=createVisualsPort(fake(ok),{currentRevision:async()=>pointer});
 const stale=await port.demand(request);assert.equal(stale.state,'ready');assert.equal(stale.publication,null);assert.equal(stale.publicationRefused,'execution-revision-stale');assert.deepEqual(calls,['/demand'],'no publish for a non-current revision');
 calls.length=0;let reads=0;const moving=createVisualsPort(fake(ok),{currentRevision:async()=>++reads===1?request.executionRevision:pointer});
 const moved=await moving.demand(request);assert.equal(moved.publication,null);assert.equal(moved.publicationRefused,'execution-revision-stale');assert.deepEqual(calls,['/demand','/publish'],'a pointer that moves during the write leaves an inert row');
 calls.length=0;const current=createVisualsPort(fake(ok),{currentRevision:async()=>request.executionRevision});
 assert.deepEqual((await current.demand(request)).publication,{ready:{path:'/p',sha256:'s'},manifestEntry:{path:'/p'}});
 assert.equal(await createVisualsPort(fake(()=>Response.json({status:'unavailable',reason:'visual-not-published'},{status:404}))).published({packId:a.packId,baseRevision:a.baseRevision,executionRevision:'a'.repeat(64),assetId:'a1400'}),null);
 // The route: an older object's untyped 404 becomes a typed non-final refusal; a missing pointer is typed too.
 const src=(await visualOriginalIdentity(a.source)).sourceIdentitySha256,url=`https://dev.fiaguide.app/v1/original-visuals/${src}/${'c'.repeat(64)}/${'d'.repeat(64)}`;
 const old=fake(()=>Response.json({status:'unavailable',code:'unknown-preparation'},{status:404}));
 const skew=await serveOriginalVisual(new Request(url),old,{currentRevision:async()=>'a'.repeat(64)});assert.equal(skew.status,503);assert.deepEqual(await skew.json(),{status:'unavailable',reason:'interrupted',subReason:'visual-object-version-skew',final:false});
 const nopointer=await serveOriginalVisual(new Request(url),old,{currentRevision:async()=>null});assert.equal(nopointer.status,503);assert.equal((await nopointer.json()).subReason,'execution-pointer-unavailable');
});
test('Retry is accepted by the port and floored per source; an older object answers typed and non-final',async t=>{
 const {mf,dir,counts}=await runtime();t.after(async()=>{await mf.dispose();await rm(dir,{recursive:true,force:true});});
 const a=VISUAL_FIRST_PROOF.find(e=>e.assetId==='a1400'),d=await door(mf,a.source);
 const call=async retry=>(await d.stub.fetch('https://visual-original.internal/demand',{method:'POST',body:JSON.stringify({packId:a.packId,baseRevision:a.baseRevision,assetId:a.assetId,retry})})).json();
 const first=await call(true);assert.equal(first.state,'ready');assert.equal(first.retry,'opened');
 const soon=await call(true);assert.equal(soon.retry,'deferred',`a second Retry inside ${VISUAL_RETRY_MIN_MS} ms is a plain demand`);assert.equal(counts.publisher.a1400,1);
 // After the floor the next Retry opens again (the retained original still fetches nothing).
 await d.put('visual-original:last-retry',Date.now()-VISUAL_RETRY_MIN_MS-1000);const later=await call(true);assert.equal(later.retry,'opened');assert.equal(counts.publisher.a1400,1);
 // Custody: the a1400 entry is served only by its own object.
 const ns=await mf.getDurableObjectNamespace('FIA_PREPARATION_JOBS'),wrong=ns.get(ns.idFromName('some-other-object'));
 assert.equal((await (await wrong.fetch('https://visual-original.internal/demand',{method:'POST',body:JSON.stringify({packId:a.packId,baseRevision:a.baseRevision,assetId:a.assetId,retry:false})})).json()).reason,'visual-object-custody');
 // The port's request shape is closed, and an object still on the previous code (no visual namespace) is typed non-final.
 const old={FIA_ORIGINALS:{},FIA_PREPARATION_JOBS:{idFromName:n=>n,get:()=>({fetch:async()=>new Response(JSON.stringify({status:'unavailable',code:'unknown-preparation'}),{status:404})})}};
 const port=createVisualsPort(old),request={packId:a.packId,baseRevision:a.baseRevision,sourceRevision:'r',executionRevision:'a'.repeat(64),assetId:'a1400',kind:'image',retry:false};
 const skew=await port.demand(request);assert.equal(skew.state,'unavailable');assert.equal(skew.final,false);
 assert.equal((await port.demand({...request,extra:1})).reason,'execution-admission-refused');assert.equal((await port.demand({...request,kind:'map'})).reason,'visual-ineligible');
 assert.equal((await port.demand({...request,assetId:'a293'})).reason,'visual-ineligible');
});
