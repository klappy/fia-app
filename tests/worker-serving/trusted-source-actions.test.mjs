import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
import {canonicalSourceOrder,projectExecutablePresentation} from '../../server/fia/compiler/presentation/source-action-projector.mjs';
import {createExecutablePresentationResolver} from '../../server/fia/preparation/executable-presentation-resolver.mjs';
import {createExecutablePresentationService} from '../../server/fia/preparation/executable-presentation-service.mjs';
import {createTrustedSourceActionComposer} from '../../server/fia/preparation/trusted-source-actions.mjs';
import metadata from '../../server/fia/preparation/trusted-source-actions.json' with {type:'json'};

// The real published base and canonical guide for Mark 1:14-20, in both languages.
const registry=JSON.parse(readFileSync('apps/web/public/content/registry.json','utf8'));
const archive=JSON.parse(gunzipSync(readFileSync('server/fia/compiler/presentation/source-packs.json.gz'),{maxOutputLength:134217728}));
const policySha256=await sha256('test-execution-policy'),encode=v=>new TextEncoder().encode(canonicalJSONString(v));
function published(packId){
 const d=registry.packs.find(p=>p.id===packId),content=readFileSync('apps/web/public'+d.presentation.url,'utf8');
 const guideBytes=new TextEncoder().encode(JSON.stringify(archive.packs[packId].guide));
 return {d,content,guideBytes,base:JSON.parse(content)};
}
async function contextFor(packId,mutate=()=>{}){
 const {d,base,guideBytes}=published(packId),guide=JSON.parse(new TextDecoder().decode(guideBytes)),units=[];
 for(const [sectionOrdinal,s] of guide.steps.entries())for(const [unitOrdinal,u] of s.units.entries())units.push({sectionId:s.id,sectionOrdinal,sourceUnitId:u.id,unitOrdinal,sourceTextSha256:u.textSha256,text:u.text});
 const context={basePresentation:base,baseRevision:d.revision,sourceRevision:archive.revision,language:packId.slice(0,3),guideContentSha256:guide.contentSha256,canonicalUnits:units,canonicalOrderSha256:await canonicalSourceOrder(units),decisions:[],transitionEvidence:[],boundArtifacts:[]};
 mutate(context);return context;
}
const compose=createTrustedSourceActionComposer({policySha256});
const project=async(context,decisions)=>projectExecutablePresentation({...context,decisions:decisions.map(d=>({input:d.input,result:d.explicitResult}))});

test('trusted metadata carries exactly the one admitted tuple and only its requested-medium facts',()=>{
 assert.equal(metadata.evidence.ledgerSha256,'123733d7aa1c127d8929efa2493b2ae5078657629c0f7b2647e1c44a916656c1');
 assert.deepEqual(metadata.rows.map(r=>[r.packId,r.unitId,r.requested.map(q=>`${q.collection}/${q.id}`)]),[['eng.MRK-1-14-20','S02-U008',['FIAMaps/c4','FIAImages/a1400']]]);
 for(const r of metadata.rows)assert.deepEqual(Object.keys(r).filter(k=>/primary|related|companion|order/i.test(k)),[],'no curated primary, order, relatedIds or companions');
 assert.throws(()=>createTrustedSourceActionComposer({}),/trusted-source-actions-metadata/);
});

test('the admitted tuple composes one explicit decision that projects focal a1400 and derived c4 in verified base order',async()=>{
 const context=await contextFor('eng.MRK-1-14-20'),decisions=await compose(structuredClone(context));
 assert.equal(decisions.length,1);const [{input,explicitResult}]=decisions;
 assert.equal(input.source.unitId,'S02-U008');assert.deepEqual(input.candidates.map(c=>c.resourceId),['c4','a1400']);assert.deepEqual(input.requestedDecisions,['resource-association']);
 assert.equal(explicitResult.inputSha256,await sha256(encode(input)));assert.equal(explicitResult.provenance.policySha256,policySha256);assert.equal(explicitResult.provenance.rawEvidenceSha256,metadata.evidence.ledgerSha256);
 assert.ok(explicitResult.resourceAssociations.every(r=>r.outcome==='matched'&&r.relation==='requested-medium'&&r.reason==='explicit-binding'));
 const keys=Object.keys(context.basePresentation.assets);assert.ok(keys.indexOf('a1400')<keys.indexOf('c4'),'base order puts a1400 first');
 const out=await project(context,decisions),i=out.presentation.activities.findIndex(a=>a.id==='S02-U008'),[primary,derived]=out.presentation.activities.slice(i,i+2);
 assert.equal(primary.execution.focalAssetId,'a1400');assert.equal(primary.kind,'discussion');assert.deepEqual(primary.execution.completion,{action:'manual-continue'});
 assert.equal(derived.id,'S02-U008-resource-c4');assert.equal(derived.execution.focalAssetId,'c4');assert.equal(derived.fulfills,'S02-U008');assert.deepEqual(derived.execution.narration,{action:'none'});
 assert.deepEqual(out.presentation.assets,context.basePresentation.assets);
 assert.deepEqual(await project(context,await compose(structuredClone(context))),out,'deterministic');
});

