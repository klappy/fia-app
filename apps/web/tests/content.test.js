import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import pack from '../src/lib/pack.json' with {type:'json'};
const read=name=>JSON.parse(readFileSync(`public/content/source/${name}.json`));
const hash=data=>createHash('sha256').update(data).digest('hex');
test('all 130 original guide units have explicit coverage across six stages',()=>{const units=read('guide').steps.flatMap(s=>s.units);assert.equal(units.length,130);assert.equal(pack.sections.length,6);assert.deepEqual(pack.coverage.map(c=>c.id),units.map(u=>u.id));assert.equal(pack.examples.length,13);for(const a of pack.activities.filter(a=>a.audioSrc&&a.sourceUnitId)){const unit=units.find(u=>u.id===a.sourceUnitId);assert.equal(a.sourceSha256,unit.sha256);assert.equal(a.sourceText,unit.text);}});
test('every bundled source recording matches its original bytes and provenance',()=>{const entries=read('audio-manifest').entries;assert.equal(entries.length,143);for(const e of entries){const bytes=readFileSync('public'+e.path);assert.equal(hash(bytes),e.sha256,e.id);assert.equal(bytes.length,e.bytes);assert.equal(e.ai,true);}for(const a of pack.activities.filter(a=>a.audioSrc)){assert.ok(entries.some(e=>e.path===a.audioSrc),a.id);assert.ok(a.audioSrc.endsWith('.mp3'));}});
test('all authored Scripture instructions insert readings before returning to the next unit',()=>{const readings=pack.activities.filter(a=>a.kind==='scripture');assert.equal(readings.length,8);assert.equal(new Set(readings.slice(0,3).map(a=>a.assetId)).size,3);for(const s of pack.sections){const call=s.id==='S01'?'S01-U002':s.id+'-U001';const i=pack.activities.findIndex(a=>a.id===call);assert.equal(pack.activities[i+1].fulfills,call);assert.equal(pack.activities[i].completion,'auto');}assert.equal(pack.activities[5].id,'S01-U003');});
test('every required resource cue is a contiguous visible activity and all media resolve',()=>{for(const [id,required] of Object.entries(read('cues').resourcesAt)){const group=pack.activities.filter(a=>a.sourceUnitId===id);assert.deepEqual(group.map(a=>a.assetId).filter(Boolean),required,id);for(const a of group)assert.equal(a.completion,'confirm');}for(const a of Object.values(pack.assets)){for(const path of [a.src,a.poster,a.descriptionAudio].filter(Boolean))assert.ok(existsSync('public'+path),path);if(a.kind==='term')assert.ok(a.text.length>10);}});
test('vendored cookbook design tokens match their pinned source hashes',()=>{const expected={"colors": "722d14f41e77d9ae4b76e9cca4f545db2afc795f8a2d2aa2854299ef63558d76", "glass": "6377a863545bb2b4e23cabf92b1bc527531755fc9ffe557cd4c514f9f1c81c65", "elevation": "a65971989b1569ff2ae38ea6ca8cf252de26c5c0c7c61c044e667979e80b3b9f", "motion": "ff0e0901723b127f952e021de717eeaed92cf92c570ab4aec5165e513600604c", "radius": "79afe3a50ee04d00682373e8e8f630bf762fd0fa98f8e939606d82e588a83ace", "spacing": "3d94c244187d5cb6e3bd81f6e0350abc35cbfdb39db6683220cb8e64e356508a", "typography": "db244caa413149246c65ce6ae42e04e699898e92018a38fc6a4690cf926b5b80"};for(const [name,digest] of Object.entries(expected))assert.equal(hash(readFileSync(`src/vendor/glass/tokens/${name}.css`)),digest,name);});
test('merged spoken pause cues still require an explicit group continuation',()=>{for(const id of ['S02-U011','S06-U004','S06-U006','S06-U008'])assert.equal(pack.activities.find(a=>a.id===id).completion,'confirm',id);});

test('reviewed descriptive lists share pages; question lists remain independent',()=>{
 const grouped=pack.activities.filter(a=>a.readingGroupId);
 assert.equal(grouped.length,20);
 assert.equal(pack.listContracts.length,4);
 assert.deepEqual(pack.listContracts.map(b=>[b.purpose,b.layout,b.progression]),[['discussion','separate','confirm'],['descriptive-list','together','auto'],['descriptive-list','together','auto'],['explanation','together','auto']]);
 for(const id of ['S03-U009','S04-U004']){
  const members=grouped.filter(a=>a.readingGroupId===id);
  assert.equal(members.length,8);
  assert.equal(members[0].sourceText,'The characters in this passage are:');
  assert.deepEqual(members.slice(1).map(a=>a.sourceText),['John the Baptist','Crowds of people','Jesus','The Holy Spirit','God','Satan','Angels']);
  assert.ok(members.every(a=>a.completion==='auto'&&!a.assetId&&a.audioSrc));
 }
 assert.ok(pack.activities.filter(a=>a.sectionId==='S01').every(a=>!a.readingGroupId));
});
