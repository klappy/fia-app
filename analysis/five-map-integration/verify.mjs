// Source-bound local integration verifier; no acquisition or release admission.
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
import {activityWords,validateTranscript} from '../../apps/web/src/lib/transcript.js';import {activityAlignment} from '../../apps/web/src/lib/alignment.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
export const fixture=JSON.parse(readFileSync(root+'analysis/five-map-integration/reviewed-proposals.json'));
const pin=(folder,h)=>{const b=readFileSync(root+'apps/web/public/content/'+folder+'/'+h+'.json');assert.equal(sha(b),h,'source pin');return JSON.parse(b);};
const key=t=>t.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu,'');
export function reconstruct(){
 const pack=pin('packs/eng.MRK-1-1-13','ccd72f23c23f932651b500b730b285f32fabd37e50037b5af91d8881f1403975'),proposals=[];
 for(const c of fixture.cases){
  const p=c.pins,l=pin('recording-sources',p.ledger),r=pin('recording-evidence',p.raw),recognition=pin('recording-evidence',p.recognition),clock=pin('recording-evidence',p.clock),analysis=pin('recording-evidence',p.clockAnalysis),acceptance=pin('recording-evidence',p.acceptance),drift=pin('recording-evidence',p.drift),review=pin('recording-evidence',p.review),m=l.mappings.find(m=>m.activityId===c.id),a=pack.activities.find(a=>a.id===c.id),shown=a.readingGroupId?a.sourceText:a.narration;
  assert.equal(l.recording.sha256,c.sourceAudioSha256);assert.equal(r.recordingSha256,c.sourceAudioSha256);assert.equal(recognition.source.sha256,c.sourceAudioSha256);assert.equal(r.transcriptSha256,p.recognition);assert.equal(l.transcript.wordTimestampsSha256,p.raw);
  assert.equal(clock.status,'accepted');assert.equal(clock.sourceAudioSha256,c.sourceAudioSha256);assert.equal(clock.deliveryAudioSha256,c.deliveryAudioSha256);assert.equal(clock.sourceClockDomain,'decoded-pcm');assert.equal(r.clockDomain,clock.sourceClockDomain);assert.equal(clock.analysisSha256||clock.evidenceSha256,p.clockAnalysis);assert.equal(analysis.source.sha256,c.sourceAudioSha256);assert.equal(analysis.delivery.sha256,c.deliveryAudioSha256);assert.ok(Number.isFinite(clock.mapping.scale)&&clock.mapping.scale>0&&Number.isFinite(clock.mapping.offsetSeconds));
  assert.equal(m.acceptance.status,'accepted');assert.equal(acceptance.status,'accepted');assert.deepEqual(m.wordSpan,c.wordSpan);assert.deepEqual(acceptance.mapping.wordSpan,m.wordSpan);assert.deepEqual(acceptance.mapping.sourceRange,m.sourceRange);assert.equal(m.sourceTextSha256,sha(shown));assert.equal(sha(shown),sha(c.text));assert.equal(review.status,'accepted');assert.equal(review.reportSha256,p.drift);assert.equal(review.transcriptSha256,p.recognition);const d=drift.mappings.find(d=>d.activityId===c.id);assert.deepEqual(d.wordSpan,m.wordSpan);assert.deepEqual(d.uncertainWordIndexes,c.retainedRecognitionUncertainty,'reviewed source uncertainty retained');if(c.id!=='S04-U005')assert.deepEqual(c.retainedRecognitionUncertainty,[],'clean-batch selection');
  const raw=r.words.slice(m.wordSpan.first,m.wordSpan.lastExclusive);assert.equal(raw.length,c.before.words.length);assert.equal(raw.length,c.before.total);
  const words=raw.map((w,i)=>{const old=c.before.words[i];assert.equal(key(w.text),key(shown.slice(old.from,old.to)));return {...old,startMs:Math.round((w.startSeconds*clock.mapping.scale+clock.mapping.offsetSeconds)*1000),endMs:Math.round((w.endSeconds*clock.mapping.scale+clock.mapping.offsetSeconds)*1000)};});
  const after={...c.before,matched:words.length,words};assert.deepEqual(after,c.after,'reviewed complete map');assert.ok(activityWords(after,c.runtimeRange));assert.ok(activityAlignment(shown,after.words,after.endMs));proposals.push({...c,after});
 }
 return proposals;
}
export function verifyIntegrated(){
 for(const [path,digest]of Object.entries(fixture.protectedUnchangedFiles))assert.equal(sha(readFileSync(root+path)),digest,'protected continuous transport/S03 map');
 const proposals=reconstruct(),files={};for(const [audio,ref]of Object.entries(fixture.files)){const bytes=readFileSync(root+ref.path),actual=validateTranscript(JSON.parse(bytes)),restored=structuredClone(actual);assert.equal(actual.audioSha256,audio);for(const c of proposals.filter(c=>c.deliveryAudioSha256===audio)){assert.deepEqual(actual.activities[c.id],c.after);restored.activities[c.id]=c.before;}assert.equal(sha(JSON.stringify(restored)),ref.beforeCanonicalSha256,'all neighbors and file identity preserved');files[audio]={actual,restored,path:ref.path};}
 return {proposals,files};
}

export function screenCompleteness(){
 const {files}=verifyIntegrated(),audit=JSON.parse(readFileSync(root+'evidence/first-pericope/timing-quality.json')),pack=JSON.parse(readFileSync(root+'apps/web/src/lib/pack.json'));
 return [...new Set([...fixture.cases.map(c=>c.screenId),'S03-U009'])].map(screenId=>{
  const rows=audit.rows.filter(r=>r.screenId===screenId),states=rows.map(r=>{
   const v=r.variants.find(v=>v.quality===r.selectedQuality),a=pack.activities.find(a=>a.id===r.activityId),text=a.readingGroupId?a.sourceText:a.narration;
   const file=files[v.audioSha256],actual=file?file.actual:JSON.parse(readFileSync(root+`apps/web/public/transcripts/${v.audioSha256}.words.json`)),old=file?file.restored:actual;
   const pass=sc=>!!activityWords(sc.activities[r.activityId],v.runtimeRange)&&!!activityAlignment(text,activityWords(sc.activities[r.activityId],v.runtimeRange),sc.activities[r.activityId].endMs);
   return {id:r.activityId,before:pass(old),after:pass(actual)};
  });
  return {screenId,total:rows.length,before:states.filter(s=>s.before).length,after:states.filter(s=>s.after).length,remainingUntimed:states.filter(s=>!s.after).map(s=>s.id),states,scope:'Static predicates only; native/acoustic/device acceptance not established'};
 });
}
