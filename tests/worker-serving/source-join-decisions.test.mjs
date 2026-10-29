import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {readFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {gunzipSync} from 'node:zlib';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
import {canonicalSourceOrder,projectExecutablePresentation} from '../../server/fia/compiler/presentation/source-action-projector.mjs';
import {exportGuideSources} from '../../server/fia/compiler/presentation/export-guide-sources.mjs';
import {buildSourceIndex,associatePack,SOURCE_ASSOCIATION_RECIPE} from '../../server/fia/preparation/source-associations/index.mjs';
import {readRetainedArchives} from '../../server/fia/preparation/source-associations/retained.mjs';
import {guideFragmentIdentity,GUIDE_FRAGMENT_POLICY,GUIDE_FRAGMENT_JOB} from '../../server/fia/preparation/guide-fragment.mjs';
import {GUIDE_FRAGMENT_READ_SCHEMA} from '../../server/fia/preparation/guide-fragment-admission.mjs';
import {createSourceJoinReader,SOURCE_JOIN_SCHEMA,SOURCE_JOIN_RECIPE} from '../../server/fia/preparation/source-join-decisions.mjs';
import {createTrustedSourceActionComposer,trustedExecutionRecipe,withinJoinLimits,JOIN_MAX_REQUESTED,JOIN_MAX_DECISIONS} from '../../server/fia/preparation/trusted-source-actions.mjs';

// The runtime consumer of the guide fragment object's read-only decisions (Terry ANSWER-FRAGMENT-CROSS-OBJECT-AUTHORITY,
// cookbook 0a36cb2): one case per binding, each refusal typed unavailable, never explicit.
// FIXTURE, not an acquisition: the /fragment response below is built in this test in the shape of the real join Otto observed
// once, locally, at cookbook f319d03 (eng.MRK-4-35-41 S03-U017 -> FIAImages a293 from $[16].content#p26, fragment sha c2623d42...).
// That run is the only real proof; nothing here fetched or acquired anything.
const packId='eng.MRK-4-35-41',FRAGMENT='c2623d42a7dbc3b9c2b95704b7401783db515090e691fa8cd49a08cefdc895eb',JSON_PATH='$[16].content#p26';
const OBSERVATION='2abf97abb561a7202aae57831fffa794b24ab824c9adcb4cd3bdf53773821f60',BYTES=1684770;
const registry=JSON.parse(readFileSync('apps/web/public/content/registry.json','utf8'));
const archive=JSON.parse(gunzipSync(readFileSync('server/fia/compiler/presentation/source-packs.json.gz'),{maxOutputLength:134217728}));
const authority=JSON.parse(readFileSync('server/fia/publication/trusted-generalized.json','utf8'));
const policySha256=await sha256('test-execution-policy');

async function snapshotFor(){
 const dir=await mkdtemp(join(tmpdir(),'source-join-')),canonicalSources=exportGuideSources({outputRoot:dir,sourceRevision:authority.sourceCommit});
 const fetchAsset=async path=>{try{const b=await readFile(dir+path);return new Response(b,{headers:{'Content-Type':'application/json','Content-Length':String(b.length)}});}catch{return new Response('missing',{status:404});}};
 return {dir,snapshot:{canonicalSources},fetchAsset};
}
async function contextFor(){
 const d=registry.packs.find(p=>p.id===packId),base=JSON.parse(readFileSync('apps/web/public'+d.presentation.url,'utf8')),guide=archive.packs[packId].guide,units=[];
 for(const [sectionOrdinal,s] of guide.steps.entries())for(const [unitOrdinal,u] of s.units.entries())units.push({sectionId:s.id,sectionOrdinal,sourceUnitId:u.id,unitOrdinal,sourceTextSha256:u.textSha256,text:u.text});
 return {basePresentation:base,baseRevision:d.revision,sourceRevision:archive.revision,language:'eng',guideContentSha256:guide.contentSha256,canonicalUnits:units,canonicalOrderSha256:await canonicalSourceOrder(units),decisions:[],transitionEvidence:[],boundArtifacts:[]};
}
// The fixture answer, in the fragment object's closed schema (GUIDE_FRAGMENT_READ_SCHEMA, PR308 9e3f243), from the real compiled
// binding for S03-U017 (the index without raw evidence) plus the raw fields of f319d03.
const bindingSha=b=>createHash('sha256').update(canonicalJSONString(b)).digest('hex');
async function fixtureResponse(){
 const g=archive.packs[packId].guide,owner='BibleAquifer',collection=g.provenance.collection;
 const source={repo:`${owner}/${collection}`,revision:g.provenance.revision,path:g.sourceFile},identity=await guideFragmentIdentity(source);
 const descriptor={owner,collection,revision:source.revision,path:g.sourceFile,fileSha256:g.sourceFileSha256};
 const compiled=associatePack(buildSourceIndex(readRetainedArchives()),packId).find(d=>d.unitId==='S03-U017'&&d.resourceId==='a293');
 const raw={rawRevision:g.provenance.revision,rawFileSha256:g.sourceFileSha256,rawFragmentSha256:FRAGMENT};
 const evidence={...compiled.evidence,provenance:'raw-publisher-html',rawRepo:source.repo,rawRevision:raw.rawRevision,rawPath:g.sourceFile,rawFileSha256:raw.rawFileSha256,rawJsonPath:JSON_PATH,rawFragmentSha256:FRAGMENT},binding={...compiled.binding,...raw};
 const decision={packId,unitId:compiled.unitId,stepId:compiled.stepId,type:'explicit',reason:null,kind:null,namespace:'FIAImages',resourceId:'a293',contentId:'a293',jsonPath:JSON_PATH,htmlSha256:FRAGMENT,candidates:null,dependency:null,evidence,binding,bindingSha256:bindingSha(binding)};
 return {schema:GUIDE_FRAGMENT_READ_SCHEMA,job:GUIDE_FRAGMENT_JOB,packId,descriptor,identity:{logicalId:identity.logicalId,url:identity.url,publisherVersion:source.revision},policyRevision:GUIDE_FRAGMENT_POLICY.revision,recipe:SOURCE_ASSOCIATION_RECIPE,
  state:'composed',reason:null,subReason:null,custody:'retained',
  receipt:{schema:'fia-guide-producer-receipt@1',...descriptor,bytes:BYTES,contentType:'text/plain',observationSha256:OBSERVATION},paragraphs:[{jsonPath:JSON_PATH,htmlSha256:FRAGMENT}],
  associations:{state:'composed',reason:null,subReason:null,indexSha256:'7'.repeat(64),decisions:[decision]}};
}
// rebind: a mutation of a binding keeps its bindingSha256 coherent, so the case tests the check it names, not the hash.
async function harness(mutate=r=>r,{rebind=true}={}){
 const s=await snapshotFor(),response=mutate(await fixtureResponse()),asked=[];
 if(rebind&&response?.associations?.decisions)for(const d of response.associations.decisions)if(d.binding)d.bindingSha256=bindingSha(d.binding);
 const reader=createSourceJoinReader({snapshot:s.snapshot,fetchAsset:s.fetchAsset,readFragment:async q=>{asked.push(q);return typeof response==='function'?response():structuredClone(response);}});
 return {...s,reader,asked,response};
}
const at=(r,f)=>{const c=structuredClone(r);f(c);return c;};

test('the fixture keeps the real join: S03-U017 -> a293 from $[16].content#p26, at the archive pin of f319d03',async()=>{
 const r=await fixtureResponse(),d=r.associations.decisions[0];
 assert.deepEqual([d.unitId,d.namespace,d.resourceId,d.evidence.rawJsonPath,d.evidence.rawFragmentSha256],['S03-U017','FIAImages','a293',JSON_PATH,FRAGMENT]);
 assert.deepEqual([r.receipt.revision,r.receipt.path,r.receipt.fileSha256],['eb744452eb8d7c852caadde9d3181cddfe571119','eng/json/41.content.json','7d22f64be2a993c583eef1cb47168be4be2ea8e1de92d4a02d2d93bf7c475a4c']);
});

test('all six bindings hold: the reader names the object from its own descriptor, and the join becomes one explicit decision',async()=>{
 const t=await harness();
 try{
  const joined=await t.reader.joinsFor(packId);assert.equal(joined.state,'ready',JSON.stringify(joined));
  const g=archive.packs[packId].guide,identity=await guideFragmentIdentity({repo:`BibleAquifer/${g.provenance.collection}`,revision:g.provenance.revision,path:g.sourceFile});
  assert.deepEqual(t.asked,[{name:identity.name,packId}],'binding 2: the name comes from the composed source; binding 6: one read-only call');
  assert.deepEqual(joined.joins.map(j=>[j.unitId,j.collection,j.resourceId]),[['S03-U017','FIAImages','a293']]);
  const context=await contextFor(),compose=createTrustedSourceActionComposer({policySha256,sourceJoins:t.reader});
  const decisions=await compose(context);assert.equal(decisions.length,1);
  const [{input,explicitResult}]=decisions;
  assert.equal(input.source.unitId,'S03-U017');assert.deepEqual(explicitResult.resourceAssociations.map(a=>[a.outcome,a.candidateResourceIds,a.reason]),[['matched',['a293'],'explicit-binding']]);
  // Binding 5: the observation is the raw evidence; the producer policy, recipe and file are in the config digest.
  assert.equal(explicitResult.provenance.rawEvidenceSha256,OBSERVATION);
  assert.equal(explicitResult.provenance.configSha256,await sha256(new TextEncoder().encode(canonicalJSONString(joined.provenance))));
  assert.ok(joined.provenance.policyRevision===GUIDE_FRAGMENT_POLICY.revision&&joined.provenance.recipe===SOURCE_ASSOCIATION_RECIPE&&joined.provenance.fileSha256===g.sourceFileSha256);
  // Binding 4 continued: the projector's own validation accepts it, and S03-U017's focal becomes a293.
  const projected=await projectExecutablePresentation({...context,decisions:decisions.map(d=>({input:d.input,result:d.explicitResult}))});
  assert.ok(projected.presentation.activities.some(a=>a.sourceUnitId==='S03-U017'&&a.execution.focalAssetId==='a293'),'a293 is the focal for S03-U017');
  assert.ok(trustedExecutionRecipe('r',{sourceJoins:true}).endsWith('+'+SOURCE_JOIN_RECIPE)&&!trustedExecutionRecipe('r').includes(SOURCE_JOIN_RECIPE),'the join identity folds into the recipe only when wired');
 }finally{await rm(t.dir,{recursive:true,force:true});}
});

test('each binding refuses typed unavailable, and the composer then decides nothing',async()=>{
 const cases=[
  ['binding 1: another file sha',r=>at(r,c=>{c.receipt.fileSha256='0'.repeat(64);}),'descriptor-mismatch'],
  ['binding 1: another revision',r=>at(r,c=>{c.receipt.revision='0'.repeat(40);}),'descriptor-mismatch'],
  ['binding 1: another path',r=>at(r,c=>{c.receipt.path='eng/json/40.content.json';}),'descriptor-mismatch'],
  ['binding 2: another logical id',r=>at(r,c=>{c.identity.logicalId+=' ';}),'source-identity-mismatch'],
  ['binding 2: another url',r=>at(r,c=>{c.identity.url+='?x';}),'source-identity-mismatch'],
  ['binding 2: another publisher version',r=>at(r,c=>{c.identity.publisherVersion='96bb023'+'0'.repeat(33);}),'source-identity-mismatch'],
  ['binding 3: another schema',r=>at(r,c=>{c.schema='fia-guide-fragment-read@2';}),'version-skew'],
  ['binding 3: another producer policy',r=>at(r,c=>{c.policyRevision+='x';}),'version-skew'],
  ['binding 3: another index recipe',r=>at(r,c=>{c.recipe='fia-source-association@2';}),'version-skew'],
  ['binding 4: an unknown field',r=>at(r,c=>{c.extra=1;}),'join-schema'],
  ['binding 4: an unknown decision field',r=>at(r,c=>{c.associations.decisions[0].confidence=1;}),'join-schema'],
  ['binding 4: a forged fragment reference',r=>at(r,c=>{c.paragraphs[0].htmlSha256='1'.repeat(64);}),'join-forged-reference'],
  ['binding 4: a contradiction between decision and evidence',r=>at(r,c=>{c.associations.decisions[0].evidence.contentId='a294';}),'join-contradiction'],
  ['binding 4: a contradiction with the receipt',r=>at(r,c=>{c.associations.decisions[0].binding.rawFileSha256='2'.repeat(64);}),'join-contradiction'],
  ['binding 6: no answer',()=>null,'fragment-unavailable'],
  ['binding 6: the object is unavailable',r=>at(r,c=>{Object.assign(c,{state:'unavailable',reason:'guide-not-retained',custody:'none',receipt:null,paragraphs:null,associations:null});}),'fragment-unavailable'],
  ['binding 6: a non-object answer',()=>({state:'unavailable',reason:'guide-not-retained'}),'join-schema'],
  ['binding 1: the answer names another descriptor',r=>at(r,c=>{c.descriptor.fileSha256='8'.repeat(64);}),'descriptor-mismatch'],
  ['binding 3: another job',r=>at(r,c=>{c.job='guide-fragment@2';}),'version-skew'],
  ['the associations are unavailable',r=>at(r,c=>{c.associations={state:'unavailable',reason:'association-inputs-unavailable',subReason:'association-source-row',indexSha256:null,decisions:null};}),'associations-unavailable'],
  ['binding 4: the decision fields disagree with its evidence',r=>at(r,c=>{c.associations.decisions[0].jsonPath='$[1].content#p1';}),'join-contradiction'],
 ];
 for(const [name,mutate,reason] of cases){
  const t=await harness(r=>mutate(r));
  try{
   const joined=await t.reader.joinsFor(packId);assert.equal(joined.state,'unavailable',name);assert.equal(joined.reason,reason,name);
   assert.deepEqual(await createTrustedSourceActionComposer({policySha256,sourceJoins:t.reader})(await contextFor()),[],name+': no decision');
  }finally{await rm(t.dir,{recursive:true,force:true});}
 }
});

test('binding 4: a join the verified base or canonical unit does not admit is dropped, not repaired',async()=>{
 for(const [name,f] of [['unit text',c=>{c.associations.decisions[0].binding.unitTextSha256='3'.repeat(64);}],['resource source file',c=>{c.associations.decisions[0].binding.resourceSourceFileSha256='4'.repeat(64);}],['guide content',c=>{c.associations.decisions[0].binding.guideContentSha256='5'.repeat(64);}],['an asset the base does not have',c=>{const d=c.associations.decisions[0];d.resourceId=d.contentId=d.evidence.contentId=d.binding.resourceId='a999999';}]]){
  const t=await harness(r=>at(r,f));
  try{assert.equal((await t.reader.joinsFor(packId)).state,'ready',name);assert.deepEqual(await createTrustedSourceActionComposer({policySha256,sourceJoins:t.reader})(await contextFor()),[],name);}
  finally{await rm(t.dir,{recursive:true,force:true});}
 }
});

test('binding 5: another observation is another decision',async()=>{
 const a=await harness(),b=await harness(r=>at(r,c=>{c.receipt.observationSha256='6'.repeat(64);}));
 try{
  const [da]=await createTrustedSourceActionComposer({policySha256,sourceJoins:a.reader})(await contextFor()),[db]=await createTrustedSourceActionComposer({policySha256,sourceJoins:b.reader})(await contextFor());
  assert.notEqual(da.explicitResult.provenance.rawEvidenceSha256,db.explicitResult.provenance.rawEvidenceSha256);assert.notEqual(da.explicitResult.provenance.configSha256,db.explicitResult.provenance.configSha256);
 }finally{await rm(a.dir,{recursive:true,force:true});await rm(b.dir,{recursive:true,force:true});}
});

test('binding 4: a bindingSha256 that is not the binding\'s own hash refuses the join',async()=>{
 const t=await harness(r=>at(r,c=>{c.associations.decisions[0].bindingSha256='9'.repeat(64);}),{rebind:false});
 try{const joined=await t.reader.joinsFor(packId);assert.equal(joined.state,'unavailable');assert.equal(joined.reason,'join-contradiction');}
 finally{await rm(t.dir,{recursive:true,force:true});}
});

// The real /fragment answer at f319d03's pin also carries explicit FIAKeyTerms references (S05-U002 and others). A term is not a
// requested medium: it is passed over, and the a293 join is still read (found by the real Open proof, scratchpad open-proof).
test('an explicit key-term reference beside the image join is passed over, not a refusal of the whole answer',async()=>{
 const term=d=>({...structuredClone(d),unitId:'S05-U002',stepId:'S05',namespace:'FIAKeyTerms',resourceId:'eng-t17-v1',contentId:'eng-t17-v1',evidence:{...d.evidence,namespace:'FIAKeyTerms',contentId:'eng-t17-v1'},binding:{...d.binding,unitId:'S05-U002',namespace:'FIAKeyTerms',resourceId:'eng-t17-v1'}});
 const t=await harness(r=>at(r,c=>{c.associations.decisions.push(term(c.associations.decisions[0]));}));
 try{const joined=await t.reader.joinsFor(packId);assert.equal(joined.state,'ready',JSON.stringify(joined));assert.deepEqual(joined.joins.map(j=>[j.unitId,j.resourceId]),[['S03-U017','a293']]);
  assert.equal((await createTrustedSourceActionComposer({policySha256,sourceJoins:t.reader})(await contextFor())).length,1);}
 finally{await rm(t.dir,{recursive:true,force:true});}
});

// PR313 review N1: every failure in the reader is a typed unavailable, never a thrown error that blocks the Open. A lone surrogate
// in an unchecked field makes the answer's canonical hash fail; the reader answers unavailable and the composer decides nothing.
test('a reader failure that is not a refusal is typed unavailable, and the Open keeps the base',async()=>{
 const t=await harness(r=>at(r,c=>{c.subReason='\uD800';}));
 try{const joined=await t.reader.joinsFor(packId);assert.equal(joined.state,'unavailable');assert.equal(joined.reason,'join-unreadable');
  assert.deepEqual(await createTrustedSourceActionComposer({policySha256,sourceJoins:t.reader})(await contextFor()),[]);}
 finally{await rm(t.dir,{recursive:true,force:true});}
 const throwing={joinsFor:async()=>({state:'ready',packId,sourceRevision:archive.revision,provenance:{},joins:[{unitId:'S03-U017',collection:'FIAImages',resourceId:'a293',binding:null,evidence:{}}]})};
 assert.deepEqual(await createTrustedSourceActionComposer({policySha256,sourceJoins:throwing})(await contextFor()),[],'a join the composer cannot read is dropped');
});
// PR313 review N2: a join row decides at most 8 media (as trusted rows, and the input schema's maxItems 8), and join decisions are
// added only while the total stays within the resolver's 256. Over either limit the join is dropped.
test('join limits: 8 requested media and 256 decisions are the edges; one more is dropped',()=>{
 const row=n=>({requested:Array.from({length:n},(_,i)=>({id:'a'+i}))});
 assert.equal(JOIN_MAX_REQUESTED,8);assert.equal(JOIN_MAX_DECISIONS,256);
 assert.equal(withinJoinLimits(row(1),0),true);assert.equal(withinJoinLimits(row(8),0),true,'8 requested is within');assert.equal(withinJoinLimits(row(9),0),false,'9 requested is dropped');
 assert.equal(withinJoinLimits(row(0),0),false);
 assert.equal(withinJoinLimits(row(1),255),true,'the 256th decision is within');assert.equal(withinJoinLimits(row(1),256),false,'a 257th is dropped');
});
