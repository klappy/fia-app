import test from 'node:test';import assert from 'node:assert/strict';
import {sha256,canonicalJSONString} from '../../server/fia/preparation/contract.mjs';
import {createAlignmentAdapter,tokens} from '../../server/fia/preparation/executor/alignment.mjs';
import {LOCAL_RECOGNITION_CONFIG,localRecognitionConfigSha256} from '../../server/fia/preparation/executor/recognition-identity.mjs';
import {createAcceptanceAdapter} from '../../server/fia/preparation/executor/acceptance.mjs';
async function fixture(texts=['Listen now','Discuss together'],spoken=['Listen','now','Discuss','together']){
 const data=new Map(),storeArtifact=async bytes=>{const digest=await sha256(bytes);data.set(digest,bytes.slice());return {sha256:digest,reference:digest};},resolveArtifact=async artifact=>data.get(artifact.reference)?.slice(),input={packId:'eng.MRK-fixture',book:'MRK',language:'eng',edition:'fixture',passage:'1:21-28',resource:'S01',policyRevision:'fixture@1',scriptSha256:'a'.repeat(64)},sourceSha256='b'.repeat(64);
 const units=await Promise.all(texts.map(async(text,i)=>({activityId:`a${i}`,sourceUnitId:`u${i}`,sourceTextSha256:await sha256(text),text})));
 const raw={schema:'fia-local-raw-recognition@1',status:'candidate',source:{sha256:sourceSha256},durationSeconds:100,segments:[{words:spoken.map((word,i)=>({word,start:i,end:i+.8}))}]};
 const runtime={python:'fixture',av:'fixture',ctranslate2:'fixture','faster-whisper':'fixture',numpy:'fixture'},files={'model.bin':{sha256:'c'.repeat(64),bytes:10}},manifest=await sha256(canonicalJSONString(files));
 Object.assign(raw,{runtime,scriptSha256:'d'.repeat(64),model:{id:'tiny.en',manifestSha256:manifest,files,device:'cpu',computeType:'int8',cpuThreads:4},recognitionConfig:{...LOCAL_RECOGNITION_CONFIG,language:'en'}});input.modelRecipe={modelId:'tiny.en',modelRevision:manifest,configSha256:await localRecognitionConfigSha256(raw.scriptSha256,runtime)};
 const transcribe=await storeArtifact(new TextEncoder().encode(canonicalJSONString(raw))),context={input,nodeOutputs:{acquire:{sha256:sourceSha256,reference:sourceSha256},transcribe}},options={resolveArtifact,storeArtifact,resolveUnits:async()=>({scriptSha256:input.scriptSha256,units})};
 return {data,raw,units,context,options,async updateRaw(){context.nodeOutputs.transcribe=await storeArtifact(new TextEncoder().encode(canonicalJSONString(raw)));},async read(artifact){return JSON.parse(new TextDecoder().decode(await resolveArtifact(artifact)));}};
}
test('exact ordered matches retain real ASR spans but acceptance remains review-required',async()=>{const f=await fixture(),aligned=await createAlignmentAdapter(f.options).run(f.context),report=await f.read(aligned);assert(report.mappings.every(m=>m.status==='exact-candidate'));assert.deepEqual(report.mappings[0].candidateRange,{startSeconds:0,endSeconds:1.8,clockDomain:'decoded-source-samples-asr-estimate'});assert.deepEqual(report.acceptedPlaybackRanges,[]);const accepted=await createAcceptanceAdapter(f.options).run({...f.context,nodeOutputs:{...f.context.nodeOutputs,align:aligned}}),decision=await f.read(accepted);assert.equal(decision.status,'review-required');assert.equal(decision.alignmentSha256,aligned.sha256);assert(decision.reasons.includes('browser-clock-evidence-missing'));});
test('normalization is explicit and does not expand numbers or fuzzy spelling',()=>{assert.deepEqual(tokens('ＬＩＳＴＥＮ John’s 1:21–28'),['listen',"john's",'1','21','28']);assert.notDeepEqual(tokens('one'),tokens('1'));});
test('drift missing words repeated phrases and out of order never fabricate ranges',async()=>{for(const [texts,spoken,status] of [[['Listen now'],['Listen','later'],'unmatched'],[['listen'],['listen','listen'],'ambiguous-repeated-phrase'],[['later','first'],['first','later'],'out-of-order']]){const f=await fixture(texts,spoken),report=await f.read(await createAlignmentAdapter(f.options).run(f.context)),row=report.mappings.at(-1);assert.equal(row.status,status);assert.equal(row.candidateRange,undefined);}});
test('source script text and raw byte mismatches refuse alignment',async()=>{for(const mutate of [f=>f.context.nodeOutputs.acquire.sha256='c'.repeat(64),f=>f.units[0].text+=' changed',f=>f.data.set(f.context.nodeOutputs.transcribe.reference,new TextEncoder().encode('{}'))]){const f=await fixture();mutate(f);await assert.rejects(createAlignmentAdapter(f.options).run(f.context));}});
test('invalid word clock and bounded input refuse rather than invent timing',async()=>{for(const change of [r=>r.segments[0].words[0].start=-1,r=>r.segments[0].words[0].end=101,r=>r.segments[0].words[2].start=.2,r=>r.segments[0].words=Array.from({length:10001},()=>({word:'a',start:0,end:1}))]){const f=await fixture();change(f.raw);await f.updateRaw();await assert.rejects(createAlignmentAdapter(f.options).run(f.context));}});
test('zero duration estimate stays candidate and extra speech forces review reason',async()=>{const f=await fixture(['Listen'],['extra','Listen']);f.raw.segments[0].words[1].end=1;await f.updateRaw();const align=await createAlignmentAdapter(f.options).run(f.context),report=await f.read(align);assert.equal(report.mappings[0].status,'zero-duration-candidate');const decision=await f.read(await createAcceptanceAdapter(f.options).run({...f.context,nodeOutputs:{...f.context.nodeOutputs,align}}));assert.equal(decision.diagnostics.unassignedRecognizedTokens,1);assert.equal(decision.diagnostics.classification,'unclassified-context-or-drift');assert(decision.reasons.includes('unresolved-unit-correspondence'));});
test('acceptance cannot consume another consumer alignment or substituted store digest',async()=>{const f=await fixture(),align=await createAlignmentAdapter(f.options).run(f.context);await assert.rejects(createAcceptanceAdapter(f.options).run({input:{...f.context.input,passage:'other'},nodeOutputs:{...f.context.nodeOutputs,align}}));await assert.rejects(createAlignmentAdapter({...f.options,storeArtifact:async()=>({sha256:'d'.repeat(64),reference:'wrong'})}).run(f.context),/store-mismatch/);});

