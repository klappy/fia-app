import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {eligible,restore,snapshot,transition} from '../../packages/views/session.js';
const bundle=JSON.parse(readFileSync(new URL('../../apps/web/public/content/bundle.json',import.meta.url)));
const activity=bundle.activities[5];
const fixture={...bundle,activities:bundle.activities.map(a=>({...a,audio:{status:'available',applicability:'accepted',activityId:a.id,textSha256:a.textSha256,fileSha256:'a'.repeat(64),src:'fixture-only.mp3'}}))};
const apply=(s,a,b=fixture)=>transition(b,s,a);
test('manual Play works with automatic disabled; ended discussion remains until confirmation',()=>{
 let s={...restore(fixture,null),index:5}; s=apply(s,{type:'play'}); assert.equal(s.playing,true);assert.equal(s.automatic,false);
 s=apply(s,{type:'ended',token:s.token});assert.equal(s.index,5);assert.equal(s.playing,false);
 s=apply(s,{type:'next'});assert.equal(s.index,6);
});
test('late and duplicate callbacks cannot stop or advance the new activity',()=>{
 let s=apply(restore(fixture,null),{type:'play'});const stale=s.token;
 s=apply(s,{type:'next'});s=apply(s,{type:'play'});const newToken=s.token;
 assert.deepEqual(apply(s,{type:'ended',token:stale}),s);
 s=apply(s,{type:'ended',token:newToken});const ended=s;
 assert.deepEqual(apply(s,{type:'failed',token:newToken}),ended);
});
test('unavailable-language browse preserves identity, current playback and progress',()=>{
 let s=apply({...restore(fixture,null),index:4},{type:'play'});const next=apply(s,{type:'language',language:'es'});
 assert.equal(next.index,s.index);assert.equal(next.playing,s.playing);assert.equal(next.token,s.token);assert.equal(fixture.language,'en');assert.match(next.notice,/English remains active/);
});
test('restore, back and jump remain silent with automatic narration enabled',()=>{
 const saved={bundleId:fixture.id,revision:fixture.revision,activityId:activity.id,automatic:true};
 let s=restore(fixture,saved);assert.equal(s.index,5);assert.equal(s.playing,false);
 s=apply(s,{type:'next'});assert.equal(s.playing,true);
 s=apply(s,{type:'back'});assert.equal(s.playing,false);
 s=apply(s,{type:'jump',index:2});assert.equal(s.playing,false);
 assert.equal(restore(fixture,{...saved,revision:'foreign'}).index,0);
 assert.equal(restore(fixture,snapshot(fixture,s)).playing,false);
});
test('unknown applicability and text/activity misbinding never become playable',()=>{
 for(const a of bundle.activities){assert.equal(eligible(a),false);const s=apply(restore(bundle,null),{type:'play'},bundle);assert.equal(s.playing,false);}
 const a=fixture.activities[0];assert.equal(eligible(a),true);
 for(const audio of [{...a.audio,applicability:'unknown'},{...a.audio,textSha256:'b'.repeat(64)},{...a.audio,activityId:'foreign'},{...a.audio,fileSha256:'bad'}])assert.equal(eligible({...a,audio}),false);
});
test('media failure retains readable current activity and explicit retry',()=>{
 let s=apply({...restore(fixture,null),index:2},{type:'play'});s=apply(s,{type:'failed',token:s.token});assert.equal(s.index,2);assert.equal(s.playing,false);assert.match(s.notice,/try Play again/);assert.equal(apply(s,{type:'play'}).playing,true);
});
test('bundled exact text identities, source pins and generated provenance remain explicit',()=>{
 assert.equal(bundle.activities.length,128);assert.equal(bundle.cookbookRevision,'71ba5327ad877951b59731ba79087ac92f7256ca');
 assert.equal(bundle.source.prototypeRevision,'0af90274f13b32a776466e436cd114e6de759783');
 for(const a of bundle.activities){assert.equal(createHash('sha256').update(a.text).digest('hex'),a.textSha256);if(a.audio.suppliedEvidence)assert.equal(a.audio.suppliedEvidence.recordingSource,'generated');assert.equal(a.audio.status,'unavailable');assert.ok(a.attribution);}
});
