import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {activityWords} from '../src/lib/transcript.js';
import {createScriptController} from '../src/lib/script-controller.js';
const words=[{text:'Hello',from:0,to:5,startMs:1000,endMs:1500},{text:'world',from:6,to:11,startMs:1500,endMs:2000}];
const valid={words,matched:2,total:2,startMs:1000,endMs:2000};
test('ASR evidence and accepted range are required; no synthetic word seek fallback',()=>{
 assert.equal(activityWords(valid),words);
 for(const bad of [{matched:0},{matched:1},{matched:3},{total:3},{startMs:1100},{endMs:1900},{words:[words[1],words[0]]}])assert.equal(activityWords({...valid,...bad}),null);
 assert.equal(activityWords(valid,{startSeconds:1.1,endSeconds:2}),null);
 assert.equal(activityWords(valid,{startSeconds:1,endSeconds:1.9}),null);
 const hl=[],c=createScriptController({player:{play(){},seek(){throw Error('invalid seek');}},script:[{id:'a',text:'Hello world',src:'x',fileKey:'f',startMs:1000,endMs:2000}],transcripts:new Map([['f',{words,activities:{a:{...valid,matched:0}}}]]),onHighlight:(...a)=>hl.push(a)});
 c.play('a');c.onPlayerState({src:'x',elapsed:1.6});assert.deepEqual(hl,[['a',null]]);assert.equal(c.seekWord('a',0),false);
});
test('shipped zero-match and overrun activities fail closed without modifying corpus',()=>{
 const dir=new URL('../../../product/audio-transcripts/',import.meta.url),found=new Set();
 for(const pack of readdirSync(dir,{withFileTypes:true}).filter(d=>d.isDirectory()))for(const name of readdirSync(new URL(pack.name+'/',dir)).filter(n=>n.endsWith('.words.json'))){
 const t=JSON.parse(readFileSync(new URL(pack.name+'/'+name,dir)));
 for(const id of ['S01-U001','S02-U004','S05-U019'])if(t.activities?.[id]){found.add(id);assert.equal(activityWords(t.activities[id]),null,id);}
 }
 assert.equal(found.size,3);
});
