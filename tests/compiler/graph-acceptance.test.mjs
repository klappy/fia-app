// Acceptance proofs for the v3 compiler-graph ticket against the shipped presentation compiler.
// Tests only: no source change, no pack regeneration, no network. The compiler is a pure
// per-pack function; there is no portion-level dependency graph or artifact cache on main
// (that cache is PR #145, unmerged). These cases prove what the shipped pipeline does guarantee
// and pin the rest so a regression is visible.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {compilePresentation,describe,digest,RECIPE,SOURCE} from '../../server/fia/compiler/presentation/compile.mjs';
import {eligible} from '../../packages/views/session.js';
const C=new URL('../../server/fia/compiler/presentation/',import.meta.url);
const bundled=JSON.parse(gunzipSync(readFileSync(new URL('source-packs.json.gz',C))));
const lists=JSON.parse(readFileSync(new URL('lists.json',C)));
const examples=JSON.parse(readFileSync(new URL('examples.json',C)));
const registry=JSON.parse(readFileSync(new URL('../../apps/web/public/content/registry.json',import.meta.url)));
const ENG='eng.MRK-1-14-20',SPA='spa.MRK-1-14-20';
const sourceFiles=id=>bundled.inventory.filter(f=>f.path.startsWith(`data/packs/${id}/`)).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
// Same call shape as build.mjs so bytes are comparable with the accepted registry.
function build(id,{data=structuredClone(bundled.packs[id]),list=structuredClone(lists.packs.find(p=>p.packId===id))}={}){
 const result=compilePresentation(data,{listEvidence:list,exampleEvidence:examples.packs.find(p=>p.packId===id),sourceFiles:sourceFiles(id)});
 const bytes=Buffer.from(JSON.stringify(result.pack,null,2)+'\n');
 return {result,bytes,descriptor:describe(data.manifest,bytes,result)};
}
const accepted=id=>registry.packs.find(p=>p.id===id);
const byId=pack=>new Map(pack.activities.map(a=>[a.id,a]));

test('versioned canonical byte vectors: compiled bytes equal the accepted registry revision for the pinned recipe/source',()=>{
 assert.equal(registry.recipeRevision,RECIPE);assert.equal(registry.sourceRevision,SOURCE);
 const vectors={[ENG]:['92ad518474f159f6567124052ae12d180a482c949509da0b725593442e62f746',395855],[SPA]:['037c43b636186066ae9e3b6cf23334db740ac3a9038041380a249fa186fc2bc4',343669]};
 for(const [id,[sha256,bytes]] of Object.entries(vectors)){
  const a=build(id),b=build(id);
  assert.ok(a.bytes.equals(b.bytes),'deterministic bytes');
  assert.equal(a.descriptor.revision,sha256);assert.equal(a.bytes.length,bytes);
  assert.equal(accepted(id).revision,sha256);assert.equal(accepted(id).presentation.bytes,bytes);
  assert.equal(a.descriptor.presentation.url,`/content/packs/${id}/${sha256}.json`);
 }
});

test('non-ASCII text is raw UTF-8 in output bytes and descriptor byte counts are UTF-8, including non-Latin scripts',()=>{
 const {bytes}=build(SPA),text=bytes.toString('utf8');
 assert.match(text,/[áéíóúñ]/);assert.doesNotMatch(text,/\\u[0-9a-fA-F]{4}/);
 assert.ok(bytes.length>text.length,'UTF-8 bytes exceed UTF-16 code units');
 // The shipped corpus contains no non-Latin script (only Latin plus typographic punctuation),
 // so the non-Latin vector is pinned at the descriptor layer every pack passes through.
 const greekHanHebrew='{"title":"Εὐαγγέλιον · 福音 · בְּשׂוֹרָה"}\n';
 const d=describe({packId:'x.TEST-1',language:'x',pericope:'p'},greekHanHebrew,{capabilities:{},defaultScriptureId:null});
 assert.equal(d.presentation.bytes,68);assert.notEqual(greekHanHebrew.length,68);
 assert.equal(d.revision,'d5c203a2a6420c32159f346c15b7e1602516e8bcec9e6dddee06704a5f220ad2');
 assert.equal(d.title,'Εὐαγγέλιον · 福音 · בְּשׂוֹרָה');
});

test('key ordering: output key order is fixed by the compiler; reordered source keys fail closed (identity is not key-canonical)',()=>{
 const base=build(ENG).bytes;
 // Unhashed semantic evidence with reversed key order compiles to identical bytes.
 const list=structuredClone(lists.packs.find(p=>p.packId===ENG));
 const reverse=o=>Array.isArray(o)?o.map(reverse):o&&typeof o==='object'?Object.fromEntries(Object.entries(o).reverse().map(([k,v])=>[k,reverse(v)])):o;
 assert.ok(build(ENG,{list:reverse(list)}).bytes.equals(base));
 // Hashed source with semantically identical but reordered keys is refused, never silently rehashed.
 const data=structuredClone(bundled.packs[ENG]);data.manifest=reverse(data.manifest);
 assert.throws(()=>build(ENG,{data}),/pinned source identity mismatch: manifest/);
});

test('modify source: only the changed pack refuses; the unchanged pack keeps its accepted revision',()=>{
 for(const name of ['guide','scripture','resources','rights']){
  const data=structuredClone(bundled.packs[ENG]);data[name].changed=true;
  assert.throws(()=>build(ENG,{data}),new RegExp(`pinned source identity mismatch: ${name}`));
 }
 assert.equal(build(SPA).descriptor.revision,accepted(SPA).revision);
});

