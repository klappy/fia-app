// Re-cut 2026-11-09 on the captain's order: "Highlighting should be antifragile and always highlight the closest matches to
// create the best UX, previous releases refused highlight features on sections there is no perfect alignment." The three
// mechanical refusals (#343: the 70 % floor, the runtime-range mismatch, zero-duration words) are now timing tiers; only a
// malformed map is refused. Source pins, byte identity and range validation are untouched elsewhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {activityWords,activityTiming,wordIndexAt,TIMING_TIERS} from '../src/lib/transcript.js';
import {createScriptController} from '../src/lib/script-controller.js';
const words=[{text:'Hello',from:0,to:5,startMs:1000,endMs:1500},{text:'world',from:6,to:11,startMs:1500,endMs:2000}];
const valid={words,matched:2,total:2,startMs:1000,endMs:2000};
test('an exact map passes unchanged; a malformed map is still refused',()=>{
 assert.deepEqual(TIMING_TIERS,['exact','clamped','approximate']);
 assert.deepEqual(activityWords(valid),words);assert.equal(activityWords(valid).tier,'exact');
 assert.deepEqual(activityTiming(valid),{words,tier:'exact',matched:2,total:2,clamped:0,respaced:0,spanClamped:false});
 for(const bad of [{matched:3},{matched:-1},{total:3},{startMs:2100},{endMs:900},{words:[words[1],words[0]]},{words:[{...words[0],endMs:900}]},{words:[{...words[0],startMs:1.5}]},{words:[]}])assert.equal(activityWords({...valid,...bad}),null,JSON.stringify(bad));
 assert.equal(activityWords(null),null);assert.equal(activityWords(valid,{startSeconds:2,endSeconds:1}),null,'an empty runtime range is not a clip');
});
test('under the 70 % floor the map is kept as the closest match, tier approximate',()=>{
 for(const matched of [0,1]){const t=activityTiming({...valid,matched});assert.equal(t.tier,'approximate');assert.deepEqual(t.words,words);assert.equal(t.words.tier,'approximate');}
 const hl=[],seeks=[],c=createScriptController({player:{play(){},seek(s){seeks.push(s);return true;}},script:[{id:'a',text:'Hello world',src:'x',fileKey:'f',startMs:1000,endMs:2000}],transcripts:new Map([['f',{words,activities:{a:{...valid,matched:0}}}]]),onHighlight:(...a)=>hl.push(a)});
 c.play('a');c.onPlayerState({src:'x',elapsed:1.6});assert.deepEqual(hl,[['a',null],['a',1]],'an approximate map still highlights and seeks');assert.equal(c.seekWord('a',0),true);assert.deepEqual(seeks,[1]);
});
test('words outside the runtime clip are clamped to it instead of refusing the whole map, tier clamped',()=>{
 const lead=activityTiming(valid,{startSeconds:1.1,endSeconds:2});
 assert.equal(lead.tier,'clamped');assert.equal(lead.clamped,1);assert.deepEqual(lead.words.map(w=>[w.startMs,w.endMs]),[[1100,1500],[1500,2000]]);
 const tail=activityTiming(valid,{startSeconds:1,endSeconds:1.9});
 assert.equal(tail.tier,'clamped');assert.deepEqual(tail.words.map(w=>[w.startMs,w.endMs]),[[1000,1500],[1500,1900]]);
 assert.deepEqual(activityTiming(valid,{startSeconds:1,endSeconds:2}).tier,'exact','a clip that contains every word changes nothing');
 for(const w of lead.words)assert.ok(w.startMs>=1100&&w.endMs<=2000,'never extends playback to fit the words');
 const span=activityTiming({...valid,endMs:2500},{startSeconds:1,endSeconds:2});
 assert.equal(span.tier,'clamped');assert.equal(span.spanClamped,true);assert.equal(span.clamped,0);assert.deepEqual(span.words,words,'a declared span past the clip is fitted even when every word is inside it');
});
test('zero-duration words share the gap to their timed neighbours by text length, tier clamped',()=>{
 const zero={words:[{text:'a',from:0,to:1,startMs:1000,endMs:1000},{text:'bbb',from:2,to:5,startMs:1000,endMs:1000},{text:'cc',from:6,to:8,startMs:1800,endMs:2000}],matched:3,total:3,startMs:1000,endMs:2000};
 const t=activityTiming(zero);assert.equal(t.tier,'clamped');assert.equal(t.respaced,2);
 assert.deepEqual(t.words.map(w=>[w.startMs,w.endMs]),[[1000,1200],[1200,1800],[1800,2000]]);
 assert.deepEqual(zero.words.map(w=>[w.startMs,w.endMs]),[[1000,1000],[1000,1000],[1800,2000]],'the sidecar object is not mutated');
 const trailing={words:[{text:'a',from:0,to:1,startMs:1000,endMs:1400},{text:'b',from:2,to:3,startMs:1400,endMs:1400}],matched:2,total:2,startMs:1000,endMs:2000};
 assert.deepEqual(activityTiming(trailing).words.map(w=>[w.startMs,w.endMs]),[[1000,1400],[1400,2000]],'a trailing run takes the rest of the clip');
 let previous=0;for(const w of t.words){assert.ok(w.startMs>=previous&&w.endMs>=w.startMs);previous=w.startMs;}
});
test('a zero-duration run with no gap between its neighbours borrows from them, so every word gets a distinct, positive interval (Codex P2 on #354)',()=>{
 // S02-U002 as committed: "or" and "gospel" at 18360 ms, and "of" starts at 18360 ms. Before: both stayed [18360,18360] and
 // wordIndexAt only ever reached "gospel". Now each neighbour lends the run its text-length share, capped at half the neighbour.
 const flush={words:[{text:'news',from:0,to:4,startMs:18000,endMs:18360},{text:'or',from:5,to:7,startMs:18360,endMs:18360},{text:'gospel',from:8,to:14,startMs:18360,endMs:18360},{text:'of',from:15,to:17,startMs:18360,endMs:18560}],matched:4,total:4,startMs:18000,endMs:18560};
 const t=activityTiming(flush);assert.equal(t.tier,'clamped');assert.equal(t.respaced,2,'the two zero-duration words; a lender is not counted');
 assert.deepEqual(t.words.map(w=>[w.startMs,w.endMs]),[[18000,18180],[18180,18250],[18250,18460],[18460,18560]]);
 assert.deepEqual(flush.words.map(w=>[w.startMs,w.endMs]),[[18000,18360],[18360,18360],[18360,18360],[18360,18560]],'the sidecar object is not mutated');
 t.words.forEach((w,i)=>{assert.ok(w.endMs>w.startMs,'positive '+i);if(i)assert.ok(w.startMs>=t.words[i-1].endMs,'non-overlapping '+i);assert.equal(wordIndexAt(t.words,w.startMs),i,'wordIndexAt reaches word '+i);assert.ok(w.startMs>=18000&&w.endMs<=18560,'inside the clip');});
 // A run at the clip's edge borrows from its one neighbour; a lender always keeps at least half of its span.
 const lead=activityTiming({words:[{text:'a',from:0,to:1,startMs:1000,endMs:1000},{text:'bb',from:2,to:4,startMs:1000,endMs:1400}],matched:2,total:2,startMs:1000,endMs:1400});
 assert.deepEqual(lead.words.map(w=>[w.startMs,w.endMs]),[[1000,1133],[1133,1400]]);assert.equal(lead.respaced,1);
 // Skewed text lengths in a span of only three milliseconds: every word still holds a distinct millisecond and the run still ends on time.
 const skew=activityTiming({words:[{text:'x',from:0,to:1,startMs:2000,endMs:2000},{text:'y',from:2,to:3,startMs:2000,endMs:2000},{text:'z'.repeat(50),from:4,to:54,startMs:2000,endMs:2000},{text:'end',from:55,to:58,startMs:2003,endMs:2500}],matched:4,total:4,startMs:2000,endMs:2500});
 assert.deepEqual(skew.words.map(w=>[w.startMs,w.endMs]),[[2000,2001],[2001,2002],[2002,2003],[2003,2500]]);
});
test('every shipped activity map in the corpus is timed at a named tier; the three #343 examples and the regenerated first screens have their known tiers',()=>{
 const dir=new URL('../../../product/audio-transcripts/',import.meta.url),found=new Map();let maps=0;
 for(const pack of readdirSync(dir,{withFileTypes:true}).filter(d=>d.isDirectory()))for(const name of readdirSync(new URL(pack.name+'/',dir)).filter(n=>n.endsWith('.words.json'))){
  const t=JSON.parse(readFileSync(new URL(pack.name+'/'+name,dir)));
  for(const [id,a] of Object.entries(t.activities||{})){
   const timing=activityTiming(a);assert.ok(timing&&TIMING_TIERS.includes(timing.tier),pack.name+' '+name+' '+id);maps++;if(['S01-U001','S01-U002','S02-U004','S05-U019'].includes(id))found.set(id,timing);
   // Codex P2 on #354: after fitting, every word of every shipped map holds a strictly positive, non-overlapping interval.
   timing.words.forEach((w,i)=>{assert.ok(w.endMs>w.startMs,pack.name+' '+id+' word '+i+' has no duration');if(i)assert.ok(w.startMs>=timing.words[i-1].endMs,pack.name+' '+id+' word '+i+' overlaps');});
  }
 }
 assert.ok(maps>=111);assert.equal(found.size,4);
 assert.equal(found.get('S02-U004').tier,'approximate');assert.equal(found.get('S05-U019').tier,'approximate');
 // I1b: the first two screens were regenerated from the recognised words of the source-recording evidence (10/12 and 23/24).
 assert.equal(found.get('S01-U001').tier,'exact');assert.equal(found.get('S01-U001').matched,10);assert.equal(found.get('S01-U001').total,12);
 assert.equal(found.get('S01-U002').tier,'exact');assert.equal(found.get('S01-U002').matched,23);assert.equal(found.get('S01-U002').total,24);
});
