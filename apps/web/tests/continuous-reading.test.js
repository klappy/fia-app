import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planContinuousReading,planRun} from '../src/lib/continuous-reading.js';
const pack=JSON.parse(fs.readFileSync(new URL('../src/lib/pack.json',import.meta.url)));
const manifest=JSON.parse(fs.readFileSync(new URL('../public/content/delivery/eng.MRK-1-1-13/b749c9c8246fd178a6c70604ef1037a1bed0e2804ba618750a2aec1de4d9a10e.json',import.meta.url)));
function input(id='S03-U012') {
 const descriptors=Object.fromEntries(structuredClone(manifest.entries).filter(e=>e.delivery.kind==='audio').map(e=>[e.path,{path:e.path,sha256:e.delivery.sha256,sourceSha256:e.source.sha256,deliveryURL:e.delivery.url,duration:e.delivery.duration,playbackRange:e.playbackRange,timing:e.timing}]));
 return {activities:structuredClone(pack.activities),listContracts:structuredClone(pack.listContracts),currentId:id,src:'blob:verified',fileKey:'verified-recording',audioSha256:descriptors[pack.activities.find(a=>a.id===id).audioSrc].sha256,descriptorFor:path=>descriptors[path],descriptors};
}
test('actual S03 screen plans all eight authored rows on one verified delivery and restarts intro',()=>{
 const p=planContinuousReading(input());
 assert.equal(p.groupId,'S03-U009'); assert.equal(p.spans.length,8);
 assert.deepEqual(p.range,{startSeconds:92.17,endSeconds:103.13});
 assert.equal(p.spans[0].id,'S03-U009');assert.equal(p.spans.at(-1).id,'S03-U016');
 assert.ok(p.spans.every(s=>s.src==='blob:verified'&&s.fileKey==='verified-recording'));
});
test('real authored S04/S05 together groups qualify; discussion is never continuous',()=>{
 assert.equal(planContinuousReading(input('S04-U004'))?.spans.length,8);
 assert.equal(planContinuousReading(input('S05-U009'))?.spans.length,4);
 assert.equal(planContinuousReading(input('S01-U001')),null);
 const x=input();x.activities.find(a=>a.id==='S03-U011').kind='discussion';assert.equal(planContinuousReading(x),null);
});
test('reject changed recording, delivery, mapping, malformed ranges, omitted rows and changed contracts',()=>{
 for(const mutate of [
  x=>x.audioSha256='a'.repeat(64),
  x=>x.descriptors['/audio/source/S03-U010.mp3'].sourceSha256='a'.repeat(64),
  x=>x.descriptors['/audio/source/S03-U010.mp3'].deliveryURL+='?different',
  x=>x.descriptors['/audio/source/S03-U010.mp3'].timing.mappingEvidenceSha256='a'.repeat(64),
  x=>x.descriptors['/audio/source/S03-U010.mp3'].playbackRange.endSeconds=94,
  x=>x.descriptors['/audio/source/S03-U010.mp3'].playbackRange.startSeconds=94,
  x=>x.descriptors['/audio/source/S03-U010.mp3'].duration=90,
  x=>x.activities.find(a=>a.id==='S03-U011').readingGroupId='other',
  x=>x.listContracts.find(c=>c.id==='S03-U009').itemIds.pop()
 ]) {const x=input();mutate(x);assert.equal(planContinuousReading(x),null);}
});
test('missing or changed authored contract fails closed despite identical recording',()=>{
 for(const mutate of [x=>x.listContracts=[],x=>x.listContracts.find(c=>c.id==='S03-U009').layout='separate',x=>x.listContracts.find(c=>c.id==='S03-U009').progression='confirm',x=>x.listContracts.find(c=>c.id==='S03-U009').purpose='discussion']){const x=input();mutate(x);assert.equal(planContinuousReading(x),null);}
});

