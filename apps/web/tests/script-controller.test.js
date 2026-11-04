import test from 'node:test';
import assert from 'node:assert/strict';
import {createScriptController} from '../src/lib/script-controller.js';
const words=[{startMs:1000,endMs:1500,text:'In'},{startMs:1500,endMs:2000,text:'the'},{startMs:2200,endMs:3000,text:'beginning'}];
const sidecar={schema:'fia-word-transcript@1',activities:{a:{words},b:{words}}};
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
 const {c,calls}=setup();assert.equal(c.seekWord('b',2),true);assert.equal(calls[0][0],'play');assert.deepEqual(calls.at(-1),['seek',2.2]);
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
