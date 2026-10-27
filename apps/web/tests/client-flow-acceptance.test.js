// v3 client-flow ticket Acceptance (fia-app-cookbook work/active/2026-10-03-fia-v3-client-flow):
// (a) unknown required type/hash/revision rejected; (b) stale/late events cannot advance a
// different activity; (c) a duplicated action does not double-advance; (d) restore is silent
// and manual Play stays independent. Pure-module proofs; app-level proofs are listed in RESULTS-2120.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateRegistry,validatePresentation,loadPresentation} from '../src/lib/library.js';
import {createSession,reduceSession} from '../src/lib/engine.js';
import {saveProgress,restoreProgress} from '../src/lib/session-store.js';

const empty={status:'unavailable',count:0};
const pack={id:'spa.MRK-1-14-20',assets:{bible:{kind:'scripture',text:'Texto'}},sections:[{id:'S01'}],activities:[{id:'S01-U001',assetId:'bible',sectionId:'S01',completion:'confirm'}],listContracts:[]};
const bytes=JSON.stringify(pack),sha=createHash('sha256').update(bytes).digest('hex');
const descriptor={id:pack.id,language:'spa',title:'Marcos',defaultScriptureId:'bible',revision:sha,presentation:{url:`/content/packs/${pack.id}/${sha}.json`,sha256:sha,bytes:Buffer.byteLength(bytes)},capabilities:{text:{available:true},guideNarration:empty,scriptureAudio:empty,resourceAudio:empty,generatedAudio:empty,images:empty,video:empty}};
const registry=packs=>({schemaVersion:1,packs});
const clone=v=>JSON.parse(JSON.stringify(v));

test('(a) registry rejects an unknown schema, a revision that is not the payload hash, and an unknown capability status',()=>{
 assert.equal(validateRegistry(registry([descriptor])).packs.length,1);
 assert.throws(()=>validateRegistry({schemaVersion:2,packs:[descriptor]}),/not compatible/);
 assert.throws(()=>validateRegistry(registry([{...descriptor,revision:'b'.repeat(64)}])),/invalid entry/);
 assert.throws(()=>validateRegistry(registry([{...descriptor,revision:'not-a-hash',presentation:{...descriptor.presentation,sha256:'not-a-hash'}}])),/invalid entry/);
 assert.throws(()=>validateRegistry(registry([{...descriptor,presentation:{...descriptor.presentation,url:`/content/packs/${pack.id}/other.json`}}])),/invalid entry/);
 const d=clone(descriptor);d.capabilities.video={status:'streamed',count:1};
 assert.throws(()=>validateRegistry(registry([d])),/capabilities are invalid/);
});

test('(a) presentation rejects unknown completion type, unknown asset reference, foreign identity and a non-scripture default',()=>{
 assert.equal(validatePresentation(clone(pack),descriptor).id,pack.id);
 const cases=[p=>p.activities[0].completion='surprise',p=>p.activities[0].assetId='missing',p=>p.activities[0].sectionId='S99',p=>p.id='spa.MRK-1-1-13',p=>p.assets.bible.kind='image',p=>delete p.listContracts];
 for(const mutate of cases){const p=clone(pack);mutate(p);assert.throws(()=>validatePresentation(p,descriptor),/not compatible|invalid activity/);}
});

test('(a) loader rejects bytes whose hash or length differ from the descriptor revision, and nothing enters state',async()=>{
 const prior=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(bytes);
  assert.equal((await loadPresentation(descriptor)).id,pack.id);
  const tampered=bytes.replace('Texto','Textx');
  globalThis.fetch=async()=>new Response(tampered);
  await assert.rejects(loadPresentation(descriptor),/could not be verified/);
  globalThis.fetch=async()=>new Response(bytes);
  await assert.rejects(loadPresentation({...descriptor,presentation:{...descriptor.presentation,sha256:'c'.repeat(64)}}),/could not be verified/);
 }finally{globalThis.fetch=prior;}
});

const acts=[
 {id:'intro',kind:'guide',completion:'auto'},
 {id:'watch',kind:'video',assetId:'video',completion:'media'},
 {id:'clip',kind:'video',assetId:'video2',completion:'media'},
 {id:'discuss',kind:'image',assetId:'image',completion:'confirm'},
];
const apply=(s,type,props={})=>reduceSession(s,{type,...props},acts);
// Progress identity: an ignored event may still be logged in `events`, but must not move place.
const place=s=>({index:s.index,status:s.status,completed:s.completed,detour:s.detour,queued:s.queued});
const same=(a,b,msg)=>assert.deepEqual(place(a),place(b),msg);