// planRun: audio is the player (captain, 2026-11-09). Consecutive same-file spans from the current clip up to and
// including the first confirmation stop or up to a file change; no list contract required; null is the safety gate.
test('S01-U001 runs with S01-U002 and stops before the Scripture reading (a different file)',()=>{
 const p=planRun(input('S01-U001'));
 assert.equal(p.kind,'run');assert.deepEqual(p.spans.map(s=>s.id),['S01-U001','S01-U002']);assert.equal(p.confirm,false);
 assert.deepEqual(p.range,{startSeconds:6.2,endSeconds:25.5});assert.deepEqual(p.spans[1].range,{startSeconds:13.15,endSeconds:25.5});
 assert.ok(p.spans.every(s=>s.src==='blob:verified'&&s.fileKey==='verified-recording'&&s.text.trim()));
});
test('a run includes the first confirmation stop and ends there: S02-U002 reaches the picture question S02-U005',()=>{
 const p=planRun(input('S02-U002'));
 assert.deepEqual(p.spans.map(s=>s.id),['S02-U002','S02-U003','S02-U004','S02-U005']);assert.equal(p.confirm,true);
 assert.equal(p.range.endSeconds,95.18);
});
test('a lone confirmation stop, the last clip of a file and a clip that stops before a described visual cannot run: null falls back to the clip',()=>{
 assert.equal(planRun(input('S01-U003')),null);
 assert.equal(planRun(input('S02-U013')),null);
 assert.equal(planRun(input('S01-U008')),null);
 const stopped=planRun({...input('S03-U017'),stopBefore:a=>a.id==='S03-U019'});
 assert.deepEqual(stopped.spans.map(s=>s.id),['S03-U017','S03-U018']);assert.equal(stopped.confirm,false);
 assert.equal(planRun({...input('S03-U018'),stopBefore:a=>a.id==='S03-U019'}),null);
});
test('the authored together-list wins when the current clip opens one; a run before it crosses it as plain rows',()=>{
 const together=planRun(input('S03-U012'));assert.equal(together.kind,'together');assert.equal(together.groupId,'S03-U009');assert.equal(together.spans.length,8);
 const run=planRun(input('S03-U008'));assert.equal(run.kind,'run');assert.deepEqual(run.spans.map(s=>s.id),['S03-U008','S03-U009','S03-U010','S03-U011','S03-U012','S03-U013','S03-U014','S03-U015','S03-U016','S03-U017','S03-U018','S03-U019']);
});
test('every run keeps the identity, mapping and verified-timing checks: a changed descriptor ends the run or fails it',()=>{
 for(const mutate of [x=>x.audioSha256='a'.repeat(64),x=>x.descriptors['/audio/source/S02-U002.mp3'].timing.status='unverified',x=>x.descriptors['/audio/source/S02-U002.mp3'].deliveryURL+='?x']){const x=input('S02-U002');mutate(x);assert.equal(planRun(x),null);}
 for(const mutate of [x=>x.descriptors['/audio/source/S02-U004.mp3'].sourceSha256='a'.repeat(64),x=>x.descriptors['/audio/source/S02-U004.mp3'].timing.mapping.offsetSeconds+=1,x=>x.descriptors['/audio/source/S02-U004.mp3'].playbackRange.startSeconds=50,x=>x.descriptors['/audio/source/S02-U004.mp3'].duration=60,x=>x.activities.find(a=>a.id==='S02-U004').audioSrc=null]){const x=input('S02-U002');mutate(x);assert.deepEqual(planRun(x).spans.map(s=>s.id),['S02-U002','S02-U003']);}
 const x=input('S02-U002');x.descriptors['/audio/source/S02-U003.mp3'].sha256='a'.repeat(64);assert.equal(planRun(x),null);
});
test('runs never include Scripture, resource steps without a recording or media-completion screens',()=>{
 const x=input('S02-U006');assert.deepEqual(planRun(x).spans.map(s=>s.id),['S02-U006','S02-U007','S02-U008']);
 const y=input('S02-U006');y.activities.find(a=>a.id==='S02-U007').completion='media';assert.equal(planRun(y),null);
 const z=input('S02-U006');z.activities.find(a=>a.id==='S02-U007').kind='scripture';assert.equal(planRun(z),null);
});
