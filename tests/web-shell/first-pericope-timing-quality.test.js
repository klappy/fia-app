// Re-cut 2026-11-09 on the captain's order ("Highlighting should be antifragile and always highlight the closest matches to
// create the best UX, previous releases refused highlight features on sections there is no perfect alignment"): the 68/43
// audit became a 111/111 audit with a tier per route. Every id still has an explicit disposition; a route that moves tier,
// or any new untimed route, fails here instead of passing silently.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {auditFirstPericopeTiming,evaluateFirstGuideTiming} from '../../scripts/audit-first-pericope-timing.mjs';
import {validateTranscript} from '../../apps/web/src/lib/transcript.js';
const root=fileURLToPath(new URL('../..',import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(root+'/'+p));
const recorded=read('evidence/first-pericope/timing-quality.json');
const knownTiers={
 // The 12 range cases (first recognised word 30–440 ms before the authored clip start, or the stop-before-the-next-sound tail
 // ending the runtime range below the map's endMs) and the zero-duration cases. Codex P2 on #354: a zero-duration run with no
 // gap between its neighbours now borrows time from them instead of keeping a zero-length stamp, so the six routes that used
 // to "fit without moving a word" (S02-U006, S02-U011, S04-U015, S05-U004, S05-U030, S05-U035) moved exact → clamped.
 clamped:['S02-U002','S02-U006','S02-U007','S02-U008','S02-U011','S03-U005','S03-U008','S03-U018','S03-U020','S03-U022','S03-U024','S03-U025','S04-U002','S04-U003','S04-U004','S04-U013','S04-U015','S05-U001','S05-U003','S05-U004','S05-U007','S05-U015','S05-U018','S05-U020','S05-U024','S05-U029','S05-U030','S05-U033','S05-U035','S05-U040','S05-U042'],
 // Under the 70 % heard-token floor: the generator's interpolation between heard anchors is the closest match the evidence allows.
 // S01-U001 and S01-U002 left this list on 2026-11-09 (I1b: maps regenerated from the recognised words of the source evidence).
 approximate:['S02-U003','S02-U004','S02-U005','S02-U009','S02-U010','S04-U014','S04-U016','S05-U019','S06-U006','S06-U008']
};
const knownUntimed={};
function acceptedInput(id='S01-U003'){
 const row=recorded.rows.find(r=>r.activityId===id),v=row.variants.find(v=>v.quality===row.selectedQuality);
 const pack=read('apps/web/src/lib/pack.json'),a=pack.activities.find(a=>a.id===row.activityId),transcript=read('apps/web/public/transcripts/'+v.audioSha256+'.words.json');
 return {text:a.readingGroupId?a.sourceText:a.narration,activityId:a.id,transcript,range:v.runtimeRange,audioSha256:v.audioSha256,sourceAudioSha256:v.sourceAudioSha256,mapping:transcript.timingMapping};
}
test('committed111-route timing gate binds approved content and actual runtime predicates: every route timed, every tier explicit per id',()=>{
 const current=auditFirstPericopeTiming(root);
 assert.deepEqual(current,recorded,'Changing committed content requires explicit per-ID timing disposition, not schema-only acceptance');
 assert.equal(current.guideRoutes,111);assert.equal(current.accepted,111);assert.equal(current.untimed,0);
 assert.deepEqual(current.byReason,{'runtime-predicate-accepted':111});
 assert.deepEqual(current.byTier,{exact:70,clamped:31,approximate:10});
 assert.equal(new Set(current.rows.map(r=>r.activityId)).size,111);
 for(const [tier,ids] of Object.entries(knownTiers))assert.deepEqual(current.rows.filter(r=>r.tier===tier).map(r=>r.activityId).sort(),[...ids].sort(),tier);
 const exact=current.rows.filter(r=>r.tier==='exact').map(r=>r.activityId);
 assert.equal(exact.length,70);for(const id of ['S01-U001','S01-U002','S01-U003','S01-U008'])assert.ok(exact.includes(id),id+' is exact');
 for(const row of current.rows){
  assert.ok(row.variants.length,'every original recorded route has a checked delivery');
  for(const v of row.variants)assert.equal(v.sourceBindingVerified,true,'source rights/range/recording/mapping publication checks run');
  assert.ok(row.accepted,'never silently leave a route untimed: '+row.activityId+' '+row.reason);
  assert.ok(!(row.activityId in knownUntimed));
  const v=row.variants.find(v=>v.quality===row.selectedQuality);assert.equal(v.schemaValid,true);assert.equal(v.status,'runtime-predicate-accepted');assert.ok(v.words>0);assert.equal(v.tier,row.tier);
  assert.equal(v.fitted.underMatchFloor,row.tier==='approximate',row.activityId+' floor');
  if(row.tier==='clamped')assert.ok(v.fitted.outsidePlaybackRange||v.fitted.respacedZeroDurationWords>0,row.activityId+' clamped for a reason');
  if(row.tier==='exact')assert.deepEqual(v.fitted,{underMatchFloor:false,outsidePlaybackRange:false,clampedWords:0,respacedZeroDurationWords:0},row.activityId+' exact means untouched');
 }
 // I1b: the first two screens are exact from the regenerated maps (recording-evidence 315fde5b…, accepted spans 9–24 and 24–51).
 for(const [id,matched,total] of [['S01-U001',10,12],['S01-U002',23,24]]){const v=current.rows.find(r=>r.activityId===id).variants[0];assert.equal(v.matched,matched,id);assert.equal(v.total,total,id);}
 assert.equal(current.excludedDerivedResourceRoutes.length,9,'derived resource subroutes are not falsely counted as separately recorded guide units');
 assert.equal(current.routingScope.executedOriginalNativeMp3PlaybackPasses,0);
 assert.equal(current.routingScope.originalNativeMp3Routes.length,6);
 assert.ok(current.routingScope.originalNativeMp3Routes.every(r=>r.matchingRepositorySidecar===false&&r.wordTimingQualified===false));
 assert.equal(current.routingScope.firstMappingEvidence.sha256,'d631c18f5082f8e972752a09f631586faa6b5cfefaf947238c768b2aa66427a7');
 assert.equal(current.routingScope.firstMappingEvidence.sourceClockDomain,'decoded-pcm');
 assert.match(current.routingScope.firstMappingEvidence.method,/MP3 native clock excluded/);
 assert.equal(current.routingScope.wholeFileNativeEnded.wordTimingQualified,false);
 assert.match(current.scope,/tier/);
});
test('schema-valid committed-word mutations are fitted at a named tier, never silently exact; shown-text and malformed maps stay untimed',()=>{
 const valid=acceptedInput();const exact=evaluateFirstGuideTiming(valid);assert.equal(exact.accepted,true);assert.equal(exact.tier,'exact');
 const low=structuredClone(valid);low.transcript.activities[low.activityId].matched=0;
 const bounds=structuredClone(valid);bounds.range.endSeconds=bounds.transcript.activities[bounds.activityId].endMs/1000-.001;
 const zero=structuredClone(valid);const first=zero.transcript.activities[zero.activityId].words[0];first.endMs=first.startMs;
 for(const [input,tier,fit] of [[low,'approximate',{underMatchFloor:true}],[bounds,'clamped',{outsidePlaybackRange:true}],[zero,'clamped',{respacedZeroDurationWords:1}]]){
  assert.doesNotThrow(()=>validateTranscript(input.transcript));
  const checked=evaluateFirstGuideTiming(input);assert.equal(checked.accepted,true);assert.equal(checked.tier,tier);assert.equal(checked.schemaValid,true);
  for(const [k,v] of Object.entries(fit))assert.equal(checked.fitted[k],v,k);
 }
 const stale=structuredClone(valid);stale.text='A different displayed narration entirely.';
 const malformed=structuredClone(valid);const map=malformed.transcript.activities[malformed.activityId];map.matched=map.total+1; // schema-valid, but not an activity map
 for(const [input,reason] of [[stale,'displayed-text-token-or-offset-mismatch'],[malformed,'malformed-activity-map']]){
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