test('(b) a late media or narration event for another activity cannot advance the current one',()=>{
 let s=apply(apply(createSession(acts),'PLAY'),'NARRATION_END',{activityId:'intro'});
 assert.equal(acts[s.index].id,'watch');
 const held=apply(s,'MEDIA_END',{activityId:'intro'});
 same(held,s,'late event from a previous activity is a no-op');
 s=apply(s,'MEDIA_END',{activityId:'watch'});assert.equal(acts[s.index].id,'clip');
 same(apply(s,'MEDIA_END',{activityId:'watch'}),s,'late end of the previous video cannot complete the next video');
 s=apply(s,'SEEK_ACTIVITY',{activityId:'watch'});
 same(apply(s,'MEDIA_END',{activityId:'clip'}),s,'media from the activity navigated away from is ignored');
 assert.equal(apply(apply(s,'PLAY'),'NARRATION_END',{activityId:'clip'}).index,s.index);
 assert.deepEqual(s.completed,['intro','watch']);
});

test('(b) a late media end during a detour does not advance the held activity',()=>{
 let s=apply(createSession(acts),'SEEK_ACTIVITY',{activityId:'watch'});
 s=apply(s,'DETOUR',{assetId:'image'});
 same(apply(s,'MEDIA_END',{activityId:'watch'}),s);
 s=apply(s,'RETURN');assert.equal(acts[s.index].id,'watch');assert.equal(s.detour,null);
});

test('(c) a duplicated completion event advances exactly once',()=>{
 let s=apply(createSession(acts),'PLAY');
 const once=apply(s,'NARRATION_END',{activityId:'intro'});
 const twice=apply(once,'NARRATION_END',{activityId:'intro'});
 assert.equal(twice.index,once.index);assert.equal(acts[twice.index].id,'watch');
 const media=apply(once,'MEDIA_END',{activityId:'watch'});
 const mediaTwice=apply(media,'MEDIA_END',{activityId:'watch'});
 same(mediaTwice,media);assert.equal(acts[mediaTwice.index].id,'clip');
 assert.deepEqual(mediaTwice.completed,['intro','watch']);
});

test('(c) duplicated queue/detour/pin requests are idempotent and never complete an activity',()=>{
 let s=apply(createSession(acts),'SEEK_ACTIVITY',{activityId:'discuss'});
 const q=apply(apply(s,'QUEUE_NEXT',{assetId:'image'}),'QUEUE_NEXT',{assetId:'image'});
 assert.equal(q.queued,'image');assert.equal(q.index,s.index);
 const d=apply(apply(s,'DETOUR',{assetId:'video'}),'DETOUR',{assetId:'video'});
 assert.equal(d.detour,'video');assert.equal(d.index,s.index);assert.deepEqual(d.completed,[]);
 const back=apply(apply(d,'RETURN'),'RETURN');assert.equal(back.index,s.index);assert.equal(back.detour,null);
});

const storage=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};
const restorePack={id:'spa.MRK-1-14-20',revision:'1'};

test('(d) restoring a place saved mid-playback is silent: paused at the same activity with no detour playing',()=>{
 const st=storage();
 let s=apply(apply(createSession(acts),'PLAY'),'NARRATION_END',{activityId:'intro'});s=apply(s,'PLAY');
 assert.equal(s.status,'playing');
 saveProgress(st,restorePack,acts,{session:s});
 const restored=restoreProgress(st,restorePack,acts).session;
 assert.equal(acts[restored.index].id,'watch');
 assert.equal(restored.status,'paused');
 assert.deepEqual(restored.completed,['intro']);
 // Engine receives no playback event from restore; completion callbacks are ignored until Play.
 same(apply(restored,'NARRATION_END',{activityId:'watch'}),restored);
});

test('(d) manual Play after restore is independent of automatic preferences and plays only the restored activity',()=>{
 const st=storage();
 let s=apply(createSession(acts),'SEEK_ACTIVITY',{activityId:'clip'});
 s=apply(s,'SET_PREFERENCE',{key:'autoplayVideo',value:false});
 saveProgress(st,restorePack,acts,{session:{...s,status:'playing'}});
 const restored=restoreProgress(st,restorePack,acts).session;
 assert.equal(restored.status,'paused');assert.equal(restored.preferences.autoplayVideo,false);
 const played=apply(restored,'PLAY');
 assert.equal(played.status,'playing');assert.equal(acts[played.index].id,'clip');
 assert.equal(played.preferences.autoplayVideo,false,'Play grants no automatic setting');
 const autoOn=apply(restored,'SET_PREFERENCE',{key:'autoplayVideo',value:true});
 assert.equal(autoOn.status,'paused','turning on an automatic preference does not start playback');
});
