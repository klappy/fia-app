// Acceptance proofs for the fresh one-passage v3 shell (cookbook work/active/2026-10-03-fia-v3-bundled-selection TICKET.md, Acceptance line).
// Tests only: these complement session.test.js and full-passage.test.js; no source change.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {eligible,restore,snapshot,transition,readPosition,savePosition,positionKey} from '../../packages/views/session.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const bundle=read('../../apps/web/public/content/bundle.json'), evidence=read('./fixtures/canonical-evidence.json');
const hash=s=>createHash('sha256').update(s).digest('hex');
// Fixture-only: every activity carries accepted audio bound to its own id and text, so playback paths are reachable.
const playable={...bundle,activities:bundle.activities.map(a=>({...a,audio:{status:'available',applicability:'accepted',activityId:a.id,textSha256:a.textSha256,fileSha256:'a'.repeat(64),src:`fixture-${a.id}.mp3`}}))};
const memory=()=>{const m=new Map();return {m,store:{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v)}};};

test('accepted passage action trace: explicit Continue visits the canonical order and every step binds its own text identity',()=>{
 const expected=evidence.trace.map(t=>t.id);assert.deepEqual(bundle.activities.map(a=>a.id),expected);
 let s=restore(bundle,null);const seen=[];
 while(!s.reachedEnd){const a=bundle.activities[s.index];seen.push(a.id);assert.equal(hash(a.text),a.textSha256,a.id);assert.equal(snapshot(bundle,s).activityId,a.id);const next=transition(bundle,s,{type:'next'});assert.ok(next.index>s.index||next.reachedEnd);s=next;}
 // Visited ids are a strictly ordered subsequence of the trace (grouped list pages advance as one page).
 let last=-1;for(const id of seen){const i=expected.indexOf(id);assert.ok(i>last,id);last=i;}
 assert.equal(seen[0],expected[0]);assert.equal(seen.at(-1),expected.at(-1));
});

test('supplied media identities stay bound to their activity and none is claimed playable without acceptance',()=>{
 let supplied=0;
 for(const a of bundle.activities){const e=a.audio.suppliedEvidence;if(!e)continue;supplied++;
  assert.equal(e.id,a.kind==='scripture'?a.assetId:(a.sourceUnitId||a.fulfills||a.id),a.id);
  assert.match(e.sha256,/^[a-f0-9]{64}$/);assert.equal(a.audio.status,'unavailable');assert.equal(eligible(a),false);
  const s=transition(bundle,{...restore(bundle,null),index:bundle.activities.indexOf(a)},{type:'play'});
  assert.equal(s.playing,false);assert.equal(s.token,0);assert.equal(s.notice,a.audio.reason);}
 assert.ok(supplied>0);
 // Audio bound to another activity's id or text never plays, even when otherwise accepted.
 const [x,y]=playable.activities;
 for(const audio of [{...x.audio,activityId:y.id},{...x.audio,textSha256:y.textSha256}])assert.equal(eligible({...x,audio}),false);
});

test('automatic playback off: Continue, Back and jump never start audio; only explicit Play does, without enabling automatic',()=>{
 let s=restore(playable,null);assert.equal(s.automatic,false);
 while(!s.reachedEnd){assert.equal(s.playing,false);const p=transition(playable,s,{type:'play'});assert.equal(p.playing,true);assert.equal(p.automatic,false);assert.equal(p.token,s.token+1);s=transition(playable,s,{type:'next'});}
 for(const action of [{type:'back'},{type:'jump',index:3}])assert.equal(transition(playable,{...s,reachedEnd:false,index:10},action).playing,false);
 // Turning automatic on or off is a preference, never a play.
 const on=transition(playable,{...restore(playable,null),index:5},{type:'automatic',value:true});assert.equal(on.playing,false);assert.equal(on.token,0);
});

test('silent restore: a snapshot taken mid-playback restores paused at the same activity for every position',()=>{
 const {m,store}=memory();
 for(const [index,a] of playable.activities.entries()){
  const live=transition(playable,{...restore(playable,null),index,automatic:true},{type:'play'});assert.equal(live.playing,true);
  assert.equal(savePosition(playable,live,store),'');
  const back=restore(playable,readPosition(playable,store).saved);
  assert.equal(playable.activities[back.index].id,a.id);assert.equal(back.playing,false);assert.equal(back.automatic,true);assert.equal(back.token,0);
  // A late callback from the pre-restore player cannot start or advance anything.
  assert.deepEqual(transition(playable,back,{type:'ended',token:live.token}),back);
 }
 assert.deepEqual([...m.keys()],[positionKey(playable)]);
 const corrupt={getItem:()=>'{not json',setItem:()=>{}};const r=readPosition(playable,corrupt);assert.equal(restore(playable,r.saved).playing,false);assert.match(r.notice,/Starting silently/);
});

test('unavailable language never relabels the active passage, interrupts playback or claims Spanish media',()=>{
 const frozen=structuredClone(playable);
 for(const index of [0,5,73,127])for(const playing of [false,true]){
  const s=playing?transition(playable,{...restore(playable,null),index},{type:'play'}):{...restore(playable,null),index};
  const es=transition(playable,s,{type:'language',language:'es'});
  assert.deepEqual({...es,notice:s.notice},s);
  assert.equal(playable.activities[es.index].id,playable.activities[index].id);assert.equal(playable.language,'en');
  assert.match(es.notice,/Spanish is unavailable/);assert.match(es.notice,/English remains active/);assert.doesNotMatch(es.notice,/audio|recording|playing|download/i);
  // The English player that was already running still owns its callback.
  if(playing){const ended=transition(playable,es,{type:'ended',token:es.token});assert.equal(ended.playing,false);assert.equal(ended.index,index);}
  assert.equal(snapshot(playable,es).activityId,playable.activities[index].id);
 }
 assert.deepEqual(playable,frozen);
 // Choosing English afterwards restates the active language and keeps the same place.
 const s={...restore(bundle,null),index:9};const en=transition(bundle,transition(bundle,s,{type:'language',language:'es'}),{type:'language',language:'en'});
 assert.equal(en.index,9);assert.equal(en.playing,false);assert.equal(en.notice,'English is active.');
});
