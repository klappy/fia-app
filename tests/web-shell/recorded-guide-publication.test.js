import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyRecordedGuideReplacement} from '../../scripts/recorded-guide-publication.mjs';
import {validateDelivery} from '../../apps/web/src/lib/media-delivery.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(){
 const evidence=new Map(),put=value=>{const bytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value)),sha=hash(bytes);evidence.set(sha,bytes);return sha;};
 const pack={activities:[{id:'U1',sourceUnitId:'U1',kind:'guide',sourceText:'Welcome.',audioSrc:'/audio/source/U1.mp3'}]},descriptor={id:'eng.MRK-1-1-13',revision:'a'.repeat(64)},file={path:'/audio/source/U1.mp3',group:'audio',sha256:hash('logical clip'),bytes:12};
 const script={fileSha256:put('script file'),contentSha256:put('Welcome.'),repository:'owner/repo',commit:'c'.repeat(40),path:'guide.md'};
 const recording={url:'https://publisher.example/guide.mp3',sha256:'d'.repeat(64),bytes:100,duration:100,publisherStepVersion:'1',rightsEvidenceSha256:null};
 recording.rightsEvidenceSha256=put({status:'accepted',recordingSha256:recording.sha256,recordingUrl:recording.url});
 const transcript={sha256:put('Welcome.'),wordTimestampsSha256:null,method:'ASR verbatim recognizer output',modelRevision:'model-1',clockDomain:'recording-seconds',verbatim:true};
 transcript.wordTimestampsSha256=put({recordingSha256:recording.sha256,transcriptSha256:transcript.sha256,clockDomain:transcript.clockDomain,words:[{text:'Welcome.',startSeconds:2,endSeconds:3}]});
 const drift={reportSha256:put({differences:[]}),scriptSha256:script.contentSha256,transcriptSha256:transcript.sha256,reviewEvidenceSha256:null};
 drift.reviewEvidenceSha256=put({status:'accepted',reportSha256:drift.reportSha256,scriptSha256:script.contentSha256,transcriptSha256:transcript.sha256});
 const mapping={id:'range-1',activityId:'U1',sourceTextSha256:hash('Welcome.'),logicalAudio:{path:file.path,sha256:file.sha256,bytes:file.bytes},wordSpan:{first:0,lastExclusive:1},sourceRange:{startSeconds:1.9,endSeconds:3.1,clockDomain:transcript.clockDomain}};
 const acceptance={status:'accepted',recipeRevision:'recipe-1',evidenceSha256:put({status:'accepted',recipeRevision:'recipe-1',packId:descriptor.id,presentationRevision:descriptor.revision,mapping,script,recording,transcript,drift})};
 const ledger={schema:'fia-recorded-guide-ranges@1',packId:descriptor.id,presentationRevision:descriptor.revision,script,recording,transcript,drift,mappings:[{...mapping,acceptance}]};
 const delivery={kind:'audio',status:'transformed',format:'opus',preset:'voice',q:'medium',url:'https://transcode.klappy.dev/audio/preset=voice,q=medium,f=opus/'+recording.url,sha256:'e'.repeat(64),bytes:20,mime:'audio/ogg',duration:100.012};
 const timing={status:'verified',sourceAudioSha256:recording.sha256,deliveryAudioSha256:delivery.sha256,method:'measured alignment',evidence:'measured fixture',mapping:{scale:1,offsetSeconds:.012},mappingEvidenceSha256:null};
 timing.mappingEvidenceSha256=put({status:'accepted',sourceAudioSha256:recording.sha256,deliveryAudioSha256:delivery.sha256,mapping:timing.mapping,sourceClockDomain:transcript.clockDomain,deliveryDuration:delivery.duration});
 const entry={path:file.path,source:{url:recording.url,sha256:recording.sha256,bytes:recording.bytes},delivery,timing,audioReplacement:{ledgerEntryId:'range-1',logicalSource:{sha256:file.sha256,bytes:file.bytes}},playbackRange:{startSeconds:1.9+.012,endSeconds:3.1+.012}};
 return {entry,ledger,pack,descriptor,file,readEvidence:sha=>evidence.get(sha),evidence};
}
test('accepted original recording has separate logical identity and measured delivery range',()=>{const f=fixture(),out=verifyRecordedGuideReplacement(f);assert.equal(out.logicalSourceSha256,f.file.sha256);assert.equal(out.sourceBytes,100);assert.deepEqual(out.playbackRange,f.entry.playbackRange);});
for(const [name,mutate] of [
 ['unaccepted range',f=>f.ledger.mappings[0].acceptance.status='candidate'],
 ['script drift identity',f=>f.ledger.drift.scriptSha256='f'.repeat(64)],
 ['changed logical source',f=>f.file.sha256='f'.repeat(64)],
 ['changed activity text',f=>f.pack.activities[0].sourceText='Different.'],
 ['changed source clock',f=>f.ledger.mappings[0].sourceRange.clockDomain='other'],
 ['unmeasured range',f=>f.entry.playbackRange.startSeconds=0],
 ['out of duration',f=>f.entry.playbackRange.endSeconds=101],
 ['tampered evidence bytes',f=>f.evidence.set(f.ledger.transcript.wordTimestampsSha256,Buffer.from('{}'))],
 ['extra nested field',f=>f.ledger.mappings[0].wordSpan.other=true],
 ['unreviewed mapping change',f=>f.ledger.mappings[0].sourceRange.startSeconds=1],
])test('rejects '+name,()=>{const f=fixture();mutate(f);assert.throws(()=>verifyRecordedGuideReplacement(f));});
test('schema4 validates variant range without accepting schema3 audio replacements',()=>{
 const f=fixture(),entry={...f.entry,defaultSize:'medium',variants:{medium:{delivery:f.entry.delivery,timing:f.entry.timing,playbackRange:f.entry.playbackRange}}};
 const sidecar={schema:4,packId:f.descriptor.id,presentationRevision:f.descriptor.revision,recipeRevision:'recipe',sourceLedger:{url:'/content/video-sources/'+ '1'.repeat(64)+'.json',sha256:'1'.repeat(64),bytes:10},recordingLedger:{url:'/content/recording-sources/'+'2'.repeat(64)+'.json',sha256:'2'.repeat(64),bytes:10},entries:[entry]};
 assert.equal(validateDelivery(sidecar,{packId:f.descriptor.id,presentationRevision:f.descriptor.revision}),sidecar);
 const legacy={...sidecar,schema:3};delete legacy.recordingLedger;assert.throws(()=>validateDelivery(legacy,{packId:f.descriptor.id,presentationRevision:f.descriptor.revision}));
 const bad=structuredClone(sidecar);bad.entries[0].variants.medium.playbackRange={startSeconds:1.912,endSeconds:90};assert.throws(()=>validateDelivery(bad,{packId:f.descriptor.id,presentationRevision:f.descriptor.revision}));
});
test('actual finalizer carries schema4 original ranges into every selected manifest member',async()=>{
 const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,cpSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFileSync}=await import('node:child_process');
 const root=mkdtempSync(join(tmpdir(),'fia-recorded-finalizer-')),write=(path,bytes)=>{const full=join(root,path);mkdirSync(join(full,'..'),{recursive:true});writeFileSync(full,bytes);};
 try{
  const f=fixture(),entry={...f.entry,defaultSize:'medium',variants:{medium:{delivery:f.entry.delivery,timing:f.entry.timing,playbackRange:f.entry.playbackRange}}};
  const ledgerBytes=Buffer.from(JSON.stringify(f.ledger)),videoBytes=Buffer.from(JSON.stringify({schema:1,entries:[]}));
  const sidecar={schema:4,packId:f.descriptor.id,presentationRevision:f.descriptor.revision,recipeRevision:'recipe',sourceLedger:{url:`/content/video-sources/${hash(videoBytes)}.json`,sha256:hash(videoBytes),bytes:videoBytes.length},recordingLedger:{url:`/content/recording-sources/${hash(ledgerBytes)}.json`,sha256:hash(ledgerBytes),bytes:ledgerBytes.length},entries:[entry]};
  const bytes=Buffer.from(JSON.stringify(sidecar)),descriptor={...f.descriptor,presentation:{url:'/content/packs/fixture.json'}};
  write('dist/index.html','app');write('dist/content/registry.json',JSON.stringify({packs:[descriptor]}));write('dist'+descriptor.presentation.url,JSON.stringify({...f.pack,assets:{}}));write('dist'+sidecar.sourceLedger.url,videoBytes);write('dist'+sidecar.recordingLedger.url,ledgerBytes);write(`dist/content/delivery/${descriptor.id}/${hash(bytes)}.json`,bytes);write('dist'+f.entry.path,'logical clip');
  for(const [sha,body] of f.evidence)write(`dist/content/recording-evidence/${sha}.json`,body);
  write('apps/web/public/sw.js',readFileSync(new URL('../../apps/web/public/sw.js',import.meta.url)));cpSync(new URL('../../apps/web/docs',import.meta.url),join(root,'apps/web/docs'),{recursive:true});
  execFileSync(process.execPath,[new URL('../../scripts/finalize-build.mjs',import.meta.url).pathname],{cwd:root,stdio:'pipe'});
  const manifest=JSON.parse(readFileSync(join(root,`dist/offline/${descriptor.id}.json`))),file=manifest.files.find(x=>x.path===entry.path);
  assert.deepEqual(file.playbackRange,entry.playbackRange);assert.deepEqual(file.variants.medium.playbackRange,entry.playbackRange);assert.equal(file.sourceSha256,f.ledger.recording.sha256);assert.equal(file.logicalSourceSha256,hash('logical clip'));assert.equal(file.recordingLedgerSha256,hash(ledgerBytes));assert(manifest.files.some(x=>x.path===sidecar.recordingLedger.url));
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('explicit discussion narration is supported without changing completion behavior',()=>{const f=fixture();f.pack.activities[0].kind='discussion';f.pack.activities[0].completion='manual';assert.doesNotThrow(()=>verifyRecordedGuideReplacement(f));assert.equal(f.pack.activities[0].completion,'manual');f.pack.activities[0].kind='scripture';assert.throws(()=>verifyRecordedGuideReplacement(f));});
test('ledger rejects reordered or overlapping accepted recording ranges and word spans',()=>{
 for(const mode of ['reversed','range-overlap','word-overlap']){
  const f=fixture(),put=value=>{const bytes=Buffer.from(JSON.stringify(value)),sha=hash(bytes);f.evidence.set(sha,bytes);return sha;};
  const words={recordingSha256:f.ledger.recording.sha256,transcriptSha256:f.ledger.transcript.sha256,clockDomain:f.ledger.transcript.clockDomain,words:[{text:'Welcome.',startSeconds:2,endSeconds:3},{text:'Again.',startSeconds:5,endSeconds:6}]};
  f.ledger.transcript.wordTimestampsSha256=put(words);
  f.pack.activities.push({id:'U2',sourceUnitId:'U2',kind:'discussion',sourceText:'Again.',audioSrc:'/audio/source/U2.mp3',completion:'manual'});
  const second={...structuredClone(f.ledger.mappings[0]),id:'range-2',activityId:'U2',sourceTextSha256:hash('Again.'),logicalAudio:{path:'/audio/source/U2.mp3',sha256:'9'.repeat(64),bytes:10},wordSpan:{first:1,lastExclusive:2},sourceRange:{startSeconds:4.9,endSeconds:6.1,clockDomain:words.clockDomain}};
  if(mode==='range-overlap')second.sourceRange.startSeconds=3;
  if(mode==='word-overlap'){second.wordSpan.first=0;second.sourceRange.startSeconds=1.9;}
  f.ledger.mappings.push(second);if(mode==='reversed')f.ledger.mappings.reverse();
  for(const row of f.ledger.mappings){const {acceptance,...mapping}=row;row.acceptance.evidenceSha256=put({status:'accepted',recipeRevision:acceptance.recipeRevision,packId:f.descriptor.id,presentationRevision:f.descriptor.revision,mapping,script:f.ledger.script,recording:f.ledger.recording,transcript:f.ledger.transcript,drift:f.ledger.drift});}
  assert.throws(()=>verifyRecordedGuideReplacement(f),undefined,mode);
 }
});

test('source range must contain every spanned word even when recognizer word ends overlap',()=>{
 const f=fixture(),put=value=>{const bytes=Buffer.from(JSON.stringify(value)),sha=hash(bytes);f.evidence.set(sha,bytes);return sha;};
 const words={recordingSha256:f.ledger.recording.sha256,transcriptSha256:f.ledger.transcript.sha256,clockDomain:f.ledger.transcript.clockDomain,words:[{text:'Long',startSeconds:2,endSeconds:9},{text:'word',startSeconds:2.5,endSeconds:3}]};
 f.ledger.transcript.wordTimestampsSha256=put(words);const row=f.ledger.mappings[0];row.wordSpan.lastExclusive=2;
 const {acceptance,...mapping}=row;row.acceptance.evidenceSha256=put({status:'accepted',recipeRevision:acceptance.recipeRevision,packId:f.descriptor.id,presentationRevision:f.descriptor.revision,mapping,script:f.ledger.script,recording:f.ledger.recording,transcript:f.ledger.transcript,drift:f.ledger.drift});
 assert.throws(()=>verifyRecordedGuideReplacement(f),/Invalid or unaccepted recorded guide range/);
});

test('multiple source ledgers resolve explicit identities and reject duplicate unknown or unused references',()=>{
 const f=fixture(),entry={...f.entry,defaultSize:'medium',variants:{medium:{delivery:f.entry.delivery,timing:f.entry.timing,playbackRange:f.entry.playbackRange}}};
 const ref=n=>({url:`/content/recording-sources/${n.repeat(64)}.json`,sha256:n.repeat(64),bytes:10});
 const side={schema:4,packId:f.descriptor.id,presentationRevision:f.descriptor.revision,recipeRevision:'recipe',sourceLedger:{...ref('1'),url:`/content/video-sources/${'1'.repeat(64)}.json`},recordingLedger:ref('2'),recordingLedgers:[ref('3')],entries:[entry]};entry.audioReplacement.recordingLedgerSha256='3'.repeat(64);
 const identity={packId:f.descriptor.id,presentationRevision:f.descriptor.revision};assert.equal(validateDelivery(side,identity),side);
 for(const mutate of [s=>s.recordingLedgers=null,s=>s.entries[0].audioReplacement.recordingLedgerSha256='',s=>s.entries[0].audioReplacement.recordingLedgerSha256=null,s=>s.recordingLedgers.push(ref('2')),s=>s.entries[0].audioReplacement.recordingLedgerSha256='4'.repeat(64),s=>delete s.entries[0].audioReplacement.recordingLedgerSha256]){const bad=structuredClone(side);mutate(bad);assert.throws(()=>validateDelivery(bad,identity));}
});
test('preserved zero-duration ASR points are not fabricated intervals; reversed evidence fails',()=>{
 for(const end of [2,1.9]){const f=fixture(),put=value=>{const b=Buffer.from(JSON.stringify(value)),s=hash(b);f.evidence.set(s,b);return s;};
 f.ledger.transcript.wordTimestampsSha256=put({recordingSha256:f.ledger.recording.sha256,transcriptSha256:f.ledger.transcript.sha256,clockDomain:f.ledger.transcript.clockDomain,words:[{text:'Welcome.',startSeconds:2,endSeconds:end}]});
 const row=f.ledger.mappings[0],{acceptance,...mapping}=row;row.acceptance.evidenceSha256=put({status:'accepted',recipeRevision:acceptance.recipeRevision,packId:f.descriptor.id,presentationRevision:f.descriptor.revision,mapping,script:f.ledger.script,recording:f.ledger.recording,transcript:f.ledger.transcript,drift:f.ledger.drift});
 if(end===2)assert.doesNotThrow(()=>verifyRecordedGuideReplacement(f));else assert.throws(()=>verifyRecordedGuideReplacement(f));}
});
