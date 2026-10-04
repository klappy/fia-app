import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {alignmentPosition,alignedSegments,followScrollTop} from '../src/lib/alignment.js';
import {assets} from '../src/lib/content.js';
const manifest=JSON.parse(readFileSync('public/content/source/audio-manifest.json'));
const editions=JSON.parse(readFileSync('public/content/source/scripture.json'));
test('all three imported alignments bind the exact recording, source text and verse offsets',()=>{
 for(const asset of Object.values(assets).filter(a=>a.kind==='scripture')){
  const data=asset.alignment;const recording=manifest.entries.find(e=>e.id===asset.id);const edition=editions.find(e=>asset.id==='scripture-'+e.resourceCode);
  assert.equal(data.audioSha256,recording.sha256);assert.equal(data.sourceSha256,recording.sourceSha256);assert.equal(data.verses.length,13);
  let end=0;
  data.verses.forEach((v,i)=>{assert.equal(v.text,asset.verses[i].text);assert.equal(v.sourceHtmlSha256,edition.verses[i].contentSha256);assert.equal(v.sourceId,edition.verses[i].content_id);assert.ok(v.start>=end&&v.end>v.start&&v.end<=data.duration);end=v.end;let wordEnd=v.start;let char=0;for(const w of v.words){assert.ok(w.start>=wordEnd&&w.end>w.start&&w.end<=v.end);assert.ok(w.from>=char&&w.to>w.from&&w.to<=v.text.length);assert.equal(v.text.slice(char,w.from).trim(),'');wordEnd=w.end;char=w.to;}assert.equal(v.text.slice(char).trim(),'');assert.equal(alignedSegments(v.text,v.words).map(x=>x.text).join(''),v.text);});
 }
});
test('media-time lookup follows words within long verses, pauses in gaps and handles backwards seeks',()=>{
 const a=assets['scripture-unfoldingWordSimplified'].alignment;const v=a.verses[4];const word=v.words[12];
 assert.deepEqual(alignmentPosition(a,word.start),{verseIndex:4,wordIndex:12});
 assert.deepEqual(alignmentPosition(a,a.verses[0].words[0].start),{verseIndex:0,wordIndex:0});
 assert.deepEqual(alignmentPosition(a,(a.verses[0].end+a.verses[1].start)/2),{verseIndex:0,wordIndex:a.verses[0].words.length-1});
 assert.equal(alignmentPosition(a,NaN),null);assert.equal(alignmentPosition(null,10),null);assert.equal(alignmentPosition(a,a.duration+1),null);
});
test('scroll policy centers the spoken line instead of waiting for the viewport edge',()=>{
 const frame={top:100,height:400};
 assert.equal(followScrollTop(frame,{top:285,bottom:315},0,2000),null);
 assert.equal(followScrollTop(frame,{top:350,bottom:380},0,2000),65);
 assert.equal(followScrollTop(frame,{top:450,bottom:480},0,2000),165);
 assert.equal(followScrollTop(frame,{top:110,bottom:140},600,2000),425);
 assert.equal(followScrollTop(frame,{top:600,bottom:630},0,400),null);
 assert.equal(followScrollTop(frame,{top:600,bottom:630},1550,2000),1600);
});
test('duration fallback reveals even slight overflow before narration finishes',async()=>{
 const {durationScrollTop}=await import('../src/lib/alignment.js');
 assert.equal(durationScrollTop(0,100,400,424),0);
 assert.equal(durationScrollTop(50,100,400,424),12);
 assert.equal(durationScrollTop(90,100,400,424),24);
 assert.equal(durationScrollTop(120,100,400,424),24);
 assert.equal(durationScrollTop(50,100,400,400),null);
 assert.equal(durationScrollTop(50,0,400,424),null);
 assert.equal(durationScrollTop(50,NaN,400,424),null);
});

test('overflow opens with three lines centered, accounting for headings and larger type',async()=>{
 const {readingEdgeSpace}=await import('../src/lib/alignment.js');
 assert.deepEqual(readingEdgeSpace(400,900,40),{leading:140,trailing:200});
 assert.deepEqual(readingEdgeSpace(400,900,40,50),{leading:90,trailing:200});
 assert.deepEqual(readingEdgeSpace(400,900,60,50),{leading:60,trailing:200});
 assert.deepEqual(readingEdgeSpace(100,900,60,50),{leading:0,trailing:50});
 assert.deepEqual(readingEdgeSpace(400,200,40),{leading:0,trailing:0});
});

test('glass reading area excludes asymmetric chrome while preserving its clear center',async()=>{
 const {clearReadingRect,followScrollTop}=await import('../src/lib/alignment.js');
 const rect=clearReadingRect({top:0,bottom:640,height:640},154,504);
 assert.equal(rect.height,350);assert.equal(rect.top+rect.height/2,329);
 assert.equal(followScrollTop(rect,{top:450,bottom:480},0,1800),136);
 assert.equal(clearReadingRect({top:0,bottom:200,height:200},154,64).height,0);
});
