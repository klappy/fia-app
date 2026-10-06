// fia-easy-button-policy@2 viewing cue: the pause-only flag is data, never a phrase test in the client.
// The phrase below survives only here, as a one-time migration proof over data (deletable after review).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pauseOnlyCue,policyInputFrom} from '../src/lib/easy-button-input.js';
import {decide} from '../../../packages/contracts/easy-button-policy/index.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url));
const packBytes=read('../src/lib/pack.json');
const pack=JSON.parse(packBytes);
const cues=JSON.parse(read('../src/lib/viewing-cues.json'));
const app=read('../src/App.svelte').toString();
const PHRASE=/I will pause the audio here/i;

function derivedPauseOnly(presentation){
 return presentation.activities.filter(a=>PHRASE.test(a.narration||'')&&['image','map'].includes(presentation.assets[a.assetId]?.kind)).map(a=>a.id).sort();
}

test('the flagged set equals the data-derived set (phrase in narration and image|map focal)',()=>{
 const entry=cues.presentations[pack.id];
 assert.ok(entry,`viewing-cues.json has an entry for ${pack.id}`);
 assert.deepEqual([...entry.pauseOnly].sort(),derivedPauseOnly(pack));
 assert.deepEqual([...entry.pauseOnly].sort(),['S02-U005','S02-U008','S03-U007','S03-U019','S03-U021','S05-U015']);
 assert.equal(entry.revision,createHash('sha256').update(packBytes).digest('hex'),'flags are pinned to the approved pack bytes');
 for(const a of pack.activities)assert.equal(pauseOnlyCue(pack.id,a),entry.pauseOnly.includes(a.id),a.id);
});

test('the repo\'s other presentations (full text) carry the phrase in no narration',()=>{
 let seen=0;
 for(const path of ['../../../server/fia/publication/full-text.json','../public/content/bundle.json']){
  const doc=JSON.parse(read(path));
  const walk=o=>{if(!o||typeof o!=='object')return;if(Array.isArray(o.activities)){seen++;assert.deepEqual(o.activities.filter(a=>PHRASE.test(a.narration||'')).map(a=>a.id),[],`${path} ${o.id}`);assert.equal(cues.presentations[o.id],undefined);}for(const v of Object.values(o))walk(v);};
  walk(doc);
 }
 assert.ok(seen>=2,`walked ${seen} presentations`);
});

test('the cue comes from data only: server flow first, then the activity, then viewing-cues.json',()=>{
 const a=pack.activities.find(x=>x.id==='S02-U005');
 assert.equal(pauseOnlyCue(pack.id,a),true);
 assert.equal(pauseOnlyCue('another-pack@1',a),false,'ids are scoped to their presentation');
 assert.equal(pauseOnlyCue(pack.id,{...a,flow:{cue:{pauseOnly:false}}}),false);
 assert.equal(pauseOnlyCue('another-pack@1',{...a,cue:{pauseOnly:true}}),true);
 assert.equal(pauseOnlyCue(pack.id,{...a,id:'S02-U006'}),false,'the narration text alone never sets the cue');
});

test('App.svelte carries no phrase test over narration',()=>{
 assert.equal((app.match(/I will pause/g)||[]).length,0);
 assert.doesNotMatch(app,/\.(test|match)\([^)]*narration/);
 assert.doesNotMatch(app,/narration[^;]*\.(test|match)\(/);
 assert.match(app,/viewingCue\.skipNarration/);
});

test('decide() skips narration on the six flagged visuals exactly as the :293 rule did',()=>{
 let skipped=0;
 const session={status:'ready',detour:null,preferences:{readScripture:true,describeImages:true,autoplayVideo:false}};
 for(const a of pack.activities){
  const focal=pack.assets[a.assetId];
  const matchingVideo=(focal?.relatedIds||[]).map(id=>pack.assets[id]).find(v=>v?.kind==='video'&&v.src);
  for(const automatic of [false,true]){
   const input=policyInputFrom({presentationId:pack.id,activity:a,focal,matchingVideo,session,muted:false,started:true,introduced:new Set(),automatic});
   const legacy=['image','map'].includes(focal?.kind)&&PHRASE.test(a.narration||'')&&((!!matchingVideo&&!automatic)||!!focal.descriptionAudio); // :293 @3d3b1d2, describeImages on, autoplayVideo off, unmuted
   assert.equal(decide(input).viewingCue.skipNarration,legacy,`${a.id} automatic=${automatic}`);
   if(legacy)skipped++;
  }
 }
 assert.ok(skipped>=6,`skip fired ${skipped} times`);
});
