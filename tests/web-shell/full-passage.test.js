import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {restore,transition,pageIndices,positionKey,readPosition,savePosition} from '../../packages/views/session.js';
import {validateBundle} from '../../packages/views/bundle-integrity.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const b=read('../../apps/web/public/content/bundle.json'), e=read('./fixtures/canonical-evidence.json');
const hash=s=>createHash('sha256').update(s).digest('hex');
test('all 128 ordered positions retain kind/completion/source/resource relations and canonical text',()=>{
 assert.deepEqual(b.activities.map(a=>Object.fromEntries(Object.keys(e.trace.find(t=>t.id===a.id)).map(k=>[k,a[k]]))),e.trace);
 assert.equal(b.activities.filter(a=>a.completion==='confirm').length,41);
 assert.equal(b.activities.filter(a=>a.kind==='scripture').length,8);
 for(const a of b.activities){
  const u=e.units.find(u=>u.id===(a.sourceUnitId||a.fulfills));
  const s=e.scriptures.find(s=>'scripture-'+s.resourceCode===a.assetId);
  const text=a.kind==='scripture'?s.verses.map(v=>v.text).join('\n'):u.text;
  assert.equal(a.text,text,a.id);assert.equal(a.textSha256,hash(text));
  if(a.kind!=='scripture')assert.equal(a.sourceSha256,u.sha256);
  else for(const v of a.scriptureSource.verses)assert.equal(hash(v.content),v.contentSha256);
 }
});
test('all 130 canonical source units retain exact dispositions and separate source/display hashes',()=>{
 assert.equal(b.sourceUnits.length,130);
 for(const u of e.units){const actual=b.sourceUnits.find(x=>x.id===u.id);assert.equal(actual.text,u.text);assert.equal(actual.sourceSha256,u.sha256);assert.equal(actual.textSha256,hash(u.text));
 const expected=/^S04-U0(1[7-9]|2[0-9])$/.test(u.id)?'optional-example':['S05-U044','S05-U045'].includes(u.id)?'production-request':['S02-U012','S06-U005','S06-U007','S06-U009'].includes(u.id)?'source-detail':'default';assert.equal(actual.disposition,expected,u.id);
 if(expected==='default')assert.ok(actual.activityIds.length);if(expected==='source-detail')assert.ok(b.activities.find(a=>a.id===actual.associatedActivityId && a.completion==='confirm'));
 }
 assert.equal(b.sourceUnits.filter(u=>u.disposition==='optional-example').length,13);
 assert.deepEqual(Object.keys(b.resources),e.resourceIds);assert.deepEqual(b.lists,e.lists);
 assert.equal(b.lists.find(l=>l.id==='S05-U009').purpose,'explanation');
});
test('group navigation and member restore preserve logical identity without splitting list pages',()=>{
 for(const list of b.lists.filter(l=>l.layout==='together')){
  const ids=[list.introId,...list.itemIds], indices=ids.map(id=>b.activities.findIndex(a=>a.id===id));
  for(const id of ids){let s=restore(b,{bundleId:b.id,revision:b.revision,activityId:id,automatic:true});assert.equal(b.activities[s.index].id,id);assert.equal(s.playing,false);assert.deepEqual(pageIndices(b,s.index),indices);assert.equal(transition(b,s,{type:'next'}).index,indices.at(-1)+1);assert.equal(transition(b,s,{type:'back'}).index,indices[0]-1);}
 }
});
test('whole intentional walk reaches final hold then terminal; no media callback advances a hold',()=>{
 let s=restore(b,null),holds=0,pages=0;
 while(!s.reachedEnd){const a=b.activities[s.index];if(a.completion==='confirm'){holds++;assert.deepEqual(transition(b,s,{type:'ended',token:s.token}),s);assert.ok(!s.reachedEnd);}
 const next=transition(b,s,{type:'next'});assert.equal(next.playing,false);s=next;assert.ok(++pages<129);}
 assert.equal(holds,41);assert.equal(s.index,127);assert.equal(pages,111);
});
test('optional and resource return preserves activity and stops playback',()=>{
 for(const view of [{type:'examples'},{type:'resource',id:'a112'},{type:'source'}]){let s={...restore(b,null),index:73,playing:true};s=transition(b,s,{type:'open-view',view});assert.equal(s.index,73);assert.equal(s.playing,false);s=transition(b,s,{type:'close-view'});assert.equal(s.index,73);assert.equal(s.view,null);assert.equal(s.playing,false);}
});
test('foreign excerpt storage remains untouched; refusal keeps in-memory position',()=>{
 const old=JSON.stringify({bundleId:'fia-mark-hear-heart-excerpt',revision:'b1',activityId:'S01-U005',automatic:true});const m=new Map([['fia-v3-bundled-position',old]]);const store={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};
 const s=restore(b,readPosition(b,store).saved);assert.equal(s.index,0);assert.match(s.notice,/previous position/);savePosition(b,s,store);assert.equal(m.get('fia-v3-bundled-position'),old);assert.ok(m.has(positionKey(b)));
 const refused={getItem(){throw Error()},setItem(){throw Error()}};assert.match(readPosition(b,refused).notice,/unavailable/);assert.match(savePosition(b,{...s,index:42},refused),/only for this visit/);
});
test('unsupported bundle, unknown IDs, bad hashes, missing group members and wrong associations fail closed',async()=>{
 await validateBundle(b);
 for(const mutate of [x=>x.schemaVersion=1,x=>x.activities[0].id='unknown',x=>x.activities[0].sourceSha256='0'.repeat(64),x=>x.lists[1].itemIds.pop(),x=>x.activities.find(a=>a.relatedAssetIds).relatedAssetIds=['wrong'],x=>x.activities[0].audio.src='https://example.com/audio.mp3']){const x=structuredClone(b);mutate(x);await assert.rejects(validateBundle(x));}
});
