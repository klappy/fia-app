import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {buildGeneralizedSnapshot} from '../../server/fia/publication/generalized.mjs';
import {exportGuideSources,exportAssociationSources} from '../../server/fia/compiler/presentation/export-guide-sources.mjs';
import {buildApprovedAudioProofIndex} from '../../scripts/approved-audio-proof-index.mjs';

// Terry 85eff6a (#313 C1): a non-final miss of the join may serve base, but it is not the pack's settled publication: the current
// read re-offers the demand, and the next explicit Open demands again. A final miss stands until its keyed recipe or descriptor
// moves. No read ever demands. FIXTURE, not an acquisition: a test-only door answers the guide object's /demand as each case needs
// and counts the calls; nothing reaches the network.
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://dev.fiaguide.app',publicRoot='apps/web/public',PACK='eng.MRK-4-35-41',ROOT='fia-executable-presentation-authority@1';
async function world(){
 const dir=await mkdtemp(join(tmpdir(),'fia-source-join-outcome-')),authority=JSON.parse(await readFile('server/fia/publication/trusted-generalized.json')),extension=buildGeneralizedSnapshot(publicRoot,authority);
 const canonicalSources=exportGuideSources({outputRoot:dir,sourceRevision:authority.sourceCommit}),associationSources=exportAssociationSources({outputRoot:dir,sourceRevision:authority.sourceCommit});
 const proof=await buildApprovedAudioProofIndex({publicRoot,authority:{registrySha256:authority.catalog.sha256,sourceRevision:authority.sourceCommit}});
 const snapshot={schema:'fia.worker-read-snapshot.v1',records:extension.records,current:extension.current,staticArtifacts:extension.staticArtifacts,artifacts:[],canonicalSources,associationSources,generalizedAuthority:extension.authority,approvedAudioProofIndex:proof.descriptor};
 const counts={outbound:0};
 // answer: the /demand answer for this build. recipeMove: a later build whose source-join policy (and so recipe) moved.
 const runtime=async({answer,recipeMove=false})=>{
  const entry=`import worker,{FiaPreparationJobs as Jobs} from ${JSON.stringify(resolve('server/faces/worker/entry.mjs'))};
export class FiaPreparationJobs extends Jobs{async fetch(request){const url=new URL(request.url);
 if(url.origin==='https://guide-fragment.internal'&&url.pathname==='/demand'){const n=(await this.ctx.storage.get('test-demands'))||0;await this.ctx.storage.put('test-demands',n+1);return Response.json(${JSON.stringify(answer)});}
 if(url.origin==='https://guide-fragment.internal'&&url.pathname==='/fragment'){const n=(await this.ctx.storage.get('test-fragments'))||0;await this.ctx.storage.put('test-fragments',n+1);}
 if(url.origin==='https://outcome.test'&&url.pathname==='/forget'){for(const k of (await this.ctx.storage.list({prefix:'source-join-outcome:'})).keys())await this.ctx.storage.delete(k);return Response.json(true);}
 if(url.origin==='https://outcome.test')return Response.json({demands:(await this.ctx.storage.get('test-demands'))||0,fragments:(await this.ctx.storage.get('test-fragments'))||0});
 return super.fetch(request);}}
export default worker;`;
  const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'source-join-outcome-entry.mjs',loader:'js'},bundle:true,platform:'browser',format:'esm',external:['node:*'],write:false,plugins:[{name:'snapshot',setup(b){b.onResolve({filter:/generated\/snapshot\.json$/},()=>({path:'snapshot',namespace:'so'}));b.onLoad({filter:/.*/,namespace:'so'},()=>({contents:JSON.stringify(snapshot),loader:'json'}));if(recipeMove)b.onLoad({filter:/source-join-decisions\.mjs$/},async args=>({contents:(await readFile(args.path,'utf8')).replace("SOURCE_JOIN_POLICY='fia-source-join@1'","SOURCE_JOIN_POLICY='fia-source-join@2'"),loader:'js',resolveDir:resolve('server/fia/preparation')}));}}]});
  return new Miniflare({...convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}},r2Buckets:['FIA_ORIGINALS'],
   serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname;let b;try{b=path===proof.descriptor.path?proof.bytes:await readFile((path.startsWith('/content/source-guides/')?dir:publicRoot)+path);}catch(error){if(error.code!=='ENOENT')throw error;return new Response('Not found',{status:404});}return new Response(b,{headers:{'Content-Type':'application/json','Content-Length':String(b.length)}});}},
   outboundService:()=>{counts.outbound++;throw Error('External work forbidden');}}),resourcePersistencePath:join(dir,'storage')});
 };
 return {dir,counts,runtime};
}
async function drive(mf){
 const read=async(path,init)=>{const r=await mf.dispatchFetch(origin+path,init);return {status:r.status,body:await r.json()};};
 const {guideFragmentIdentity}=await import('../../server/fia/preparation/guide-fragment.mjs'),{descriptorOf}=await import('../../server/fia/preparation/source-associations/composer.mjs');
 const {gunzipSync}=await import('node:zlib'),archive=JSON.parse(gunzipSync(await readFile('server/fia/compiler/presentation/source-packs.json.gz'),{maxOutputLength:134217728})),d=descriptorOf(archive.packs[PACK].guide);
 const name=(await guideFragmentIdentity({repo:`${d.owner}/${d.collection}`,revision:d.revision,path:d.path})).name,ns=await mf.getDurableObjectNamespace('FIA_PREPARATION_JOBS');
 const ops=async()=>(await ns.get(ns.idFromName(name)).fetch('https://outcome.test/')).json(),demands=async()=>(await ops()).demands;
 const current=()=>read('/v1/packs/'+PACK);
 const open=async demand=>{const r=await read('/v1/presentation-preparations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(demand)});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.status,'ready');return r.body.record;};
 const forget=async()=>(await ns.get(ns.idFromName(ROOT)).fetch('https://outcome.test/forget')).json();
 return {read,current,open,demands,ops,forget};
}

test('a non-final miss serves base, and the next explicit Open demands again; reads never demand',async()=>{
 const w=await world();
 try{
  const mf=await w.runtime({answer:{state:'unavailable',reason:'interrupted',final:false}});
  try{
   const t=await drive(mf),first=await t.current();assert.ok(first.body.preparationDemand);assert.equal(await t.demands(),0,'a read never demands');
   const record=await t.open(first.body.preparationDemand);assert.equal(await t.demands(),1,'Open 1 demands once');
   const after=await t.current();assert.equal(after.body.execution,undefined,'a non-final miss is not the settled publication');assert.ok(after.body.preparationDemand,'the demand is offered again');
   assert.equal((await t.read(`/v1/packs/${PACK}?revision=${record.revision}`)).status,200,'the served record stays exactly readable');
   assert.equal(await t.demands(),1,'reads, including the exact read, never demand');
   await t.open(after.body.preparationDemand);assert.equal(await t.demands(),2,'Open 2 demands again');
   // Review 5699870877 N3: after a non-retained /demand the runtime never reads /fragment.
   assert.equal((await t.ops()).fragments,0,'no /fragment read after a non-retained /demand');
  }finally{await mf.dispose();}
  assert.equal(w.counts.outbound,0);
 }finally{await rm(w.dir,{recursive:true,force:true});}
});

test('a final miss stands with no new demand until the recipe moves; then the next explicit Open demands again',async()=>{
 const w=await world();
 try{
  const final={state:'unavailable',reason:'guide-sha-mismatch',final:true};
  let mf=await w.runtime({answer:final});
  try{
   const t=await drive(mf),first=await t.current();const record=await t.open(first.body.preparationDemand);assert.equal(await t.demands(),1);
   const after=await t.current();assert.equal(after.body.revision,record.revision,'a final miss stands as the current publication');assert.equal(after.body.preparationDemand,undefined,'no demand is offered');
   assert.equal(await t.demands(),1,'and nothing demands');
  }finally{await mf.dispose();}
  mf=await w.runtime({answer:final,recipeMove:true});
  try{
   const t=await drive(mf),moved=await t.current();assert.equal(moved.body.execution,undefined,'after the recipe moves the current read is base');assert.ok(moved.body.preparationDemand,'with its demand');
   assert.equal(await t.demands(),1,'the read did not demand');
   await t.open(moved.body.preparationDemand);assert.equal(await t.demands(),2,'the explicit Open demands again');
  }finally{await mf.dispose();}
  assert.equal(w.counts.outbound,0);
 }finally{await rm(w.dir,{recursive:true,force:true});}
});

// Review 5700626016 N1: a record with no stored outcome (prepared before outcomes were recorded) is not settled either.
test('a publication with no recorded join outcome re-offers the demand, and the next explicit Open demands again',async()=>{
 const w=await world();
 try{
  const mf=await w.runtime({answer:{state:'unavailable',reason:'guide-sha-mismatch',final:true}});
  try{
   const t=await drive(mf),first=await t.current();const record=await t.open(first.body.preparationDemand);assert.equal(await t.demands(),1);
   assert.equal((await t.current()).body.revision,record.revision,'with its final outcome the publication stands');
   await t.forget();
   const after=await t.current();assert.equal(after.body.execution,undefined,'without an outcome it is not settled');assert.ok(after.body.preparationDemand);
   assert.equal(await t.demands(),1,'the read did not demand');
   await t.open(after.body.preparationDemand);assert.equal(await t.demands(),2,'the next explicit Open demands');
  }finally{await mf.dispose();}
 }finally{await rm(w.dir,{recursive:true,force:true});}
});

// Review 5700626016 B1: finality is an allowlist (Terry 85eff6a). guide-unsupported is final only with one of the object's own recipe
// sub-reasons; the object's other guide-unsupported answers (here a transient ASSETS read) are non-final, so the next Open demands.
test('guide-unsupported/composer-guide-unavailable is non-final: the next explicit Open demands again',async()=>{
 const w=await world();
 try{
  const mf=await w.runtime({answer:{state:'unavailable',reason:'guide-unsupported',subReason:'composer-guide-unavailable',final:true}});
  try{
   const t=await drive(mf),first=await t.current();await t.open(first.body.preparationDemand);assert.equal(await t.demands(),1);
   const after=await t.current();assert.equal(after.body.execution,undefined,'not the settled publication');assert.ok(after.body.preparationDemand);
   await t.open(after.body.preparationDemand);assert.equal(await t.demands(),2,'the next explicit Open demands again');
  }finally{await mf.dispose();}
 }finally{await rm(w.dir,{recursive:true,force:true});}
});
