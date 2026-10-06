import test from 'node:test';import assert from 'node:assert/strict';
import {sha256,canonicalJSONString} from '../../server/fia/preparation/contract.mjs';
import {createAlignmentAdapter,tokens} from '../../server/fia/preparation/executor/alignment.mjs';
import {LOCAL_RECOGNITION_CONFIG,localRecognitionConfigSha256} from '../../server/fia/preparation/executor/recognition-identity.mjs';
import {classifyUnitEligibility} from '../../server/fia/preparation/executor/per-unit-eligibility.mjs';
async function fixture(texts=['Listen now','Discuss together'],spoken=['Listen','now','Discuss','together']){
 const data=new Map(),storeArtifact=async bytes=>{const digest=await sha256(bytes);data.set(digest,bytes.slice());return {sha256:digest,reference:digest};},resolveArtifact=async artifact=>data.get(artifact.reference)?.slice(),input={packId:'eng.MRK-fixture',book:'MRK',language:'eng',edition:'fixture',passage:'1:21-28',resource:'S01',policyRevision:'fixture@1',scriptSha256:'a'.repeat(64)},sourceSha256='b'.repeat(64);
 const units=await Promise.all(texts.map(async(text,i)=>({activityId:`a${i}`,sourceUnitId:`u${i}`,sourceTextSha256:await sha256(text),text})));
 const raw={schema:'fia-local-raw-recognition@1',status:'candidate',source:{sha256:sourceSha256},durationSeconds:100,segments:[{words:spoken.map((word,i)=>({word,start:i,end:i+.8}))}]};
 const runtime={python:'fixture',av:'fixture',ctranslate2:'fixture','faster-whisper':'fixture',numpy:'fixture'},files={'model.bin':{sha256:'c'.repeat(64),bytes:10}},manifest=await sha256(canonicalJSONString(files));
 Object.assign(raw,{runtime,scriptSha256:'d'.repeat(64),model:{id:'tiny.en',manifestSha256:manifest,files,device:'cpu',computeType:'int8',cpuThreads:4},recognitionConfig:{...LOCAL_RECOGNITION_CONFIG,language:'en'}});input.modelRecipe={modelId:'tiny.en',modelRevision:manifest,configSha256:await localRecognitionConfigSha256(raw.scriptSha256,runtime)};
 const transcribe=await storeArtifact(new TextEncoder().encode(canonicalJSONString(raw))),context={input,nodeOutputs:{acquire:{sha256:sourceSha256,reference:sourceSha256},transcribe}},options={resolveArtifact,storeArtifact,resolveUnits:async()=>({scriptSha256:input.scriptSha256,units})};
 return {data,raw,units,context,options,async updateRaw(){context.nodeOutputs.transcribe=await storeArtifact(new TextEncoder().encode(canonicalJSONString(raw)));},async read(artifact){return JSON.parse(new TextDecoder().decode(await resolveArtifact(artifact)));}};
}

