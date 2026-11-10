import test from 'node:test';
import assert from 'node:assert/strict';
import {createScriptController} from '../src/lib/script-controller.js';
const words=[{startMs:1000,endMs:1500,text:'In'},{startMs:1500,endMs:2000,text:'the'},{startMs:2200,endMs:3000,text:'beginning'}];
const sidecar={schema:'fia-word-transcript@1',activities:{a:{words,matched:3,total:3,startMs:1000,endMs:3000},b:{words:words.map(w=>({...w,startMs:w.startMs+4000,endMs:w.endMs+4000})),matched:3,total:3,startMs:5000,endMs:7000}}};
const script=[{id:'a',text:'In the beginning',fileKey:'F',src:'blob:F',startMs:1000,endMs:3000},{id:'b',text:'In the beginning',fileKey:'F',src:'blob:F',startMs:5000,endMs:7000},{id:'c',text:'x',fileKey:'G',src:'blob:G',startMs:0,endMs:900}];
function setup(){const calls=[],hl=[],adv=[];const player={play:(...a)=>calls.push(['play',...a]),seek:s=>{calls.push(['seek',s]);return true;},stop:()=>calls.push(['stop'])};
 const c=createScriptController({player,script,transcripts:new Map([['F',sidecar]]),onHighlight:(id,w)=>hl.push([id,w]),onAdvance:(n,from)=>adv.push([n,from])});return {c,calls,hl,adv};}
