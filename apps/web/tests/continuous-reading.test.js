import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planContinuousReading} from '../src/lib/continuous-reading.js';
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
