import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resolve,join} from 'node:path';
import {compilePresentation,digest} from '../../server/fia/compiler/presentation/compile.mjs';
const root=process.env.FIA_RAW_PACKS?resolve(process.env.FIA_RAW_PACKS):null;
const bundled=JSON.parse(gunzipSync(readFileSync(new URL('../../server/fia/compiler/presentation/source-packs.json.gz',import.meta.url)))).packs;
const lists=JSON.parse(readFileSync(new URL('../../server/fia/compiler/presentation/lists.json',import.meta.url)));
const examples=JSON.parse(readFileSync(new URL('../../server/fia/compiler/presentation/examples.json',import.meta.url)));
const json=p=>JSON.parse(readFileSync(p));
const input=id=>root?Object.fromEntries(['manifest','guide','guide-units','scripture','resources','rights','narration'].map(k=>[k,json(join(root,id,k+'.json'))])):structuredClone(bundled[id]);
const compile=data=>compilePresentation(data,{listEvidence:lists.packs.find(p=>p.packId===data.guide.packId),exampleEvidence:examples.packs.find(p=>p.packId===data.guide.packId)});
test('four cross-language source packs use same compiler with exact coverage and no eager media',()=>{
 for(const id of ['eng.MRK-1-1-13','spa.MRK-1-1-13','eng.MRK-1-14-20','spa.MRK-1-14-20']){
  const data=input(id),a=compile(data),b=compile(data),pack=a.pack;
  assert.deepEqual(a,b);assert.equal(pack.id,id);assert.equal(pack.coverage.length,data.guide.steps.flatMap(s=>s.units).length);
  const units=new Map(data.guide.steps.flatMap(s=>s.units).map(u=>[u.id,u]));
  for(const activity of pack.activities.filter(a=>a.sourceUnitId)){assert.equal(activity.sourceText,units.get(activity.sourceUnitId).text);assert.equal(digest(activity.sourceText),activity.sourceSha256);assert.ok(!activity.audioSrc);}
  for(const e of pack.examples)assert.equal(e.text,units.get(e.id).text);
  assert.equal(pack.listContracts.find(g=>g.purpose==='discussion').layout,'separate');assert.ok(pack.listContracts.some(g=>g.layout==='together'));
  for(const g of pack.listContracts.filter(g=>g.layout==='together'))for(const aid of [g.introId,...g.itemIds])assert.equal(pack.activities.find(a=>a.id===aid).readingGroupId,g.id);
  assert.equal(pack.scriptureReadingSequence[0].editionIds.length,3);assert.ok(pack.assets[a.defaultScriptureId]);
  for(const asset of Object.values(pack.assets)){assert.ok(!asset.src&&!asset.audioSrc&&!asset.descriptionAudio);assert.ok(asset.rights);}
  assert.equal(a.capabilities.guideNarration.status,'unavailable');assert.equal(a.capabilities.generatedAudio.count,0);
  assert.ok(a.capabilities.resourceAudio.count>0);
 }
});
test('semantic bindings and text hashes fail closed, v2 flags cannot change output',()=>{
 const data=input('spa.MRK-1-14-20'),original=compile(data);const flags=structuredClone(data);for(const s of flags.guide.steps)for(const u of s.units){u.pause=!u.pause;u.hidden=!u.hidden;}
 assert.throws(()=>compile(flags),/pinned source identity mismatch/);
 const corrupt=structuredClone(data);corrupt.guide.steps[0].units[0].text+='modified';assert.throws(()=>compile(corrupt),/identity mismatch/);
 const g=structuredClone(data);g.guide.contentSha256='0'.repeat(64);assert.throws(()=>compile(g),/identity mismatch/);
});
test('all 136 packs compile with every original unit accounted for independently',()=>{
 const ids=(root?readdirSync(root):Object.keys(bundled)).filter(id=>/^(eng|spa)\.MRK-/.test(id));assert.equal(ids.length,136);
 for(const id of ids){const data=input(id),{pack}=compile(data),all=data.guide.steps.flatMap(s=>s.units);assert.deepEqual(pack.coverage.map(x=>x.id),all.map(x=>x.id));assert.equal(new Set(pack.coverage.map(x=>x.id)).size,all.length);for(const g of pack.listContracts)for(const item of g.itemIds)assert.ok(pack.activities.some(a=>a.id===item));}
});
