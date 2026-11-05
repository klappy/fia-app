import test from 'node:test';
import assert from 'node:assert/strict';
import {TRANSCRIPT_SCHEMA,validateTranscript,wordIndexAt,seekMsForWord,highlightSegments} from '../src/lib/transcript.js';
const words=[{startMs:100,endMs:400,text:'In',from:0,to:2},{startMs:400,endMs:900,text:'the',from:3,to:6},{startMs:1200,endMs:1800,text:'beginning',from:7,to:16}];
const t={schema:TRANSCRIPT_SCHEMA,clockDomain:'delivery-media-seconds',durationMs:2000,words,activities:{a:{startMs:100,endMs:1800,words}}};
test('valid transcript passes; malformed ones are refused',()=>{
 assert.equal(validateTranscript(t),t);
 for(const bad of [null,{...t,schema:'x'},{...t,clockDomain:'wall'},{...t,durationMs:0},{...t,words:[]},{...t,words:[{startMs:5,endMs:1,text:'x'}]},{...t,words:[{startMs:500,endMs:600,text:'a'},{startMs:100,endMs:200,text:'b'}]},{...t,words:[{startMs:0,endMs:3000,text:'a'}]}])assert.throws(()=>validateTranscript(bad));
});
test('wordIndexAt holds the last started word through gaps and is null outside speech',()=>{
 assert.equal(wordIndexAt(words,50),null);assert.equal(wordIndexAt(words,100),0);assert.equal(wordIndexAt(words,399),0);assert.equal(wordIndexAt(words,400),1);
 assert.equal(wordIndexAt(words,1000),1);assert.equal(wordIndexAt(words,1200),2);assert.equal(wordIndexAt(words,1799),2);assert.equal(wordIndexAt(words,1800),null);assert.equal(wordIndexAt(words,NaN),null);
});
test('seekMsForWord returns the exact millisecond of any word',()=>{
 assert.equal(seekMsForWord(words,2),1200);assert.equal(seekMsForWord(words,3),null);assert.equal(seekMsForWord(words,-1),null);
});
test('highlightSegments marks the spoken, active and upcoming words and keeps every character',()=>{
 const text='In the beginning';const seg=highlightSegments(text,words,1300);
 assert.equal(seg.map(s=>s.text).join(''),text);
 assert.deepEqual(seg.filter(s=>s.wordIndex!==undefined).map(s=>[s.active,s.spoken]),[[false,true],[false,true],[true,false]]);
});
import {readdirSync,readFileSync,existsSync} from 'node:fs';
test('every committed word-map sidecar is schema-valid and named by its audio hash',()=>{
 const dir=new URL('../../../product/audio-transcripts/eng.MRK-1-1-13/',import.meta.url);if(!existsSync(dir))return;
 const files=readdirSync(dir).filter(f=>f.endsWith('.words.json'));assert.ok(files.length>0);
 for(const f of files){const t=validateTranscript(JSON.parse(readFileSync(new URL(f,dir),'utf8')));assert.equal(f,t.audioSha256+'.words.json');}
});