test('controller tells the player what to play, by file identity and range; the player is told nothing about screens',()=>{
 const {c,calls}=setup();c.play('b');assert.deepEqual(calls[0],['play','In the beginning','blob:F',1,{startSeconds:5,endSeconds:7},'F']);
});
test('highlight follows the player clock from the sidecar, once per word change',()=>{
 const {c,hl}=setup();c.play('a');
 for(const t of [0.5,1.1,1.2,1.6,2.1,2.5])c.onPlayerState({src:'blob:F',elapsed:t});
 assert.deepEqual(hl.map(h=>h[1]),[null,0,1,2]);
});
test('end of audio auto-advances exactly once to the next span; last span advances to null',()=>{
 const {c,adv}=setup();c.play('a');c.onPlayerEnd();c.onPlayerEnd();assert.deepEqual(adv,[['b','a']]);c.play('c');c.onPlayerEnd();assert.deepEqual(adv.at(-1),[null,'c']);
});
test('seekWord seeks to the word millisecond, playing its screen first when needed; no sidecar means no seek',()=>{
 const {c,calls}=setup();assert.equal(c.seekWord('b',2),true);assert.equal(calls[0][0],'play');assert.deepEqual(calls.at(-1),['seek',6.2]);
 assert.equal(c.seekWord('c',0),false);assert.equal(c.seekWord('zz',0),false);
});
test('controller survives player stops of other screens and never creates players',()=>{
 const {c}=setup();c.play('a');assert.equal(c.current,'a');assert.equal(c.next('a'),'b');assert.equal(c.next('c'),null);
});
test('a Scripture sidecar with only top-level words (no activities map) still drives the highlight',()=>{
 const hl=[];const top={schema:'fia-word-transcript@1',activities:{},words};
 const c=createScriptController({player:{play(){},seek:()=>true,stop(){}},script,transcripts:new Map([['F',top]]),onHighlight:(id,w)=>hl.push([id,w]),onAdvance(){}});
 c.play('a');for(const t of [0.5,1.1,1.6,2.5])c.onPlayerState({src:'blob:F',elapsed:t});
 assert.deepEqual(hl.map(h=>h[1]),[null,0,1,2]);
});
test('qualified continuous rows use one play and one clock through pause, forward and backward seeks',()=>{
 const calls=[],changes=[],highlights=[],adv=[];
 const c=createScriptController({player:{play:(...a)=>calls.push(['play',...a]),seek:s=>calls.push(['seek',s]),stop:()=>calls.push(['stop'])},script:[],transcripts:new Map([['F',sidecar]]),onSpan:(id,from)=>changes.push([id,from]),onHighlight:(id,w)=>highlights.push([id,w]),onAdvance:(n,id)=>adv.push(id)});
 const spans=script.slice(0,2).map(s=>({...s,range:{startSeconds:s.startMs/1000,endSeconds:s.endMs/1000}}));
 assert.equal(c.playContinuous(spans),true);
 c.onPlayerState({src:'blob:F',playing:true,elapsed:1.6});
 c.onPlayerState({src:'blob:F',playing:false,elapsed:1.6});
 c.onPlayerState({src:'blob:F',playing:true,elapsed:5.6});
 assert.equal(c.current,'b');assert.deepEqual(c.currentRange,spans[1].range);
 c.onPlayerState({src:'blob:F',playing:false,elapsed:1.6});
 assert.equal(c.current,'a');assert.deepEqual(changes,[['b','a'],['a','b']]);
 assert.equal(calls.length,1);assert.deepEqual(calls[0][4],{startSeconds:1,endSeconds:7});
 c.onPlayerState({src:null,playing:false,elapsed:0});assert.equal(c.current,'a');
 c.onPlayerEnd();c.onPlayerEnd();assert.deepEqual(adv,['b']);assert.equal(calls.length,1);
 c.stop();c.onPlayerState({src:'blob:F',elapsed:5.6});assert.equal(c.current,null);
});
test('continuous transport rejects mixed identity, overlap and invalid bounds',()=>{
 const {c,calls}=setup();const spans=script.slice(0,2).map(s=>({...s,range:{startSeconds:s.startMs/1000,endSeconds:s.endMs/1000}}));
 for(const mutate of [s=>s[1].fileKey='other',s=>s[1].src='blob:other',s=>s[1].range.startSeconds=2,s=>s[1].range.endSeconds=NaN]){const x=structuredClone(spans);mutate(x);assert.equal(c.playContinuous(x),false);}
 assert.equal(calls.length,0);
});
// Audio is the player; the pages turn to the audio (captain, 2026-11-09). A run seeks over the gaps, re-anchors late
// boundaries, lets a page jump seek the session, and ends at the confirmation stop with the player's own range end.
const runSpans=[{id:'a',text:'In the beginning',fileKey:'F',src:'blob:F',range:{startSeconds:1,endSeconds:3}},{id:'b',text:'In the beginning',fileKey:'F',src:'blob:F',range:{startSeconds:5,endSeconds:7}},{id:'q',text:'Question',fileKey:'F',src:'blob:F',range:{startSeconds:8,endSeconds:9.25}}];
function runSetup({seekOk=true,reenter=false}={}){
 const calls=[],changes=[],hl=[],adv=[];let c;
 const player={play:(...a)=>calls.push(['play',...a]),seek:s=>{calls.push(['seek',s]);if(reenter)c.onPlayerState({src:'blob:F',playing:true,elapsed:s});return seekOk;},stop:()=>calls.push(['stop'])};
 c=createScriptController({player,script:[],transcripts:new Map([['F',sidecar]]),onSpan:(id,from)=>changes.push([id,from]),onHighlight:(id,w)=>hl.push([id,w]),onAdvance:(n,id)=>adv.push([n,id])});
 return {c,calls,changes,hl,adv};
}
test('a run plays the outer range once and seeks over the gap between clips at the authored end, never voicing it',()=>{
 const {c,calls,changes}=runSetup();assert.equal(c.playRun(runSpans),true);
 assert.deepEqual(calls[0],['play','In the beginning','blob:F',1,{startSeconds:1,endSeconds:9.25},'F']);assert.deepEqual(c.run,['a','b','q']);
 c.onPlayerState({src:'blob:F',playing:true,elapsed:2.9});assert.equal(c.current,'a');assert.equal(calls.length,1);
 c.onPlayerState({src:'blob:F',playing:true,elapsed:3.02});
 assert.deepEqual(calls[1],['seek',5]);assert.equal(c.current,'b');assert.deepEqual(changes,[['b','a']]);
 c.onPlayerState({src:'blob:F',playing:true,elapsed:7.01});assert.deepEqual(calls[2],['seek',8]);assert.equal(c.current,'q');
 c.onPlayerState({src:'blob:F',playing:true,elapsed:9.1});assert.equal(calls.length,3);assert.equal(c.current,'q');
 c.onPlayerState({src:null,playing:false,elapsed:0});c.onPlayerEnd();c.onPlayerEnd();assert.equal(c.run,null);assert.equal(c.inRun('q'),false);
});
test('the player clock reported inside the seek itself is not a crossing; the page turns once',()=>{
 const {c,calls,changes}=runSetup({reenter:true});c.playRun(runSpans);
 c.onPlayerState({src:'blob:F',playing:true,elapsed:3.1});assert.deepEqual(changes,[['b','a']]);assert.equal(calls.filter(x=>x[0]==='seek').length,1);assert.equal(c.current,'b');
});
test('a refused gap seek leaves the clock rule in charge: the page turns when the clock reaches the next span',()=>{
 const {c,changes}=runSetup({seekOk:false});c.playRun(runSpans);
 c.onPlayerState({src:'blob:F',playing:true,elapsed:3.5});assert.equal(c.current,'a');assert.deepEqual(changes,[]);
 c.onPlayerState({src:'blob:F',playing:true,elapsed:5.1});assert.equal(c.current,'b');assert.deepEqual(changes,[['b','a']]);
});
test('a boundary reached more than 250 ms late re-anchors the audio at the span start; an on-time one does not',()=>{
 const {c,calls}=runSetup();c.playRun(runSpans);
 c.onPlayerState({src:'blob:F',playing:true,elapsed:5.2});assert.equal(c.current,'b');assert.equal(calls.length,1);
 c.onPlayerState({src:'blob:F',playing:true,elapsed:8.4});assert.equal(c.current,'q');assert.deepEqual(calls[1],['seek',8]);
});
test('pause freezes the page: no clock, no page turn; a paused clock report still turns the page without a transport action',()=>{
 const {c,calls,changes}=runSetup();c.playRun(runSpans);
 c.onPlayerState({src:'blob:F',playing:false,elapsed:2});assert.equal(c.current,'a');
 c.onPlayerState({src:'blob:F',playing:false,elapsed:5.1});assert.equal(c.current,'b');assert.deepEqual(changes,[['b','a']]);assert.equal(calls.length,1);
});
test('jumpTo seeks the running session to a span start and keeps the play/pause state: no play, pause or stop',()=>{
 const {c,calls,changes,hl}=runSetup();c.playRun(runSpans);
 assert.equal(c.inRun('q'),true);assert.equal(c.inRun('zz'),false);
 assert.equal(c.jumpTo('q'),true);assert.deepEqual(calls.at(-1),['seek',8]);assert.equal(c.current,'q');assert.deepEqual(changes,[]);assert.deepEqual(hl.at(-1),['q',null]);
 assert.equal(c.jumpTo('a'),true);assert.deepEqual(calls.at(-1),['seek',1]);assert.equal(c.current,'a');
 assert.equal(c.jumpTo('zz'),false);assert.equal(calls.filter(x=>x[0]==='play').length,1);assert.equal(calls.some(x=>x[0]==='stop'),false);
 c.onPlayerState({src:'blob:F',playing:true,elapsed:1.5});assert.equal(c.current,'a');
});
test('jumpTo fails closed when the player refuses the seek or no run is active',()=>{
 const {c}=runSetup({seekOk:false});c.playRun(runSpans);assert.equal(c.jumpTo('b'),false);assert.equal(c.current,'a');
 const {c:idle}=runSetup();assert.equal(idle.jumpTo('a'),false);idle.play('a');assert.equal(idle.jumpTo('a'),false);
});
test('a run ends at its last span through the player range end and advances once, like a single clip',()=>{
 const {c,adv,changes}=runSetup();c.playRun(runSpans);c.onPlayerState({src:'blob:F',playing:true,elapsed:5.1});
 c.onPlayerState({src:null,playing:false,elapsed:0});c.onPlayerEnd();c.onPlayerEnd();
 assert.deepEqual(changes,[['b','a'],['q','b']]);assert.deepEqual(adv,[[null,'q']]);
});
test('the authored together-list keeps its special case: the clock crosses its rows with no seek at all',()=>{
 const {c,calls}=runSetup();const spans=runSpans.slice(0,2);c.playContinuous(spans);
 c.onPlayerState({src:'blob:F',playing:true,elapsed:3.5});assert.equal(c.current,'a');c.onPlayerState({src:'blob:F',playing:true,elapsed:5.5});assert.equal(c.current,'b');
 assert.equal(calls.length,1);assert.deepEqual(c.run,['a','b']);
});
test('stop() ends the run: jumpTo and inRun refuse afterwards',()=>{
 const {c}=runSetup();c.playRun(runSpans);c.stop();assert.equal(c.inRun('a'),false);assert.equal(c.jumpTo('a'),false);assert.equal(c.run,null);
});
test('rejected row custody stops a continuous session without final advance',()=>{
 const calls=[],adv=[];const c=createScriptController({player:{play(){},stop:()=>calls.push('stop')},script:[],transcripts:new Map(),onSpan:()=>false,onAdvance:()=>adv.push('advance')});
 c.playContinuous(script.slice(0,2).map(s=>({...s,range:{startSeconds:s.startMs/1000,endSeconds:s.endMs/1000}})));
 c.onPlayerState({src:'blob:F',elapsed:5.1});c.onPlayerEnd();assert.equal(c.current,null);assert.deepEqual(calls,['stop']);assert.deepEqual(adv,[]);
});
// #361 review: a clock that crossed several spans at once (a backgrounded page, then a visibility sync) gets the same
// rules as a single crossing: a late landing re-anchors at the span the clock is in, and a landing in a later gap is seeked over.
test('a clock that skips past more than one span re-anchors at the span it lands in, or seeks over the gap it lands in',()=>{
 {const {c,calls,changes}=runSetup();c.playRun(runSpans);
  c.onPlayerState({src:'blob:F',playing:true,elapsed:8.6});assert.equal(c.current,'q');assert.deepEqual(changes,[['q','a']]);assert.deepEqual(calls[1],['seek',8]);}
 {const {c,calls,changes}=runSetup();c.playRun(runSpans);
  c.onPlayerState({src:'blob:F',playing:true,elapsed:7.05});assert.equal(c.current,'q');assert.deepEqual(changes,[['q','a']]);assert.deepEqual(calls[1],['seek',8]);}
 {const {c,calls}=runSetup();c.playRun(runSpans);
  c.onPlayerState({src:'blob:F',playing:true,elapsed:8.1});assert.equal(c.current,'q');assert.equal(calls.length,1);}
});
