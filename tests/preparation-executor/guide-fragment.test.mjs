import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdtemp,rm} from 'node:fs/promises';import {readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {createFreshSourceObservations,createProfileJsonPort,JSON_CONTENT,AUDIO_CONTENT,VISUAL_CONTENT} from '../../server/fia/preparation/executor/fresh-source-observation.mjs';
import {guideFragmentIdentity,GUIDE_FRAGMENT_POLICY,GUIDE_ACQUISITION_PROFILE,GUIDE_REPOSITORY} from '../../server/fia/preparation/guide-fragment.mjs';
import {createGuideComposer} from '../../server/fia/preparation/source-associations/composer.mjs';
import {createArchiveGuideComposer} from '../preparation/support/archive-guide-composer.mjs';
import {buildSourceIndex,associatePack,verifyDecision} from '../../server/fia/preparation/source-associations/index.mjs';
import {readRetainedArchives} from '../../server/fia/preparation/source-associations/retained.mjs';
import {canonicalJSONString} from '../../server/fia/preparation/contract.mjs';
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{build}=require('esbuild');
const sha=x=>createHash('sha256').update(x).digest('hex');
const archives=readRetainedArchives(),BINDINGS=JSON.parse(readFileSync(new URL('../../server/fia/compiler/presentation/source-bindings.json',import.meta.url)));
const LUKE='spa.LUK-1-1-4',PATH='spa/json/42.content.json',REV96='96bb023ab1852ab8bdc3a469fcc820e9f9ea1e30';
// Served test bytes, committed fixtures only: a minimized guide-file shape around the 96bb dev-time public-read paragraph that PR290
// retains as a labelled fixture, plus synthetic articles and paragraphs. The test fetcher serves them; nothing is fetched live.
const FIX=JSON.parse(readFileSync(new URL('../preparation/fixtures/source-associations/spa-luk-1-1-4-s05-u003.raw-fragment.json',import.meta.url)));
const article=(id,s,e,content,extra={})=>({content_id:id,reference_id:0,version:'1.0.4',title:id,media_type:'Text',language:'spa',associations:{passage:[{start_ref_usfm:s,end_ref_usfm:e}],resource:[]},content,...extra});
const fileOf=(fragment=FIX.fragment)=>Buffer.from(JSON.stringify([article('spa-luk-p1-v1.1','LUK 1:1','LUK 1:4','<p>Synthetic opening paragraph.</p>'+fragment+'<p>Synthetic closing paragraph.</p>'),article('spa-luk-p1-v1.1-audio','LUK 1:1','LUK 1:4','',{media_type:'Audio'}),article('spa-luk-p31-v1','LUK 7:36','LUK 8:3','<p>Synthetic cross-chapter.</p>')]));
const FILE=fileOf();
// TEST-LABELLED archive and bindings (Q14): the retained spa.LUK-1-1-4 record with its descriptor pinned to the served bytes at
// the given revision, and bindings re-derived for that record. Production uses the retained archive and bindings unchanged.
function labelledArchive({revision=REV96,fileSha256=sha(FILE)}={}){const a=archives.find(x=>x.packs[LUKE]),pack=structuredClone(a.packs[LUKE]);pack.guide.provenance.revision=revision;pack.guide.sourceFileSha256=fileSha256;
 return {archives:[{revision:a.revision,inventory:a.inventory.filter(f=>f.path.startsWith(`data/packs/${LUKE}/`)),packs:{[LUKE]:pack}}],sourceBindings:{[LUKE]:{guide:sha(Buffer.from(JSON.stringify(pack.guide)))}}};}
const modulePath=fileURLToPath(new URL('../../server/fia/preparation/guide-fragment.mjs',import.meta.url)),composerPath=fileURLToPath(new URL('../preparation/support/archive-guide-composer.mjs',import.meta.url)),productionComposerPath=fileURLToPath(new URL('../../server/fia/preparation/source-associations/composer.mjs',import.meta.url)),indexPath=fileURLToPath(new URL('../../server/fia/preparation/source-associations/index.mjs',import.meta.url));
const worker=`import {createGuideFragmentJob} from ${JSON.stringify(modulePath)};import {createArchiveGuideComposer} from ${JSON.stringify(composerPath)};import {createGuideComposer} from ${JSON.stringify(productionComposerPath)};import {buildSourceIndex,associatePack,verifyDecision} from ${JSON.stringify(indexPath)};
const b64=b=>Uint8Array.from(atob(b),c=>c.charCodeAt(0)),enc=u=>{let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode(...u.subarray(i,i+32768));return btoa(s);};
export class Job {constructor(ctx,env){this.ctx=ctx;this.env=env;this.gets=0;this.urls=[];this.gates=[];}
 async fetch(request){const args=await request.json();if(args.op==='counts')return Response.json({gets:this.gets,urls:this.urls,waiting:this.gates.length});if(args.op==='release'){for(const r of this.gates.splice(0))r();return Response.json({});}
  if(args.op==='corrupt'){const list=(await this.env.ORIGINALS.list({prefix:'originals/json/sha256/'})).objects;for(const o of list){const b=new Uint8Array(await (await this.env.ORIGINALS.get(o.key)).arrayBuffer());b[b.length-3]^=1;await this.env.ORIGINALS.put(o.key,b);}return Response.json({corrupted:list.length});}
  const job=createGuideFragmentJob({storage:this.ctx.storage,bucket:this.env.ORIGINALS,eligibility:()=>!args.ineligible,now:()=>1000,fetchSource:async(url,options)=>{this.gets++;this.urls.push(url);if(options.redirect!=='manual')throw Error('wrong-redirect');if(args.gate)await new Promise(r=>this.gates.push(r));
   if(args.httpStatus)return new Response('no',{status:args.httpStatus,headers:{'content-type':'text/plain','content-length':'2'}});
   const bytes=b64(args.body),headers={'content-length':String(args.length??bytes.length)};if(!args.noType)headers['content-type']=args.mime||'application/json; charset=utf-8';return new Response(bytes,{status:200,headers});}});
  // flow: the composer and index run inside the guide object (as production will), so the producer read() and the receipt are genuine.
  // Each step composes against one archive and indexes the receipts gathered so far against another; decisions are returned as data.
  if(args.op==='flow'){const out=[],receipts=[];let first=null;for(const step of args.steps){const composer=step.compose.canonical?createGuideComposer({snapshot:{canonicalSources:step.compose.canonical.sources},fetchAsset:async path=>{const b=step.compose.canonical.assets[path];if(!b)return new Response('missing',{status:404});const u=b64(b);return new Response(u,{status:200,headers:{'content-type':'application/json','content-length':String(u.length)}});},producer:job}):createArchiveGuideComposer({archives:step.compose.archives,sourceBindings:step.compose.sourceBindings,producer:job});const c=await composer.compose(step.packId);if(c.receipt)receipts.push(c.receipt);
    const use=step.use==='all'?receipts:step.use==='first'?receipts.slice(0,1):step.use==='last'?receipts.slice(-1):[];const ix=buildSourceIndex(step.index.archives,{raw:use}),d=associatePack(ix,step.packId);const at=d.filter(x=>x.unitId===step.unitId);
    out.push({composed:{state:c.state,reason:c.reason??null,descriptor:c.descriptor??null,receipt:c.receipt?{revision:c.receipt.revision,fileSha256:c.receipt.fileSha256,contentType:c.receipt.contentType}:null},decisions:at,s02Explicit:d.some(x=>x.stepId==='S02'&&x.type==='explicit'),rawInvalid:ix.packs[step.packId]?.raw?.invalid??null,verifyFirst:first?verifyDecision(first,ix):null});if(!first&&at[0]?.type==='explicit')first=at[0];}
   return Response.json({steps:out,gets:this.gets});}
  try{const source=args.source;if(args.op==='file'){const r=await job.retainedGuideFile(source);return Response.json({result:{...r,bytes:r.bytes?enc(r.bytes):undefined},gets:this.gets});}
   const result=await job.demand({...source,...(args.retry?{retry:true}:{})});return Response.json({result,gets:this.gets,objects:(await this.env.ORIGINALS.list()).objects.map(o=>o.key),rows:[...(await this.ctx.storage.list()).keys()]});}catch(error){return Response.json({error:error.message,gets:this.gets});}}
}
export default {fetch(request,env){const name=new URL(request.url).pathname.slice(1);return env.JOBS.get(env.JOBS.idFromName(decodeURIComponent(name))).fetch(request);}};`;
const bundle=await build({stdin:{contents:worker,resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',external:['node:crypto'],write:false});
async function fixture(t){const directory=await mkdtemp(join(tmpdir(),'guide-fragment-'));const mf=new Miniflare({...convertV4MiniflareOptions({name:'guide-fragment-fixture',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],durableObjects:{JOBS:{className:'Job',useSQLite:true}},r2Buckets:['ORIGINALS']}),resourcePersistencePath:directory});t.after(async()=>{await mf.dispose();await rm(directory,{recursive:true,force:true});});return mf;}
// One Durable Object per source identity, as guideFragmentObject addresses it in production.
async function call(mf,source,args={}){let name='invalid-source';try{name=(await guideFragmentIdentity({repo:source.repo,revision:source.revision,path:source.path})).name;}catch{}return mf.dispatchFetch(`https://fixture.invalid/${encodeURIComponent(name)}`,{method:'POST',body:JSON.stringify({source,body:FILE.toString('base64'),...args})}).then(r=>r.json());}
// The composer's producer, over the Miniflare job; serve(source) chooses the bytes the test publisher returns for that source.
function producerOver(mf,serve=()=>FILE){return {demand:async source=>(await call(mf,source,{body:serve(source).toString('base64')})).result,retainedGuideFile:async source=>{const r=(await call(mf,source,{op:'file'})).result;return r.bytes?{...r,bytes:new Uint8Array(Buffer.from(r.bytes,'base64'))}:r;}};}
const SOURCE96={repo:GUIDE_REPOSITORY,revision:REV96,path:PATH,expectedSha256:sha(FILE)};

test('JSON port: application/json only, a leading [, and a whole top-level array before any byte reaches quarantine; other ports unchanged',async()=>{
 async function run(mime,body){const rows=new Map(),objects=new Map(),written=[];const storage={get:async k=>structuredClone(rows.get(k)),async transaction(fn){return fn({get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v))});}};
  const bucket={get:async key=>{const b=objects.get(key);return b?{size:b.length,body:new Blob([b]).stream()}:null;},put:async(key,b)=>{const bytes=b instanceof Uint8Array?b.slice():new Uint8Array(await new Response(b).arrayBuffer());if(!objects.has(key))objects.set(key,bytes);return {};}};
  const bytes=Buffer.from(body),task=createFreshSourceObservations({storage,bucket,content:JSON_CONTENT,source:{logicalId:'l',url:'https://raw.githubusercontent.com/x/y/z.json',sourceVersionKind:'discovery-snapshot',sourceVersion:'v',publisherVersion:null},policy:{revision:'p',maxBytes:1024,totalMs:1000,progressMs:100},admissions:[{checkId:'c',sequence:1,expectedPreviousObservationSha256:null,previousSourceSha256:null}],eligibility:()=>true,
   makeStream:()=>new TransformStream({transform(c,ctl){written.push(c.length);ctl.enqueue(c);}}),fetchSource:async()=>new Response(new ReadableStream({start(c){for(let n=0;n<bytes.length;n+=3)c.enqueue(new Uint8Array(bytes.subarray(n,n+3)));c.close();}}),{headers:{'content-type':mime,'content-length':String(bytes.length)}})});
  try{await task.observe('c');const head=await task.read();return {ok:head.observation,written:written.reduce((a,b)=>a+b,0)};}catch(e){return {error:e.message,written:written.reduce((a,b)=>a+b,0)};}}
 const good=await run('application/json','[{"a":1},"é"]');assert.equal(good.ok.contentType,'application/json');assert.equal(good.ok.sourceKey,`originals/json/sha256/${sha('[{"a":1},"é"]')}.json`);assert.equal(good.written,Buffer.byteLength('[{"a":1},"é"]'));
 for(const [mime,body,reason] of [['application/json','{"a":1}','fresh-signature-mismatch'],['application/json','[1,2','fresh-shape-mismatch'],['application/json','[1] [2]','fresh-shape-mismatch'],['text/plain','[1]','fresh-media-refused'],['application/json',' [1]','fresh-signature-mismatch']]){const r=await run(mime,body);assert.equal(r.error,reason,`${mime} ${body}`);assert.equal(r.written,0,'nothing reaches quarantine');}
 const invalid=await run('application/json',Buffer.from([0x5b,0xff,0x5d]));assert.equal(invalid.error,'fresh-shape-mismatch');assert.equal(invalid.written,0);
 assert.equal(AUDIO_CONTENT.buffered,undefined);assert.equal(VISUAL_CONTENT.buffered,undefined);
});
test('the acquisition profile is a versioned constant hashed into the recipe identity; source policy is class-A only',async()=>{
 assert.equal(GUIDE_FRAGMENT_POLICY.revision,`fia-guide-fragment@1:profile:${sha(canonicalJSONString(GUIDE_ACQUISITION_PROFILE))}`);assert.equal(GUIDE_FRAGMENT_POLICY.revision,'fia-guide-fragment@1:profile:494394679aed913fe95a07418b80846cdd076a3287b1f60e934e45617abb6635');assert.ok(Object.isFrozen(GUIDE_ACQUISITION_PROFILE));
 assert.ok(GUIDE_FRAGMENT_POLICY.maxBytes>=2623571&&GUIDE_FRAGMENT_POLICY.maxBytes<=16777216);
 const id=await guideFragmentIdentity({repo:GUIDE_REPOSITORY,revision:REV96,path:PATH});assert.match(id.name,/^guide-fragment@1:[a-f0-9]{64}$/);assert.equal(id.url,`https://raw.githubusercontent.com/${GUIDE_REPOSITORY}/${REV96}/${PATH}`);
 for(const bad of [{repo:'evil/FIATranslationGuide'},{repo:'BibleAquifer/OtherGuide'},{revision:'main'},{revision:REV96.slice(0,12)},{path:'spa/json/42.content.json?x=1'},{path:'../secrets.json'},{extra:1}])await assert.rejects(guideFragmentIdentity({repo:GUIDE_REPOSITORY,revision:REV96,path:PATH,...bad}),/guide-source/);
});
// The real retained one-pack archive for spa.LUK-1-1-4 (descriptor eb744452 / b6de7d69) with its retained binding, unmodified.
function realArchive(){const a=archives.find(x=>x.packs[LUKE]);return {archives:[{revision:a.revision,inventory:a.inventory.filter(f=>f.path.startsWith(`data/packs/${LUKE}/`)),packs:{[LUKE]:a.packs[LUKE]}}],sourceBindings:{[LUKE]:BINDINGS[LUKE]}};}
// One flow runs in one object; a different source identity gets its own object, as guideFragmentObject addresses it in production.
const flow=(mf,steps,{body=FILE,object='flow',mime}={})=>mf.dispatchFetch(`https://fixture.invalid/${object}`,{method:'POST',body:JSON.stringify({op:'flow',body:body.toString('base64'),...(mime?{mime}:{}),steps:steps.map(x=>({packId:LUKE,unitId:'S05-U003',...x}))})}).then(r=>r.json());
test('(a) spa.LUK-1-1-4 S05-U003 runs end to end through producer, composer and index, and is explicit only under the test-labelled 96bb descriptor',async t=>{
 const mf=await fixture(t),labelled=labelledArchive(),r=await flow(mf,[{compose:labelled,index:labelled,use:'all'},{compose:labelled,index:labelled,use:'all'}]),[a,again]=r.steps;
 assert.equal(a.composed.state,'composed',JSON.stringify(a.composed));assert.deepEqual(a.composed.descriptor,{owner:'BibleAquifer',collection:'FIATranslationGuide',revision:REV96,path:PATH,fileSha256:sha(FILE)});assert.deepEqual(a.composed.receipt,{revision:REV96,fileSha256:sha(FILE),contentType:'application/json'});
 const [d]=a.decisions;assert.equal(d.type,'explicit',JSON.stringify(d));assert.deepEqual([d.namespace,d.resourceId],['FIAKeyTerms','spa-t55-v1']);assert.equal(d.evidence.rawFragmentSha256,FIX.provenance.fragmentSha256);assert.equal(d.evidence.rawJsonPath,'$[0].content#p1');
 assert.equal(a.s02Explicit,false);assert.equal(again.composed.state,'composed');assert.equal(r.gets,1,'one fetch for the whole flow; a repeat composes from the retained file');
});
test('(b) the same join against the real retained eb744452 descriptor is refused descriptor-mismatch',async t=>{
 const mf=await fixture(t),labelled=labelledArchive(),real=realArchive(),[cross]=(await flow(mf,[{compose:labelled,index:real,use:'all'}],{object:'flow-96bb'})).steps,[direct]=(await flow(mf,[{compose:real,index:real,use:'last'}],{object:'flow-eb74'})).steps;
 assert.equal(cross.composed.state,'composed');assert.equal(cross.rawInvalid,'raw-descriptor-mismatch');assert.equal(cross.decisions[0].reason,'raw-provenance-invalid','the 96bb receipt against the retained eb744452 / b6de7d69 descriptor');
 assert.deepEqual([direct.composed.descriptor.revision,direct.composed.descriptor.fileSha256],['eb744452eb8d7c852caadde9d3181cddfe571119','b6de7d69975c25a50226122a531148bdad3fdeec3efae4f46bc4b1ef409ec5f7']);
 assert.equal(direct.composed.state,'unavailable');assert.equal(direct.composed.reason,'guide-sha-mismatch','the served bytes do not match the archive sha, so nothing is promoted or branded');assert.equal(direct.decisions[0].reason,'raw-provenance-unavailable');
 const c=createArchiveGuideComposer({archives,sourceBindings:BINDINGS,producer:{demand:async()=>({}),retainedGuideFile:async()=>({})}});assert.equal((await c.descriptorFor('spa.LUK-0-0-0')).refused,'composer-unknown-pack');
 assert.equal((await createArchiveGuideComposer({archives,sourceBindings:{...BINDINGS,[LUKE]:{guide:'0'.repeat(64)}},producer:{demand:async()=>({}),retainedGuideFile:async()=>({})}}).descriptorFor(LUKE)).refused,'composer-binding-mismatch','the archive record must match source-bindings');
});
test('(b2) the composer refuses a producer file that differs from its own descriptor (descriptor-mismatch branch, PR293 review N4)',async()=>{
 const {fakeObservedRead}=await import('../preparation/support/fake-guide-producer.mjs');const labelled=labelledArchive();
 // A faulty producer that answers the requested source with a genuine read of another revision.
 const read=await fakeObservedRead({bytes:new Uint8Array(FILE),revision:'8'.repeat(40),path:PATH}),producer={demand:async()=>({state:'retained'}),retainedGuideFile:async()=>({state:'retained',read,bytes:new Uint8Array(FILE)})};
 const out=await createArchiveGuideComposer({...labelled,producer}).compose(LUKE);assert.equal(out.state,'unavailable');assert.equal(out.reason,'descriptor-mismatch');assert.equal(out.receipt,undefined);
});
test('(c) a source-version change invalidates the prior receipt: stale or refused, never the old explicit',async t=>{
 const REV2='7'.repeat(40),first=labelledArchive(),second=labelledArchive({revision:REV2}),third=labelledArchive({fileSha256:sha(Buffer.from('[]'))});
 const mf=await fixture(t),r=await flow(mf,[{compose:first,index:first,use:'all'},{compose:first,index:second,use:'first'},{compose:first,index:third,use:'first'},{compose:third,index:third,use:'last'}]),[old,newVersion,newSha,recompose]=r.steps;
 assert.equal(old.decisions[0].type,'explicit');
 assert.equal(newVersion.rawInvalid,'raw-descriptor-mismatch','a new publisher version: the old receipt no longer matches');assert.ok(!newVersion.decisions.some(x=>x.type==='explicit'));assert.equal(newVersion.verifyFirst.reason,'revision-drift','the old explicit decision is stale');
 assert.equal(newSha.rawInvalid,'raw-descriptor-mismatch','a new file sha at the same revision');assert.ok(!newSha.decisions.some(x=>x.type==='explicit'));assert.notEqual(newSha.verifyFirst.type,'verified');
 assert.equal(recompose.composed.state,'unavailable');assert.equal(recompose.composed.reason,'guide-sha-mismatch','the retained file is refused for the new expectation; no receipt is branded');
});
test('(d) a shaped look-alike of a producer read() is refused by the issuer, and a receipt never crosses an object boundary',async t=>{
 const mf=await fixture(t);await call(mf,SOURCE96);const file=(await call(mf,SOURCE96,{op:'file'})).result;assert.equal(file.state,'retained');
 const {issueProducerReceipt}=await import('../../server/fia/preparation/source-associations/producer-receipt.mjs');const bytes=new Uint8Array(Buffer.from(file.bytes,'base64'));
 assert.throws(()=>issueProducerReceipt(file.read,bytes),/producer-receipt-unverified-read/,'a serialized copy of a genuine read is a look-alike');
 assert.throws(()=>issueProducerReceipt({...file.read,observationSha256:'0'.repeat(64)},bytes),/producer-receipt-unverified-read/);
 const composed=await createArchiveGuideComposer({...labelledArchive(),producer:producerOver(mf)}).compose(LUKE);assert.equal(composed.state,'unavailable');assert.equal(composed.reason,'composer-receipt-refused');assert.equal(composed.subReason,'producer-receipt-unverified-read');
});
test('producer: tampered served bytes are never promoted or exposed; a deliberate Retry with the true bytes retains them',async t=>{
 const mf=await fixture(t),tampered=Buffer.from(FILE.toString().replace('Galilea<','Judea<'));
 const refused=await call(mf,SOURCE96,{body:tampered.toString('base64')});assert.equal(refused.result.reason,'guide-sha-mismatch',JSON.stringify(refused.result));assert.equal(refused.result.final,false);
 assert.equal((await call(mf,SOURCE96,{op:'file'})).result.state,'unavailable');
 const plain=await call(mf,SOURCE96);assert.equal(plain.gets,1,'no automatic refetch');
 const retried=await call(mf,SOURCE96,{retry:true});assert.equal(retried.gets,2);assert.equal(retried.result.state,'retained');assert.equal(retried.result.file.sha256,sha(FILE));
});
test('producer fails closed with types: corrupt retained bytes, wrong MIME, bad shape, missing expected sha, source policy, ineligible',async t=>{
 const mf=await fixture(t);await call(mf,SOURCE96);assert.equal((await call(mf,SOURCE96,{op:'corrupt'})).corrupted,1);
 const r=(await call(mf,SOURCE96,{op:'file'})).result;assert.equal(r.state,'unavailable');assert.equal(r.reason,'retained-evidence-unavailable');
 const mime=await call(await fixture(t),SOURCE96,{mime:'text/html'});assert.equal(mime.result.subReason,'fresh-media-refused');
 const shape=await call(await fixture(t),{...SOURCE96,expectedSha256:sha('[1,')},{body:Buffer.from('[1,').toString('base64')});assert.equal(shape.result.subReason,'fresh-shape-mismatch');assert.ok(!shape.objects.some(k=>k.startsWith('originals/json/sha256/')));
 const m4=await fixture(t);
 const noSha=await call(m4,{repo:GUIDE_REPOSITORY,revision:REV96,path:PATH});assert.equal(noSha.result.subReason,'guide-expected-sha256');assert.equal(noSha.gets,0);assert.deepEqual(noSha.rows,[]);
 const pol=await call(m4,{...SOURCE96,repo:'evil/FIATranslationGuide'});assert.equal(pol.result.subReason,'guide-source');assert.equal(pol.gets,0);
 const inel=await call(m4,SOURCE96,{ineligible:true});assert.equal(inel.result.reason,'guide-ineligible');assert.equal(inel.gets,0);assert.deepEqual(inel.rows,[]);
});
test('producer: concurrent demands coalesce; a transient 503 is interrupted and a Retry retains',async t=>{
 const mf=await fixture(t),first=call(mf,SOURCE96,{gate:true});for(let n=0;n<200&&(await call(mf,SOURCE96,{op:'counts'})).waiting<1;n++)await new Promise(r=>setTimeout(r,5));
 const joined=await call(mf,SOURCE96,{gate:true});assert.equal(joined.result.state,'preparing');assert.equal(joined.gets,1);await call(mf,SOURCE96,{op:'release'});assert.equal((await first).result.state,'retained');
 const m2=await fixture(t),down=await call(m2,SOURCE96,{httpStatus:503});assert.equal(down.result.reason,'interrupted');assert.equal(down.result.final,false);
 const retried=await call(m2,SOURCE96,{retry:true});assert.equal(retried.gets,2);assert.equal(retried.result.state,'retained');
 assert.deepEqual([...new Set((await call(m2,SOURCE96,{op:'counts'})).urls)],[`https://raw.githubusercontent.com/${GUIDE_REPOSITORY}/${REV96}/${PATH}`]);
});

// Terry ANSWER-Q24-PUBLISHER-MIME (cookbook 95c7213): text/plain only on the profile's strict path.
test('MIME 1. text/plain with the exact expected bytes is accepted and promoted; the receipt records contentType text/plain; the join is explicit',async t=>{
 const mf=await fixture(t),r=await call(mf,SOURCE96,{mime:'text/plain; charset=utf-8'});assert.equal(r.result.state,'retained',JSON.stringify(r.result));assert.equal(r.result.file.contentType,'text/plain');
 const f=(await call(mf,SOURCE96,{op:'file'})).result;assert.equal(f.read.observation.contentType,'text/plain');assert.equal(f.read.observation.sourceKey,`originals/json/sha256/${sha(FILE)}.json`);
 const labelled=labelledArchive(),[a]=(await flow(await fixture(t),[{compose:labelled,index:labelled,use:'all'}],{mime:'text/plain'})).steps;
 assert.equal(a.composed.receipt.contentType,'text/plain');assert.equal(a.decisions[0].type,'explicit');
});
test('MIME 2. text/plain with a non-array, invalid UTF-8, a trailing document or a length mismatch is refused before quarantine',async t=>{
 for(const [why,body,extra,reason] of [['non-array',Buffer.from('{"a":1}'),{},'fresh-signature-mismatch'],['object after [',Buffer.from('["a"'),{},'fresh-shape-mismatch'],['invalid UTF-8',Buffer.from([0x5b,0x22,0xff,0x22,0x5d]),{},'fresh-shape-mismatch'],['trailing document',Buffer.from('[1] [2]'),{},'fresh-shape-mismatch'],['declared longer',FILE,{length:FILE.length+1},'fresh-byte-length'],['declared shorter',FILE,{length:FILE.length-1},'fresh-byte-limit']]){
  const mf=await fixture(t),out=await call(mf,{...SOURCE96,expectedSha256:sha(body)},{body:body.toString('base64'),mime:'text/plain',...extra});
  assert.equal(out.result.state,'unavailable',why);assert.equal(out.result.subReason,reason,why);assert.deepEqual(out.objects,[],`${why}: nothing reaches quarantine`);}
});
test('MIME 3. text/plain with a sha mismatch is not promoted and yields no receipt',async t=>{
 const other=fileOf(FIX.fragment.replace('Galilea<','Judea<')),mf=await fixture(t);
 const r=await call(mf,SOURCE96,{body:other.toString('base64'),mime:'text/plain'});assert.equal(r.result.reason,'guide-sha-mismatch');
 assert.equal((await call(mf,SOURCE96,{op:'file'})).result.state,'unavailable');
 const labelled=labelledArchive(),[a]=(await flow(await fixture(t),[{compose:labelled,index:labelled,use:'all'}],{body:other,mime:'text/plain'})).steps;assert.equal(a.composed.state,'unavailable');assert.equal(a.composed.receipt,null);assert.notEqual(a.decisions[0].type,'explicit');
});
test('MIME 4. text/html, application/octet-stream and a missing type are unsupported (media)',async t=>{
 for(const extra of [{mime:'text/html'},{mime:'application/octet-stream'},{noType:true}]){const out=await call(await fixture(t),SOURCE96,extra);assert.equal(out.result.reason,'guide-unsupported',JSON.stringify(extra));assert.equal(out.result.subReason,'fresh-media-refused',JSON.stringify(extra));assert.equal(out.result.final,true);assert.deepEqual(out.objects,[]);}
});
test('MIME 5. application/json behaves exactly as before',async t=>{
 const out=await call(await fixture(t),SOURCE96,{mime:'application/json'});assert.equal(out.result.state,'retained');assert.equal(out.result.file.contentType,'application/json');
});
test('MIME 6. no other port accepts text/plain, and the profile port admits it only for the composed class-A URL',async()=>{
 async function run(content,mime,url='https://raw.githubusercontent.com/BibleAquifer/FIATranslationGuide/'+REV96+'/'+PATH){const rows=new Map(),objects=new Map();const storage={get:async k=>structuredClone(rows.get(k)),async transaction(fn){return fn({get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v))});}};
  const bucket={get:async key=>{const b=objects.get(key);return b?{size:b.length,body:new Blob([b]).stream()}:null;},put:async(key,b)=>{const bytes=b instanceof Uint8Array?b.slice():new Uint8Array(await new Response(b).arrayBuffer());if(!objects.has(key))objects.set(key,bytes);return {};}};
  try{const task=createFreshSourceObservations({storage,bucket,content,source:{logicalId:'l',url,sourceVersionKind:'discovery-snapshot',sourceVersion:'v',publisherVersion:null},policy:{revision:'p',maxBytes:1024,totalMs:1000,progressMs:100},admissions:[{checkId:'c',sequence:1,expectedPreviousObservationSha256:null,previousSourceSha256:null}],eligibility:()=>true,makeStream:()=>new TransformStream(),fetchSource:async()=>new Response('[1]',{headers:{'content-type':mime,'content-length':'3'}})});await task.observe('c');return 'accepted';}catch(e){return e.message;}}
 assert.equal(await run(JSON_CONTENT,'text/plain'),'fresh-media-refused');assert.equal(await run(VISUAL_CONTENT,'text/plain'),'fresh-response-refused');assert.equal(await run(AUDIO_CONTENT,'text/plain'),'fresh-response-refused');
 assert.throws(()=>createProfileJsonPort({media:['text/plain']}),/fresh-capability/,'text/plain needs a source-URL rule');assert.throws(()=>createProfileJsonPort({media:['text/html']}),/fresh-capability/);
 const ruled=createProfileJsonPort({media:['application/json','text/plain'],sourceUrl:u=>/^https:\/\/raw\.githubusercontent\.com\/BibleAquifer\/FIATranslationGuide\/[a-f0-9]{40}\/(?:eng|spa)\/json\/\d{1,3}\.content\.json$/.test(u)});
 assert.equal(await run(ruled,'text/plain'),'accepted');assert.equal(await run(ruled,'text/plain','https://elsewhere.invalid/x.json'),'fresh-capability','the pair never reaches another origin');
 assert.equal(await run({...ruled},'text/plain'),'fresh-capability','a copy of a profile port is not a port');
 assert.deepEqual(GUIDE_ACQUISITION_PROFILE.media,['application/json','text/plain']);assert.match(GUIDE_ACQUISITION_PROFILE.mediaRule,/^text\/plain admitted only for this profile's composed class-A URL/);
});

