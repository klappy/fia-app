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
import {canonicalJSONString} from '../../server/fia/preparation/contract.mjs';
import {guideFragmentIdentity,GUIDE_FRAGMENT_POLICY,GUIDE_FRAGMENT_JOB} from '../../server/fia/preparation/guide-fragment.mjs';
import {GUIDE_FRAGMENT_READ_SCHEMA} from '../../server/fia/preparation/guide-fragment-admission.mjs';
import {buildSourceIndex,associatePack,SOURCE_ASSOCIATION_RECIPE} from '../../server/fia/preparation/source-associations/index.mjs';
import {readRetainedArchives} from '../../server/fia/preparation/source-associations/retained.mjs';
// Review 5701363820 N1: an acquisition outcome belongs to its own preparation, never to the pack. Two concurrent explicit Opens of one
// pack are different jobs (the job id carries the resolved context). A test-only resolveBindings gate holds each right after it
// composes: B (a non-final miss, no join) and A (retained, its join read). B publishes first, then A, in turn. B's base record must not carry
// A's settled outcome, and A's joined record must carry its own. FIXTURE: a door answers /demand and /fragment; nothing is fetched.
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const UNIT='S03-U017',origin='https://dev.fiaguide.app',publicRoot='apps/web/public',PACK='eng.MRK-4-35-41',ROOT='fia-executable-presentation-authority@1';
// The packaged Worker's own compatibility date and flags (wrangler.jsonc), so AsyncLocalStorage runs as it does deployed.
const wranglerText=await readFile('wrangler.jsonc','utf8'),wrangler={compatibility_date:/"compatibility_date"\s*:\s*"([^"]+)"/.exec(wranglerText)[1],compatibility_flags:JSON.parse(/"compatibility_flags"\s*:\s*(\[[^\]]*\])/.exec(wranglerText)[1])};
const archive=JSON.parse(gunzipSync(await readFile('server/fia/compiler/presentation/source-packs.json.gz'),{maxOutputLength:134217728}));
const FRAGMENT='c2623d42a7dbc3b9c2b95704b7401783db515090e691fa8cd49a08cefdc895eb',JSON_PATH='$[16].content#p26',OBSERVATION='2abf97abb561a7202aae57831fffa794b24ab824c9adcb4cd3bdf53773821f60';
const hex=b=>createHash('sha256').update(b).digest('hex');
async function fragmentAnswer(){
 const g=archive.packs[PACK].guide,owner='BibleAquifer',collection=g.provenance.collection,source={repo:`${owner}/${collection}`,revision:g.provenance.revision,path:g.sourceFile},identity=await guideFragmentIdentity(source);
 const descriptor={owner,collection,revision:source.revision,path:g.sourceFile,fileSha256:g.sourceFileSha256};
 const compiled=associatePack(buildSourceIndex(readRetainedArchives()),PACK).find(d=>d.unitId===UNIT&&d.resourceId==='a293');
 const raw={rawRevision:g.provenance.revision,rawFileSha256:g.sourceFileSha256,rawFragmentSha256:FRAGMENT},binding={...compiled.binding,...raw};
 const evidence={...compiled.evidence,provenance:'raw-publisher-html',rawRepo:source.repo,rawRevision:raw.rawRevision,rawPath:g.sourceFile,rawFileSha256:raw.rawFileSha256,rawJsonPath:JSON_PATH,rawFragmentSha256:FRAGMENT};
 const decision={packId:PACK,unitId:UNIT,stepId:compiled.stepId,type:'explicit',reason:null,kind:null,namespace:'FIAImages',resourceId:'a293',contentId:'a293',jsonPath:JSON_PATH,htmlSha256:FRAGMENT,candidates:null,dependency:null,evidence,binding,bindingSha256:hex(canonicalJSONString(binding))};
 return {schema:GUIDE_FRAGMENT_READ_SCHEMA,job:GUIDE_FRAGMENT_JOB,packId:PACK,descriptor,identity:{logicalId:identity.logicalId,url:identity.url,publisherVersion:source.revision},policyRevision:GUIDE_FRAGMENT_POLICY.revision,recipe:SOURCE_ASSOCIATION_RECIPE,state:'composed',reason:null,subReason:null,custody:'retained',
  receipt:{schema:'fia-guide-producer-receipt@1',...descriptor,bytes:1684770,contentType:'text/plain',observationSha256:OBSERVATION},paragraphs:[{jsonPath:JSON_PATH,htmlSha256:FRAGMENT}],associations:{state:'composed',reason:null,subReason:null,indexSha256:'7'.repeat(64),decisions:[decision]}};
}