async function prepare(){
 const f=await fixture(); const alignment=await createAlignmentAdapter(f.options).run(f.context);
 const args={input:f.context.input,source:f.context.nodeOutputs.acquire,rawRecognition:f.context.nodeOutputs.transcribe,alignment,script:{scriptSha256:f.context.input.scriptSha256,units:f.units},resolveArtifact:f.options.resolveArtifact};
 return {f,args};
}
test('exact correspondence has specific absent evidence and unsupported policies, never manual mandate',async()=>{
 const {args}=await prepare(),r=await classifyUnitEligibility(args);
 assert.equal(r.status,'assessed');assert.equal(r.units.length,2);
 for(const u of r.units){assert.equal(u.correspondence,'exact-candidate');assert.equal(u.evidenceStatus,'missing');assert(u.reasons.includes('signal-evidence-missing'));assert(u.reasons.includes('browser-evidence-missing'));assert(u.reasons.includes('recognition-calibration-policy-unavailable'));assert.equal(u.qualifiedForPlayback,false);assert.deepEqual(u.acceptedPlaybackRanges,[]);}
 assert(!JSON.stringify(r).includes('review-required'));
});
for(const [name,mutate] of Object.entries({missingUnit:a=>a.script.units.pop(),duplicateUnit:a=>a.script.units.push(a.script.units[0]),reorder:a=>a.script.units.reverse(),changedText:a=>a.script.units[0].text+=' changed',changedModel:a=>a.input.modelRecipe.modelId='other',wrongSource:a=>a.source.sha256='f'.repeat(64),wrongConsumer:a=>a.input.resource='other'}))test(name,async()=>{const {args}=await prepare();mutate(args);const r=await classifyUnitEligibility(args);assert.equal(r.status,'rejected');assert.equal(r.qualifiedForPlayback,false);assert.deepEqual(r.units,[]);});
test('forged exact span with a valid artifact hash is rejected by recomputation',async()=>{const {f,args}=await prepare(),a=await f.read(args.alignment);a.mappings[0].candidateRange.endSeconds=99;args.alignment=await f.options.storeArtifact(new TextEncoder().encode(canonicalJSONString(a)));assert.equal((await classifyUnitEligibility(args)).status,'rejected');});
test('retained raw byte corruption is rejected',async()=>{const {f,args}=await prepare();f.data.set(args.rawRecognition.reference,new TextEncoder().encode('{}'));assert.equal((await classifyUnitEligibility(args)).status,'rejected');});
test('unmatched neighbor does not erase exact unit and unassigned words are not declared drift',async()=>{const f=await fixture(['Listen now','missing'],['Intro','Listen','now','closing']),alignment=await createAlignmentAdapter(f.options).run(f.context);const r=await classifyUnitEligibility({input:f.context.input,source:f.context.nodeOutputs.acquire,rawRecognition:f.context.nodeOutputs.transcribe,alignment,script:{scriptSha256:f.context.input.scriptSha256,units:f.units},resolveArtifact:f.options.resolveArtifact});assert.equal(r.status,'assessed');assert.equal(r.units[0].correspondence,'exact-candidate');assert.equal(r.units[1].correspondence,'unmatched');assert.equal(r.diagnostics.unassignedRecognizedTokens,2);assert.equal(r.diagnostics.classification,'unclassified-context-or-drift');});
test('unknown signal units fail closed before quality joining',async()=>{const {f,args}=await prepare();args.signal=await f.options.storeArtifact(new TextEncoder().encode(JSON.stringify({units:[{activityId:'unknown'}]})));assert((await classifyUnitEligibility(args)).reasons.includes('signal-unit-ledger-mismatch'));});
test('caller qualification flags never grant playback',async()=>{const {args}=await prepare();args.qualified=true;args.approved=true;const r=await classifyUnitEligibility(args);assert.equal(r.qualifiedForPlayback,false);assert(r.units.every(u=>u.qualification==='unsupported'));});

