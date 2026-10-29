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
import {SOURCE_ACTION_RECIPE} from '../../server/fia/compiler/presentation/source-action-projector.mjs';
import {trustedExecutionRecipe} from '../../server/fia/preparation/trusted-source-actions.mjs';

// Terry 4178e01: the two-build old-publication regression for the source-join recipe fold (claim 18841a7). Build A is the base
// without the join (the consumer module stubbed, so no reader is wired); build B is this tree. One persisted state across both.
// FIXTURE, not an acquisition: the guide fragment object's /demand (retained) and /fragment answers are the real join's shape (eng.MRK-4-35-41 S03-U017 ->
// FIAImages a293 at f319d03's pin), supplied by a test-only door; the real retained file is proven by the local Open proof only.
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://dev.fiaguide.app',publicRoot='apps/web/public',PACK='eng.MRK-4-35-41',UNIT='S03-U017',NOJOIN='eng.MRK-1-21-28';
const FRAGMENT='c2623d42a7dbc3b9c2b95704b7401783db515090e691fa8cd49a08cefdc895eb',JSON_PATH='$[16].content#p26',OBSERVATION='2abf97abb561a7202aae57831fffa794b24ab824c9adcb4cd3bdf53773821f60';
const hex=b=>createHash('sha256').update(b).digest('hex');
const archive=JSON.parse(gunzipSync(await readFile('server/fia/compiler/presentation/source-packs.json.gz'),{maxOutputLength:134217728}));
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