test('N1 race: a concurrent Open\'s settled outcome is never committed beside another Open\'s base record',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'fia-source-join-race-')),authority=JSON.parse(await readFile('server/fia/publication/trusted-generalized.json')),extension=buildGeneralizedSnapshot(publicRoot,authority);
 const canonicalSources=exportGuideSources({outputRoot:dir,sourceRevision:authority.sourceCommit}),associationSources=exportAssociationSources({outputRoot:dir,sourceRevision:authority.sourceCommit});
 const proof=await buildApprovedAudioProofIndex({publicRoot,authority:{registrySha256:authority.catalog.sha256,sourceRevision:authority.sourceCommit}});
 const snapshot={schema:'fia.worker-read-snapshot.v1',records:extension.records,current:extension.current,staticArtifacts:extension.staticArtifacts,artifacts:[],canonicalSources,associationSources,generalizedAuthority:extension.authority,approvedAudioProofIndex:proof.descriptor};
 const answer=await fragmentAnswer(),log=[],held={};const heldOf=who=>held[who]??=(()=>{let r;const p=new Promise(x=>r=x);return {p,r};})();
 const entry=`import worker,{FiaPreparationJobs as Jobs} from ${JSON.stringify(resolve('server/faces/worker/entry.mjs'))};
const gates={};const gate=name=>gates[name]??=(()=>{let release;const p=new Promise(r=>release=r);return {p,release};})();let demands=0;
export class FiaPreparationJobs extends Jobs{
 presentationExecutionCapabilities(){const c=super.presentationExecutionCapabilities();return {...c,capabilities:{resolveBindings:async context=>{const who=context.decisions.length?'A':'B';await this.env.ASSETS.fetch(new Request('https://assets.invalid/__held-'+who));await gate(who).p;return {};}}};}
 async fetch(request){const url=new URL(request.url);
  if(url.origin==='https://guide-fragment.internal'&&url.pathname==='/demand'){demands++;return Response.json(demands===1?{state:'unavailable',reason:'interrupted',final:false}:{state:'retained'});}
  if(url.origin==='https://guide-fragment.internal'&&url.pathname==='/fragment')return Response.json(${JSON.stringify(answer)});
  if(url.origin==='https://race.test'&&url.pathname.startsWith('/release/')){gate(url.pathname.slice(9)).release();return Response.json(true);}
  if(url.origin==='https://race.test'&&url.pathname==='/outcomes')return Response.json(Object.fromEntries(await this.ctx.storage.list({prefix:'source-join-outcome:'})));
  return super.fetch(request);}}
export default worker;`;
 const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'race-entry.mjs',loader:'js'},bundle:true,platform:'browser',format:'esm',external:['node:*'],write:false,plugins:[{name:'snapshot',setup(b){b.onResolve({filter:/generated\/snapshot\.json$/},()=>({path:'snapshot',namespace:'race'}));b.onLoad({filter:/.*/,namespace:'race'},()=>({contents:JSON.stringify(snapshot),loader:'json'}));}}]});
 const mf=new Miniflare({...convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:wrangler.compatibility_date,compatibilityFlags:wrangler.compatibility_flags,bindings:{FIA_API_ORIGIN:origin},durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}},r2Buckets:['FIA_ORIGINALS'],
  serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname;if(path.startsWith('/__held-')){const who=path.slice(8);log.push(who+' held after composing');heldOf(who).r();return new Response('ok');}let b;try{b=path===proof.descriptor.path?proof.bytes:await readFile((path.startsWith('/content/source-guides/')?dir:publicRoot)+path);}catch(error){if(error.code!=='ENOENT')throw error;return new Response('Not found',{status:404});}return new Response(b,{headers:{'Content-Type':'application/json','Content-Length':String(b.length)}});}},
  outboundService:()=>{throw Error('External work forbidden');}}),resourcePersistencePath:join(dir,'storage')});
 assert.deepEqual([wrangler.compatibility_date,wrangler.compatibility_flags],['2026-09-01',['nodejs_compat']],'the packaged flags this test runs under');
 try{
  const read=async(path,init)=>{const r=await mf.dispatchFetch(origin+path,init);return {status:r.status,body:await r.json()};};
  const current=await read('/v1/packs/'+PACK),demand=current.body.preparationDemand;assert.ok(demand);
  const post=()=>read('/v1/presentation-preparations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(demand)});
  const ns=await mf.getDurableObjectNamespace('FIA_PREPARATION_JOBS'),root=ns.get(ns.idFromName(ROOT)),release=who=>root.fetch('https://race.test/release/'+who),outcomes=async()=>(await root.fetch('https://race.test/outcomes')).json();
  // B: a non-final miss, composed without a join, held. A is posted while B is held: explicit preparations of one pack take turns,
  // so A must not compose (nor acquire) until B has published. Then A: retained, its join read, composed, held, published.
  const B=post();await heldOf('B').p;const A=post();
  await new Promise(r=>setTimeout(r,500));assert.ok(!log.includes('A held after composing'),'A waits for B\'s turn: '+log.join(' | '));
  await release('B');const Bdone=await B;log.push(`B ${Bdone.body.status} ${Bdone.body.record?.revision}`);
  const afterB=await outcomes(),bOutcome=afterB[`source-join-outcome:${PACK}@${Bdone.body.record.revision}`]??afterB[`source-join-outcome:${PACK}@${Bdone.body.record.execution?.baseRevision}`]??null;
  log.push('outcome beside B: '+JSON.stringify(bOutcome&&{state:bOutcome.state,reason:bOutcome.reason??null,settled:bOutcome.settled??null,join:bOutcome.join?.state??null}));
  const currentB=await read('/v1/packs/'+PACK);log.push(`current after B: ${currentB.body.revision} execution:${!!currentB.body.execution} demand:${!!currentB.body.preparationDemand}`);
  await heldOf('A').p;await release('A');const Adone=await A;log.push(`A ${Adone.body.status} ${Adone.body.record?.revision} ${Adone.body.reason??''}`);
  assert.notEqual(Bdone.body.record.revision,Adone.body.record?.revision,'two different jobs (no coalescing)');
  const after={body:(await read('/v1/packs/'+PACK)).body};log.push(`current after A: ${after.body.revision} execution:${!!after.body.execution} demand:${!!after.body.preparationDemand}`);
  assert.deepEqual([bOutcome?.state,bOutcome?.settled],['unavailable',false],'beside B\'s record: B\'s own non-final outcome, never A\'s');
  assert.ok(currentB.body.preparationDemand,'B\'s base record, current after B publishes, is not settled: '+log.join(' | '));
  assert.equal(Adone.body.status,'ready');assert.equal(after.body.revision,Adone.body.record.revision,'A\'s joined record, current after A publishes, is settled by its own outcome: '+log.join(' | '));
  assert.equal(after.body.preparationDemand,undefined);
 }finally{await mf.dispose();await rm(dir,{recursive:true,force:true});}
});