test('any stale or mismatched identity drops the row: no decision, never a repaired or inferred one',async()=>{
 const asset=id=>c=>c.basePresentation.assets[id];
 const mutations={
  'other language (Spanish row not admitted)':null,
  'source revision':c=>{c.sourceRevision='0'.repeat(40);},
  'guide content hash':c=>{c.guideContentSha256='0'.repeat(64);},
  'base guide file hash':c=>{c.basePresentation.source.guide.sourceFileSha256='0'.repeat(64);},
  'guide revision':c=>{c.basePresentation.source.guide.provenance.revision='0'.repeat(40);},
  'unit text hash':c=>{const u=c.canonicalUnits.find(u=>u.sourceUnitId==='S02-U008');u.sourceTextSha256='0'.repeat(64);},
  'unit text':c=>{c.canonicalUnits.find(u=>u.sourceUnitId==='S02-U008').text+=' ';},
  'missing unit':c=>{c.canonicalUnits=c.canonicalUnits.filter(u=>u.sourceUnitId!=='S02-U008');},
  'missing map asset':c=>{delete c.basePresentation.assets.c4;},
  'map source file hash':c=>{asset('c4')(c).sourceEvidence.sourceFileSha256='0'.repeat(64);},
  'image source file':c=>{asset('a1400')(c).sourceEvidence.sourceFile='eng/json/020.content.json';},
  'image title':c=>{asset('a1400')(c).title='Lake';},
  'map collection':c=>{asset('c4')(c).rights.collection='FIAImages';},
  'map kind':c=>{asset('c4')(c).kind='image';},
 };
 for(const [name,mutate] of Object.entries(mutations)){
  const context=mutate?await contextFor('eng.MRK-1-14-20',mutate):await contextFor('spa.MRK-1-14-20');
  assert.deepEqual(await compose(context),[],name);
 }
 for(const packId of ['eng.MRK-1-1-13','eng.MRK-1-21-28'].filter(id=>archive.packs[id]&&registry.packs.some(p=>p.id===id)))assert.deepEqual(await compose(await contextFor(packId)),[],packId);
});

function ports(){const values=new Map(),blobs=new Map();return {storage:{transaction:async fn=>fn({get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v))})},artifacts:{async write(bytes){const digest=await sha256(bytes),reference=`preparation/executable/${digest}.json`;if(!blobs.has(reference))blobs.set(reference,new Uint8Array(bytes));return {reference,sha256:digest};},async read(d){return new Uint8Array(blobs.get(d.reference)??[]);}}};}

test('through the verified resolver and the durable service, the explicit result is retained and the ready presentation places the tuple',async()=>{
 const {d,content,guideBytes}=published('eng.MRK-1-14-20'),guideSha=await sha256(guideBytes),artifact={sha256:d.revision,bytes:d.presentation.bytes};
 const reads={readPack:async a=>a.packId===d.id&&a.revision===d.revision?{status:'ready',packId:d.id,revision:d.revision,artifact,authority:{rawInventoryCommit:archive.revision}}:null,readArtifact:async a=>a.sha256===d.revision?{status:'ready',artifact,content}:null};
 const resolve=createExecutablePresentationResolver({reads,resolveCanonicalSource:async a=>({bytes:guideBytes,sha256:guideSha,sourceRevision:a.sourceRevision}),composeDecisionInputs:compose});
 const args={packId:d.id,baseRevision:d.revision,sourceRevision:archive.revision,capability:'executable-presentation'},p=ports();
 const service=createExecutablePresentationService({...p,resolve,eligible:async()=>true,policySha256});
 const ready=await service.request(args);assert.equal(ready.status,'ready',JSON.stringify(ready));
 const focal=ready.presentation.activities.filter(a=>a.execution.focalAssetId&&['image','map'].includes(ready.presentation.assets[a.execution.focalAssetId].kind)).map(a=>[a.id,a.execution.focalAssetId]);
 assert.deepEqual(focal,[['S02-U008','a1400'],['S02-U008-resource-c4','c4']]);
 assert.deepEqual(ready.provenance.unresolved,[]);
 const warm=await service.read({jobId:ready.jobId});assert.equal(warm.status,'ready');assert.deepEqual(warm.presentation,ready.presentation);
 // A composer under another policy cannot author this service's decision.
 const foreign=createExecutablePresentationService({...ports(),resolve:createExecutablePresentationResolver({reads,resolveCanonicalSource:async a=>({bytes:guideBytes,sha256:guideSha,sourceRevision:a.sourceRevision}),composeDecisionInputs:createTrustedSourceActionComposer({policySha256:await sha256('other-policy')})}),eligible:async()=>true,policySha256});
 assert.notEqual((await foreign.request(args)).status,'ready');
});