test('modify group config: only activities in the regrouped list change; other activities and the other pack are byte-identical',()=>{
 const before=build(ENG).result.pack,list=structuredClone(lists.packs.find(p=>p.packId===ENG));
 const g=list.groups.find(x=>x.layout==='together');g.layout='separate';
 const members=new Set([g.intro.id,...g.items.map(u=>u.id)]);
 const after=build(ENG,{list}).result.pack;
 assert.notEqual(digest(JSON.stringify(after)),digest(JSON.stringify(before)));
 const a=byId(before),b=byId(after);assert.deepEqual([...b.keys()],[...a.keys()]);
 for(const [id,act] of a){
  if(members.has(id)){assert.equal(act.readingGroupId,g.intro.id);assert.equal(b.get(id).readingGroupId,undefined);const {readingGroupId,...rest}=act;assert.deepEqual(b.get(id),rest);}
  else assert.deepEqual(b.get(id),act);
 }
 assert.deepEqual(after.listContracts.filter(c=>c.id!==g.intro.id),before.listContracts.filter(c=>c.id!==g.intro.id));
 assert.deepEqual(after.coverage,before.coverage);assert.deepEqual(after.assets,before.assets);
 assert.equal(build(SPA).descriptor.revision,accepted(SPA).revision);
});

test('modify split config: splitting one item out of a list changes only that unit and its contract',()=>{
 const before=build(ENG).result,list=structuredClone(lists.packs.find(p=>p.packId===ENG));
 const g=list.groups.find(x=>x.purpose==='descriptive-list'),moved=g.items.pop();
 const after=build(ENG,{list}).result,a=byId(before.pack),b=byId(after.pack);
 for(const [id,act] of a)if(id!==moved.id)assert.deepEqual(b.get(id),act);
 assert.equal(b.get(moved.id).semanticStatus,'unresolved-instruction');assert.equal(b.get(moved.id).completion,'confirm');
 assert.deepEqual(after.diagnostics.filter(d=>d.unitId===moved.id),[{code:'conservative-continuation',unitId:moved.id}]);
 assert.deepEqual(after.diagnostics.filter(d=>d.unitId!==moved.id),before.diagnostics);
 assert.equal(build(SPA).descriptor.revision,accepted(SPA).revision);
});

test('modify speech: narration for one pack refuses that pack only; compiled output never carries audio',()=>{
 const data=structuredClone(bundled.packs[ENG]);data.narration.entries.push({unitId:data.guide.steps[0].units[0].id,src:'x.mp3'});
 assert.throws(()=>build(ENG,{data}),/pinned source identity mismatch: narration/);
 assert.equal(build(SPA).descriptor.revision,accepted(SPA).revision);
 const {result}=build(SPA);
 assert.equal(result.capabilities.guideNarration.status,'unavailable');
 for(const a of result.pack.activities)assert.equal(a.audioSrc,undefined);
});

test('changed applicability cannot publish: compiled activities are never playable and any non-accepted applicability is refused',()=>{
 const {pack}=build(SPA).result;
 for(const act of pack.activities){
  assert.equal(eligible(act),false);
  const audio={status:'available',applicability:'accepted',activityId:act.id,textSha256:act.sourceSha256,fileSha256:'a'.repeat(64),src:'fixture-only.mp3'};
  const bound={...act,textSha256:act.sourceSha256};
  assert.equal(eligible({...bound,audio}),true);
  for(const applicability of ['unknown','pending','revoked',undefined,'ACCEPTED'])assert.equal(eligible({...bound,audio:{...audio,applicability}}),false);
 }
});

test('unknown bindings are refused before output: unknown pack, foreign evidence and unknown resource links',()=>{
 const data=structuredClone(bundled.packs[ENG]);data.manifest.packId='eng.MRK-99-1-2';
 assert.throws(()=>build(ENG,{data}),/unknown source identity/);
 assert.throws(()=>compilePresentation({...structuredClone(bundled.packs[ENG]),manifest:{packId:'unknown.PACK'}},{}),/unknown source identity/);
 const list=structuredClone(lists.packs.find(p=>p.packId===SPA));list.packId=SPA;
 assert.throws(()=>compilePresentation(structuredClone(bundled.packs[ENG]),{listEvidence:list,exampleEvidence:examples.packs.find(p=>p.packId===ENG)}),/semantic guide binding mismatch/);
 const foreignText=structuredClone(lists.packs.find(p=>p.packId===ENG));foreignText.groups[0].items[0].text+=' ';
 assert.throws(()=>build(ENG,{list:foreignText}),/semantic unit binding mismatch/);
 // Unresolved resource links are excluded from relatedAssetIds and surfaced as diagnostics (not silently linked).
 const {result}=build('eng.MRK-1-40-45'),unresolved=result.diagnostics.filter(d=>d.code==='unresolved-resource-link');
 assert.equal(unresolved.length,6);
 for(const a of result.pack.activities)for(const id of a.relatedAssetIds||[])assert.ok(result.pack.assets[id]);
 for(const d of unresolved){assert.ok(!result.pack.assets[d.resourceId]);assert.ok(!result.pack.activities.find(a=>a.id===d.unitId).relatedAssetIds.includes(d.resourceId));}
});