test('hash-valid same-source recognition from another model runtime language or settings refuses',async()=>{
 for(const change of [r=>r.model.id='other-model',r=>r.model.manifestSha256='e'.repeat(64),r=>r.model.files['model.bin'].bytes++,r=>r.runtime.numpy='changed',r=>r.runtime.extra='unexpected',r=>r.recognitionConfig.language='es',r=>r.recognitionConfig.beam_size=1,r=>r.recognitionConfig.initial_prompt='forced text',r=>r.model.cpuThreads=8,r=>r.scriptSha256='e'.repeat(64)]){const f=await fixture();change(f.raw);await f.updateRaw();await assert.rejects(createAlignmentAdapter(f.options).run(f.context),/recognition/);}
});

test('spoken prompt comparison is retained as review evidence with original raw words and no approved ranges',async()=>{
 const {createComparisonEvidenceAdapter}=await import('../../server/fia/preparation/executor/comparison-evidence.mjs');
 const f=await fixture(['1. Listen now'],['one','Listen','now']);
 const before=f.data.get(f.context.nodeOutputs.transcribe.reference).slice();
 const align=await createAlignmentAdapter(f.options).run(f.context),context={...f.context,nodeOutputs:{...f.context.nodeOutputs,align}};
 const contexts=[{activityId:'a0',script:'1. Listen now',context:{kind:'numbered-prompt-label',language:'eng',promptSpan:[0,13],labelSpan:[0,2],wordSpan:[0,1]}}];
 const comparisonAdapter=await createComparisonEvidenceAdapter({...f.options,contexts});
 const accepted=await createAcceptanceAdapter({...f.options,comparisonAdapter}).run(context),decision=await f.read(accepted);
 const evidence=await f.read(decision.diagnostics.comparisonEvidence),view=await f.read(evidence.wordView);
 assert.equal(evidence.comparisons[0].result.classification,'formatting-equivalent');
 assert.equal(evidence.rawRecognitionSha256,f.context.nodeOutputs.transcribe.sha256);assert.equal(evidence.alignmentSha256,align.sha256);
 assert.equal(decision.status,'review-required');assert.deepEqual(decision.acceptedPlaybackRanges,[]);
 assert(decision.reasons.includes('unresolved-unit-correspondence'));
 assert.equal(evidence.grantsAcceptance,false);assert.equal(evidence.timingValidated,false);
 assert.deepEqual(view.words,f.raw.segments[0].words);assert.deepEqual(view.wordOrigins,[{segmentIndex:0,wordIndex:0},{segmentIndex:0,wordIndex:1},{segmentIndex:0,wordIndex:2}]);
 assert.deepEqual(f.data.get(f.context.nodeOutputs.transcribe.reference),before);
 contexts[0].context.wordSpan=[1,2];
 const changedAdapter=await createComparisonEvidenceAdapter({...f.options,contexts});
 const changed=await f.read(await changedAdapter.run(context));assert.notEqual(changedAdapter.dependencySha256,comparisonAdapter.dependencySha256);assert.notEqual(changed.normalizationSha256,evidence.normalizationSha256);
 contexts[0].script='2. Listen now';const wrong=await createComparisonEvidenceAdapter({...f.options,contexts});await assert.rejects(wrong.run(context),/comparison-unit-binding/);
 assert.equal((await f.read(await comparisonAdapter.run(context))).normalizationSha256,evidence.normalizationSha256);
});