const H=n=>String(n).repeat(64);
function data(){
 const row={activityId:'u',sourceUnitId:'u',sourceTextSha256:H(4),status:'exact-candidate',matchCount:1,wordSpan:{first:0,lastExclusive:1},candidateRange:{startSeconds:1,endSeconds:2}};
 const edge=(start,end)=>{const q={startSample:start,endSampleExclusive:end,startSeconds:start/16000,endSeconds:end/16000,maximum10msDbfs:-60};return {state:'measured',quietRuns:[q],selectedQuietRun:q,cutSample:(start+end)/2,cutSeconds:(start+end)/32000,leftMarginSeconds:(end-start)/32000,rightMarginSeconds:(end-start)/32000,centered60msDbfs:-60,searchInterval:{startSeconds:start/16000,endSeconds:end/16000}};};
 const u={...row,state:'measured',envelope:{startSeconds:1,endSeconds:2},left:edge(8000,12000),right:edge(36000,40000)};
 u.left.searchInterval.endSeconds=1;u.right.searchInterval.startSeconds=2;
 const anchors=Array.from({length:9},(_,i)=>({percent:(i+1)*10,anchorSample:(i+1)*4800}));
 const a={schema:'fia-exact-word-alignment@1',status:'candidate',normalizationRevision:'unicode-nfkc-lowercase-apostrophe@1',sourceSha256:H(1),rawRecognitionSha256:H(2),scriptSha256:H(3),mappings:[row,{...row,activityId:'v',sourceUnitId:'v',status:'unmatched'}]};
 const s={schema:'fia-signal-boundary-measurements@1',status:'candidate',sourceSha256:H(1),rawRecognitionSha256:H(2),guideScriptSha256:H(3),scriptSha256:H(5),pcm:{sampleRate:16000,samples:48000,sha256:H(6)},policy:{windowSamples:160,minimumQuietSamples:960,thresholdDbfsExclusive:-45,selection:'single-qualifying-run-only-midpoint'},sourceMetadata:{sampleRate:48000,channels:1,codec:'mp3float'},runtime:{av:'19.0.1'},clockLandmarks:anchors,units:[u,{activityId:'v',sourceUnitId:'v',sourceTextSha256:H(4),state:'blocked',reason:'no-unique-exact-mapping'}]};
 const b={schema:'fia-browser-clock-measurement@1',status:'measurement-complete-not-acceptance',sourceSha256:H(1),nativeClockMappingQualified:false,userAgent:'test',platform:'test',nativeDuration:3,nativeMinusDecodedDuration:0,pcm:{sampleRate:16000,samples:48000,duration:3,sha256:H(7)},clockLandmarks:anchors.map(x=>({...x,bestShiftSamples:0,normalizedRmsResidual:0,alternativeOutsideOneMs:{shift:17,error:.1}})),cuts:['left','right'].map(edge=>({activityId:'u',edge,cutSeconds:u[edge].cutSeconds,sourceQuietRun:u[edge].selectedQuietRun,centered60msDbfs:-60})),trials:[1,1.5].flatMap(rate=>[1,2,3].map(repeat=>({activityId:'u',rate,repeat,start:.625,end:2.375,seekError:0,stopTime:2.38,overshoot:.005,visibility:'visible',visibilityChanged:false})))};
 return {a,s,b};
}

test('complete joined measurements are explicitly not playback qualification',async()=>{
 const f=await fixture(['Listen now'],['Listen','now']);
 f.raw.durationSeconds=3;f.raw.segments[0].words=[{word:'Listen',start:1,end:1.4},{word:'now',start:1.5,end:2}];await f.updateRaw();
 const alignment=await createAlignmentAdapter(f.options).run(f.context),a=await f.read(alignment),d=data(),row=a.mappings[0];
 const put=o=>f.options.storeArtifact(new TextEncoder().encode(canonicalJSONString(o)));
 Object.assign(d.s,{sourceSha256:f.context.nodeOutputs.acquire.sha256,rawRecognitionSha256:f.context.nodeOutputs.transcribe.sha256,guideScriptSha256:f.context.input.scriptSha256,alignmentSha256:alignment.sha256});
 d.s.units=[{...d.s.units[0],activityId:row.activityId,sourceUnitId:row.sourceUnitId,sourceTextSha256:row.sourceTextSha256,wordSpan:row.wordSpan}];
 const signal=await put(d.s);Object.assign(d.b,{sourceSha256:f.context.nodeOutputs.acquire.sha256,measurementSha256:signal.sha256});
 for(const x of [...d.b.trials,...d.b.cuts])x.activityId=row.activityId;
 const browser=await put(d.b),r=await classifyUnitEligibility({input:f.context.input,source:f.context.nodeOutputs.acquire,rawRecognition:f.context.nodeOutputs.transcribe,alignment,script:{scriptSha256:f.context.input.scriptSha256,units:f.units},signal,browser,resolveArtifact:f.options.resolveArtifact});
 assert.equal(r.status,'assessed');assert.equal(r.units[0].evidenceStatus,'complete');assert.equal(r.units[0].qualifiedForPlayback,false);assert.equal(r.units[0].qualification,'unsupported');assert.deepEqual(r.units[0].reasons,['recognition-calibration-policy-unavailable','native-clock-qualification-policy-unavailable','quiet-boundary-qualification-policy-unavailable']);
});