test('the source-join recipe fold: build A rows stay exactly readable under B, the current read re-offers, an Open re-prepares with no reacquisition and S03-U017 gains a293; a pack with no join gains nothing',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'fia-source-join-transition-')),authority=JSON.parse(await readFile('server/fia/publication/trusted-generalized.json')),extension=buildGeneralizedSnapshot(publicRoot,authority);
 const canonicalSources=exportGuideSources({outputRoot:dir,sourceRevision:authority.sourceCommit}),associationSources=exportAssociationSources({outputRoot:dir,sourceRevision:authority.sourceCommit});
 const proof=await buildApprovedAudioProofIndex({publicRoot,authority:{registrySha256:authority.catalog.sha256,sourceRevision:authority.sourceCommit}});
 const snapshot={schema:'fia.worker-read-snapshot.v1',records:extension.records,current:extension.current,staticArtifacts:extension.staticArtifacts,artifacts:[],canonicalSources,associationSources,generalizedAuthority:extension.authority,approvedAudioProofIndex:proof.descriptor};
 const answer=await fragmentAnswer(),counts={outbound:0};
 const entry=`import worker,{FiaPreparationJobs as Jobs} from ${JSON.stringify(resolve('server/faces/worker/entry.mjs'))};
export class FiaPreparationJobs extends Jobs{async fetch(request){const url=new URL(request.url);if(url.origin==='https://guide-fragment.internal'&&url.pathname==='/demand'){const {packId}=await request.json();return Response.json(packId===${JSON.stringify(PACK)}?{state:'retained'}:{state:'unavailable',reason:'guide-not-promoted'});}if(url.origin==='https://guide-fragment.internal'&&url.pathname==='/fragment'){const {packId}=await request.json();return Response.json(packId===${JSON.stringify(PACK)}?${JSON.stringify(answer)}:{state:'unavailable',reason:'guide-not-retained'});}return super.fetch(request);}}
export default worker;`;
 const runtime=async buildA=>{const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'source-join-transition-entry.mjs',loader:'js'},bundle:true,platform:'browser',format:'esm',external:['node:*'],write:false,plugins:[{name:'snapshot',setup(b){b.onResolve({filter:/generated\/snapshot\.json$/},()=>({path:'snapshot',namespace:'sj'}));b.onLoad({filter:/.*/,namespace:'sj'},()=>({contents:JSON.stringify(snapshot),loader:'json'}));if(buildA)b.onLoad({filter:/source-join-decisions\.mjs$/},()=>({contents:"export const createSourceJoinReader=()=>null;export const fragmentPort=()=>null;export const createGuideAcquisition=()=>null;export const guideDemandPort=()=>null;export const createGuideDescriptorKey=()=>null;export const createPreparationOutcomes=()=>({run:(packId,f)=>f(),hold(){},joined(){},current(){return null;}});export const SOURCE_JOIN_RULING='';export const SOURCE_JOIN_RECIPE='';",loader:'js'}));}}]});
  return new Miniflare({...convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}},r2Buckets:['FIA_ORIGINALS'],
   serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname;let bytes;try{bytes=path===proof.descriptor.path?proof.bytes:await readFile((path.startsWith('/content/source-guides/')?dir:publicRoot)+path);}catch(error){if(error.code!=='ENOENT')throw error;return new Response('Not found',{status:404});}return new Response(bytes,{headers:{'Content-Type':'application/json','Content-Length':String(bytes.length)}});}},
   outboundService:()=>{counts.outbound++;throw Error('External work forbidden');}}),resourcePersistencePath:join(dir,'storage')});};
 const read=mf=>async(path,init)=>{const r=await mf.dispatchFetch(origin+path,init),bytes=new Uint8Array(await r.arrayBuffer());return {status:r.status,etag:r.headers.get('etag'),sha256:hex(bytes),body:JSON.parse(new TextDecoder().decode(bytes))};};
 const objects=async mf=>{const bucket=await mf.getR2Bucket('FIA_ORIGINALS'),out=[];let cursor;do{const page=await bucket.list(cursor?{cursor}:{});out.push(...page.objects.map(o=>[o.key,o.etag,o.size]));cursor=page.truncated?page.cursor:undefined;}while(cursor);return out.filter(([k])=>!k.startsWith('preparation/executable/')).sort();};
 const open=async(r,packId)=>{const current=await r('/v1/packs/'+packId);assert.equal(current.status,200,JSON.stringify(current.body));assert.ok(current.body.preparationDemand,`${packId}: base plus demand`);assert.equal(current.body.execution,undefined);
  const ready=await r('/v1/presentation-preparations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(current.body.preparationDemand)});assert.equal(ready.status,200,JSON.stringify(ready.body));assert.equal(ready.body.status,'ready');
  const record=ready.body.record,presentation=await r('/v1/artifacts/'+record.revision);assert.equal(presentation.status,200);
  return {record,presentation,focal:Object.fromEntries(presentation.body.activities.filter(a=>a.execution?.focalAssetId).map(a=>[a.id,a.execution.focalAssetId]))};};
 const exact=async(r,packId,revision)=>r(`/v1/packs/${packId}?revision=${revision}`);
 try{
  let mf=await runtime(true),A,AN,Aexact,ANexact,Apres,originals;
  try{const r=read(mf);A=await open(r,PACK);AN=await open(r,NOJOIN);Aexact=await exact(r,PACK,A.record.revision);ANexact=await exact(r,NOJOIN,AN.record.revision);Apres=await r('/v1/artifacts/'+A.record.revision);originals=await objects(mf);}finally{await mf.dispose();}
  assert.equal(A.record.execution.provenance.recipeRevision,trustedExecutionRecipe(SOURCE_ACTION_RECIPE),'build A: no source-join fold');assert.equal(A.focal[UNIT],undefined,'build A: S03-U017 has no focal');
  mf=await runtime(false);
  try{
   const r=read(mf);
   // c and e: exact build A revisions answer under B exactly as under A, never refused for the recipe change (OFFLINE L96).
   for(const [packId,revision,before] of [[PACK,A.record.revision,Aexact],[NOJOIN,AN.record.revision,ANexact]]){const now=await exact(r,packId,revision);assert.equal(now.status,200,`${packId}@${revision}: ${JSON.stringify(now.body)}`);assert.equal(now.sha256,before.sha256,`${packId}: the exact old record is byte-identical`);}
   const oldPresentation=await r('/v1/artifacts/'+A.record.revision);assert.deepEqual([oldPresentation.status,oldPresentation.sha256,oldPresentation.etag],[200,Apres.sha256,Apres.etag],'the old presentation bytes, sha and ETag');
   // a and b: the current read returns base plus demand once; an explicit Open re-prepares, with no outbound and no new original.
   const B=await open(r,PACK),BN=await open(r,NOJOIN);
   assert.equal(B.record.execution.provenance.recipeRevision,trustedExecutionRecipe(SOURCE_ACTION_RECIPE,{sourceJoins:true}));assert.equal(B.focal[UNIT],'a293','build B: S03-U017 is placed on a293 from the join');
   assert.notEqual(B.record.execution.provenance.decisionEvidenceSha256,A.record.execution.provenance.decisionEvidenceSha256,'the join is a new decision');
   // d: a pack with no join gains nothing new: the same decisions and focals.
   assert.equal(BN.record.execution.provenance.decisionEvidenceSha256,AN.record.execution.provenance.decisionEvidenceSha256);assert.deepEqual(BN.focal,AN.focal);
   assert.deepEqual(await objects(mf),originals,'no original, decode, audio or recognition object was added or changed');
   // Exact B and exact A both resolve; the current read now serves B.
   assert.equal((await exact(r,PACK,B.record.revision)).status,200);assert.equal((await exact(r,PACK,A.record.revision)).status,200);
   const current=await r('/v1/packs/'+PACK);assert.equal(current.body.revision,B.record.revision);
  }finally{await mf.dispose();}
  assert.equal(counts.outbound,0,'cost: no outbound request, so no provider or model call');
 }finally{await rm(dir,{recursive:true,force:true});}
});