test('cached pipeline binds actual comparison context and reuses raw recognition and alignment',async()=>{
 const {createComparisonEvidenceAdapter}=await import('../../server/fia/preparation/executor/comparison-evidence.mjs');
 const {createPipeline}=await import('../../server/fia/preparation/executor/pipeline.mjs');
 const f=await fixture(['1. Listen now'],['one','Listen','now']);f.context.input.source={publisherId:'fixture',resourceId:'section',version:'v1'};
 const rows=new Map(),storage={async transaction(fn){return fn({get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v))});}},counts={};
 const retained=await f.options.storeArtifact(new TextEncoder().encode('fixture source'));f.context.nodeOutputs.acquire=retained;f.raw.source.sha256=retained.sha256;await f.updateRaw();
 const base={discover:{paid:false,run:async()=>retained},acquire:{paid:false,run:async()=>retained},transcribe:{paid:false,run:async()=>f.context.nodeOutputs.transcribe},align:createAlignmentAdapter(f.options)};
 const contexts=[{activityId:'a0',script:'1. Listen now',context:{kind:'numbered-prompt-label',language:'eng',promptSpan:[0,13],labelSpan:[0,2],wordSpan:[0,1]}}];
 async function pipeline(){const comparisonAdapter=await createComparisonEvidenceAdapter({...f.options,contexts}),adapters={...base,accept:createAcceptanceAdapter({...f.options,comparisonAdapter})};
  for(const [name,adapter] of Object.entries(adapters)){const run=adapter.run;adapters[name]={...adapter,run:async args=>{counts[name]=(counts[name]||0)+1;return run(args);}};}
  return createPipeline({storage,policyId:'comparison-integration-v1',adapters,verifyArtifact:f.options.resolveArtifact});
 }
 const first=await(await pipeline()).run(f.context.input);assert.equal(first.reason,'review-required');
 const warm=await(await pipeline()).run(f.context.input);assert.equal(warm.key,first.key);assert.equal(counts.accept,1);
 contexts[0].context.wordSpan=[1,2];
 const changed=await(await pipeline()).run(f.context.input);assert.notEqual(changed.key,first.key);assert.equal(changed.reason,'review-required');
 assert.deepEqual(counts,{discover:1,acquire:1,transcribe:1,align:1,accept:2});
});

test('comparison refuses missing or corrupt retained word views before publishing evidence',async()=>{
 const {createComparisonEvidenceAdapter}=await import('../../server/fia/preparation/executor/comparison-evidence.mjs');
 for(const corrupt of [false,true]){
  const f=await fixture(['1. Listen now'],['one','Listen','now']),align=await createAlignmentAdapter(f.options).run(f.context);
  const adapter=await createComparisonEvidenceAdapter({...f.options,contexts:[{activityId:'a0',script:'1. Listen now',context:{kind:'numbered-prompt-label',language:'eng',promptSpan:[0,13],labelSpan:[0,2],wordSpan:[0,1]}}],storeArtifact:async bytes=>{
   const artifact=await f.options.storeArtifact(bytes);if(JSON.parse(new TextDecoder().decode(bytes)).schema==='fia-comparison-word-view@1'){if(corrupt)f.data.set(artifact.reference,new TextEncoder().encode('{}'));else f.data.delete(artifact.reference);}return artifact;
  }});
  await assert.rejects(adapter.run({...f.context,nodeOutputs:{...f.context.nodeOutputs,align}}),/alignment-(bytes|artifact-hash)/);
 }
});
