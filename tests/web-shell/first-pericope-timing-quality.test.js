import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {auditFirstPericopeTiming,evaluateFirstGuideTiming} from '../../scripts/audit-first-pericope-timing.mjs';
import {validateTranscript} from '../../apps/web/src/lib/transcript.js';
const root=fileURLToPath(new URL('../..',import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(root+'/'+p));
const recorded=read('evidence/first-pericope/timing-quality.json');
const knownUntimed={
 'insufficient-asr-match':['S01-U001','S01-U002','S02-U003','S02-U004','S02-U005','S02-U009','S02-U010','S04-U014','S04-U016','S05-U019','S06-U006','S06-U008'],
 'outside-playback-range':['S01-U008','S02-U002','S02-U008','S03-U005','S03-U018','S03-U025','S04-U002','S04-U003','S04-U004','S04-U005','S04-U012','S04-U013','S05-U001','S05-U002','S05-U015','S05-U024'],
 'invalid-activity-word-times':['S02-U006','S02-U007','S02-U011','S03-U008','S03-U020','S03-U022','S03-U024','S04-U010','S04-U015','S05-U003','S05-U004','S05-U007','S05-U018','S05-U020','S05-U029','S05-U030','S05-U033','S05-U035','S05-U040','S05-U042']
};
function acceptedInput(){
 const row=recorded.rows.find(r=>r.activityId==='S01-U003'),v=row.variants.find(v=>v.quality===row.selectedQuality);
 const pack=read('apps/web/src/lib/pack.json'),a=pack.activities.find(a=>a.id===row.activityId),transcript=read('apps/web/public/transcripts/'+v.audioSha256+'.words.json');
 return {text:a.readingGroupId?a.sourceText:a.narration,activityId:a.id,transcript,range:v.runtimeRange,audioSha256:v.audioSha256,sourceAudioSha256:v.sourceAudioSha256,mapping:transcript.timingMapping};
}
test('committed111-route timing gate binds approved content and actual runtime predicates, preserving every explicit known untimed ID',()=>{
 const current=auditFirstPericopeTiming(root);
 assert.deepEqual(current,recorded,'Changing committed content requires explicit per-ID timing disposition, not schema-only acceptance');
 assert.equal(current.guideRoutes,111);assert.equal(current.accepted,63);assert.equal(current.untimed,48);
 assert.equal(new Set(current.rows.map(r=>r.activityId)).size,111);
 for(const [reason,ids] of Object.entries(knownUntimed))assert.deepEqual(current.rows.filter(r=>r.reason===reason).map(r=>r.activityId).sort(),[...ids].sort());
 for(const row of current.rows){
  assert.ok(row.variants.length,'every original recorded route has a checked delivery');
  for(const v of row.variants)assert.equal(v.sourceBindingVerified,true,'source rights/range/recording/mapping publication checks run');
  if(row.accepted){const v=row.variants.find(v=>v.quality===row.selectedQuality);assert.equal(v.schemaValid,true);assert.equal(v.status,'runtime-predicate-accepted');assert.ok(v.words>0);}
  else assert.ok(knownUntimed[row.reason].includes(row.activityId),'never silently bless a newly untimed route');
 }
 assert.equal(current.excludedDerivedResourceRoutes.length,9,'derived resource subroutes are not falsely counted as separately recorded guide units');
 assert.equal(current.routingScope.executedOriginalNativeMp3PlaybackPasses,0);
 assert.equal(current.routingScope.originalNativeMp3Routes.length,6);
 assert.ok(current.routingScope.originalNativeMp3Routes.every(r=>r.matchingRepositorySidecar===false&&r.wordTimingQualified===false));
 assert.equal(current.routingScope.firstMappingEvidence.sha256,'d631c18f5082f8e972752a09f631586faa6b5cfefaf947238c768b2aa66427a7');
 assert.equal(current.routingScope.firstMappingEvidence.sourceClockDomain,'decoded-pcm');
 assert.match(current.routingScope.firstMappingEvidence.method,/MP3 native clock excluded/);
 assert.equal(current.routingScope.wholeFileNativeEnded.wordTimingQualified,false);
});
test('schema-valid committed-word mutations fail the real ASR, range, timing and shown-text predicates',()=>{
 const valid=acceptedInput();assert.equal(evaluateFirstGuideTiming(valid).accepted,true);
 const low=structuredClone(valid);low.transcript.activities[low.activityId].matched=0;
 const bounds=structuredClone(valid);bounds.range.endSeconds=bounds.transcript.activities[bounds.activityId].endMs/1000-.001;
 const zero=structuredClone(valid);const first=zero.transcript.activities[zero.activityId].words[0];first.endMs=first.startMs;
 const stale=structuredClone(valid);stale.text='A different displayed narration entirely.';
 for(const [input,reason] of [[low,'insufficient-asr-match'],[bounds,'outside-playback-range'],[zero,'invalid-activity-word-times'],[stale,'displayed-text-token-or-offset-mismatch']]){
  assert.doesNotThrow(()=>validateTranscript(input.transcript),'schema validation alone misses this content defect');
  const checked=evaluateFirstGuideTiming(input);assert.equal(checked.accepted,false);assert.equal(checked.reason,reason);assert.equal(checked.schemaValid,true);
 }
});
test('missing, wrong-identity and whole-file playback remain explicit untimed dispositions',()=>{
 const valid=acceptedInput(),wrong=structuredClone(valid);wrong.transcript.audioSha256='f'.repeat(64);
 assert.doesNotThrow(()=>validateTranscript(wrong.transcript));assert.equal(evaluateFirstGuideTiming(wrong).reason,'sidecar-recording-or-source-identity');
 const wrongSource=structuredClone(valid);wrongSource.transcript.sourceAudioSha256='e'.repeat(64);assert.equal(evaluateFirstGuideTiming(wrongSource).accepted,false);
 const wrongClock=structuredClone(valid);wrongClock.mapping={scale:2,offsetSeconds:0};assert.equal(evaluateFirstGuideTiming(wrongClock).reason,'sidecar-clock-mapping-identity');
 const nativeMp3={...valid,audioSha256:valid.sourceAudioSha256};assert.equal(evaluateFirstGuideTiming(nativeMp3).reason,'sidecar-recording-or-source-identity','delivery words cannot be reused as original-native-MP3 timing');
 assert.equal(evaluateFirstGuideTiming({...valid,transcript:null}).reason,'missing-sidecar');
 const missing=structuredClone(valid);delete missing.transcript.activities[missing.activityId];assert.equal(evaluateFirstGuideTiming(missing).reason,'missing-activity-map');
 assert.equal(evaluateFirstGuideTiming({...valid,playback:'whole-file-native-ended'}).reason,'whole-file-native-ended-is-not-word-qualified');
});