// N1: the production constructor reads guide records only through the build-pinned canonical guide reader (snapshot.canonicalSources).
// The canonical sources come deterministically from the build-time exporter itself (as package-worker produces them), never from
// the gitignored generated/snapshot.json, which exists only after a build.
const {exportGuideSources}=await import('../../server/fia/compiler/presentation/export-guide-sources.mjs');
const exportDir=await mkdtemp(join(tmpdir(),'guide-composer-canonical-'));
let SNAPSHOT;try{SNAPSHOT={canonicalSources:exportGuideSources({outputRoot:exportDir,sourceRevision:archives[0].revision})};}finally{await rm(exportDir,{recursive:true,force:true});}
const MARK='eng.MRK-1-14-20',markGuide=archives.find(x=>x.packs[MARK]).packs[MARK].guide,markBytes=Buffer.from(JSON.stringify(markGuide));
const markSource=SNAPSHOT.canonicalSources.find(d=>d.packId===MARK);
function canonical(bytes=markBytes){return {sources:[markSource],assets:{[markSource.staticPath]:bytes.toString('base64')}};}
test('N1. the production constructor composes the descriptor from the build-pinned canonical guide record, and takes no archives or bindings',async()=>{
 assert.equal(SNAPSHOT.canonicalSources.length,136);assert.ok(SNAPSHOT.canonicalSources.every(d=>d.packId.includes('.MRK-')),'Mark only today');
 assert.equal(sha(markBytes),markSource.sha256);assert.equal(markSource.sha256,BINDINGS[MARK].guide,'the snapshot descriptor is the source-bindings pin');
 const assets={[markSource.staticPath]:markBytes},fetchAsset=async p=>assets[p]?new Response(assets[p],{status:200,headers:{'content-type':'application/json','content-length':String(assets[p].length)}}):new Response('',{status:404});
 const c=createGuideComposer({snapshot:SNAPSHOT,fetchAsset,producer:{demand:async()=>({}),retainedGuideFile:async()=>({})}});
 assert.deepEqual((await c.descriptorFor(MARK)).descriptor,{owner:'BibleAquifer',collection:'FIATranslationGuide',revision:'eb744452eb8d7c852caadde9d3181cddfe571119',path:'eng/json/41.content.json',fileSha256:'7d22f64be2a993c583eef1cb47168be4be2ea8e1de92d4a02d2d93bf7c475a4c'});
 assert.equal((await c.descriptorFor(LUKE)).refused,'composer-unknown-pack','Luke packs are not in snapshot.canonicalSources yet (held-file export)');
 const flipped=Buffer.from(markBytes);flipped[flipped.length-5]^=1;const tampered={[markSource.staticPath]:flipped};
 const t2=createGuideComposer({snapshot:SNAPSHOT,fetchAsset:async p=>new Response(tampered[p],{status:200,headers:{'content-type':'application/json','content-length':String(tampered[p].length)}}),producer:{demand:async()=>({}),retainedGuideFile:async()=>({})}});
 const refused=await t2.descriptorFor(MARK);assert.equal(refused.refused,'composer-guide-unavailable');assert.equal(refused.subReason,'canonical-guide-integrity','asset bytes that differ from the pinned sha are refused');
 assert.throws(()=>createGuideComposer({archives,sourceBindings:BINDINGS,producer:{demand:async()=>({}),retainedGuideFile:async()=>({})}}),/composer-capability/,'archives and bindings are not production parameters');
 assert.throws(()=>createGuideComposer({snapshot:SNAPSHOT,fetchAsset,producer:{demand:async()=>({}),retainedGuideFile:async()=>({})},archives}),/composer-capability/,'an extra key beside a valid snapshot is refused, not ignored');
});
test('N1. through the production constructor, the eb744452 descriptor still fails closed against other bytes',async t=>{
 const mf=await fixture(t),[step]=(await flow(mf,[{packId:MARK,unitId:'S03-U001',compose:{canonical:canonical()},index:{archives:[{revision:archives[0].revision,inventory:[],packs:{[MARK]:archives.find(x=>x.packs[MARK]).packs[MARK]}}]},use:'all'}],{object:'flow-mark'})).steps;
 assert.equal(step.composed.state,'unavailable');assert.equal(step.composed.reason,'guide-sha-mismatch');assert.equal(step.composed.descriptor.revision,'eb744452eb8d7c852caadde9d3181cddfe571119');assert.equal(step.composed.receipt,null);
});
test('note (a). createProfileJsonPort refuses a URL rule that accepts foreign URLs, such as u=>true',()=>{
 assert.throws(()=>createProfileJsonPort({media:['application/json','text/plain'],sourceUrl:()=>true}),/fresh-capability/,'u=>true');
 assert.throws(()=>createProfileJsonPort({media:['application/json','text/plain'],sourceUrl:u=>u.startsWith('https://raw.githubusercontent.com/')}),/fresh-capability/,'any owner on the host');
 assert.throws(()=>createProfileJsonPort({media:['application/json','text/plain'],sourceUrl:u=>u.startsWith('https://raw.githubusercontent.com/BibleAquifer/')}),/fresh-capability/,'any collection or path for the owner');
 assert.throws(()=>createProfileJsonPort({media:['application/json','text/plain'],sourceUrl:u=>/content\.json$/.test(u)}),/fresh-capability/,'path shape only');
 assert.throws(()=>createProfileJsonPort({media:['application/json','text/plain'],sourceUrl:()=>false}),/fresh-capability/,'a rule that refuses the class-A shape is useless');
 assert.doesNotThrow(()=>createProfileJsonPort({media:['application/json'],sourceUrl:()=>true}),'without text/plain the rule grants nothing');
});
