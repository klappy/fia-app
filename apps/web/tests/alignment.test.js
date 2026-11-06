import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {alignmentPosition,alignedSegments,followScrollTop,leadingPosition,wordPair,activityAlignment,HIGHLIGHT_LEAD_SECONDS} from '../src/lib/alignment.js';
import {assets,activities} from '../src/lib/content.js';
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
 const whole=(elapsed,duration)=>({elapsed,duration});
 assert.equal(durationScrollTop(whole(0,100),400,424),0);
 assert.equal(durationScrollTop(whole(50,100),400,424),12);
 assert.equal(durationScrollTop(whole(90,100),400,424),24);
 assert.equal(durationScrollTop(whole(120,100),400,424),24);
 assert.equal(durationScrollTop(whole(50,100),400,400),null);
 assert.equal(durationScrollTop(whole(50,0),400,424),null);
 assert.equal(durationScrollTop(whole(50,NaN),400,424),null);
});
// Mark 1:1-13 S02-U010 is 304.51-403.61 s of one 498.77 s guide recording; its live scroll
// range is 1637 px (640 of 2277). The file clock would open it about 1044 px down.
const u010={startSeconds:304.51,endSeconds:403.61,file:498.77};
const clipAt=(range,seconds)=>({elapsed:range.startSeconds+seconds,duration:range.file,progressElapsed:Math.max(0,Math.min(range.endSeconds-range.startSeconds,seconds)),progressDuration:range.endSeconds-range.startSeconds});
test('untimed follow holds a clip cut from a shared recording at its first line',async()=>{
 const {durationScrollTop}=await import('../src/lib/alignment.js');
 assert.equal(durationScrollTop(clipAt(u010,0),640,2277),0);
 assert.equal(durationScrollTop(clipAt(u010,.5),640,2277),0);
 // Before the seek lands the clock is still at the file start; the clip has not begun.
 assert.equal(durationScrollTop({elapsed:0,duration:u010.file,progressElapsed:0,progressDuration:99.1},640,2277),0);
 // A known clip never falls back to the file clock.
 assert.equal(durationScrollTop({elapsed:304.51,duration:u010.file,progressElapsed:NaN,progressDuration:99.1},640,2277),null);
});
test('untimed follow moves linearly through the clip and reaches the end by 90 percent',async()=>{
 const {durationScrollTop}=await import('../src/lib/alignment.js');
 const length=u010.endSeconds-u010.startSeconds,range=2277-640;
 const near=(seconds,expected)=>assert.ok(Math.abs(durationScrollTop(clipAt(u010,seconds),640,2277)-expected)<1e-6,`${seconds} s`);
 near(length*.1,0);near(length*.5,range/2);near(length*.9,range);near(length,range);
 let last=0;for(let s=0;s<=length;s+=.25){const top=durationScrollTop(clipAt(u010,s),640,2277);assert.ok(top>=last&&top-last<=range/(.8*length)*.25+1e-6);last=top;}
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

 test('delivery alignment uses half-open verse boundaries and honest verse-only fallback',()=>{
 const a={schemaVersion:2,duration:100,verses:[
 {start:70,end:77.76,highlightMode:'verse',words:[]},
 {start:77.76,end:80,highlightMode:'word',words:[{start:77.76,end:78},{start:79,end:80}]},
 {start:81,end:85,highlightMode:'verse',words:[]}]};
 assert.deepEqual(alignmentPosition(a,77.75),{verseIndex:0,wordIndex:-1});
 assert.deepEqual(alignmentPosition(a,77.76),{verseIndex:1,wordIndex:0});
 assert.deepEqual(alignmentPosition(a,78.5),{verseIndex:1,wordIndex:0});
 assert.deepEqual(alignmentPosition(a,80),{verseIndex:1,wordIndex:1});
 assert.deepEqual(alignmentPosition(a,80.99),{verseIndex:1,wordIndex:1});
 assert.deepEqual(alignmentPosition(a,82),{verseIndex:2,wordIndex:-1});
 assert.equal(alignmentPosition(a,85),null);
 assert.equal(alignmentPosition(a,69.99),null);
 });
// Delivered BSB Mark 1:1-13 alignment (schema 2, delivery-media seconds).
const bsb=JSON.parse(readFileSync('public/content/scripture-alignments/c29fc710c84775459d8091aefcb87b7f06cfb3b8fceb05835730b9f639126b7c.json'));
test('the delivered BSB alignment word-times EVERY verse of Mark 1:1-13 (v4/6/7/8/10 were blank verse-only before)',()=>{
 assert.deepEqual(bsb.verses.map(v=>v.verse),[1,2,3,4,5,6,7,8,9,10,11,12,13]);
 for(const v of bsb.verses){
  assert.equal(v.highlightMode,'word',`verse ${v.verse} is word-timed`);
  assert.ok(v.words.length>0,`verse ${v.verse} has words`);
  assert.equal(v.start,v.words[0].start);assert.equal(v.end,v.words.at(-1).end);
 }
 // the runtime position walks into verse 4's words (it used to return the verse alone, then nothing)
 const v4=bsb.verses[3];
 assert.deepEqual(alignmentPosition(bsb,v4.words[0].start+.01),{verseIndex:3,wordIndex:0});
 assert.deepEqual(alignmentPosition(bsb,v4.words.at(-1).start+.01),{verseIndex:3,wordIndex:v4.words.length-1});
});
test('inside a word gap the last spoken word keeps the line instead of the verse centre',()=>{
 // The four gaps measured to pull the view back: 11.66-12.32, 12.66-12.9, 19.46-19.86, 21.28-21.7 s.
 for(const [from,to] of [[11.66,12.32],[12.66,12.9],[19.46,19.86],[21.28,21.7]]){
  const before=alignmentPosition(bsb,from-.01);
  for(let t=from;t<to;t+=.02){assert.deepEqual(alignmentPosition(bsb,t),before,`gap at ${t.toFixed(2)} s`);}
  const after=alignmentPosition(bsb,to);
  assert.ok(after.verseIndex===before.verseIndex&&after.wordIndex===before.wordIndex+1,`next word after ${to} s`);
 }
});
test('reading order never steps back and the current verse stays marked between verses',()=>{
 const first=bsb.verses[0].start,last=bsb.verses.at(-1).end;let previous=null;
 for(let t=0;t<=bsb.duration;t+=.01){
  const p=alignmentPosition(bsb,t);
  if(t<first||t>=last){assert.equal(p,null,`outside the verses at ${t.toFixed(2)} s`);continue;}
  assert.ok(p,`verse marked at ${t.toFixed(2)} s`);
  const verse=bsb.verses[p.verseIndex];
  if(verse.highlightMode==='word')assert.ok(p.wordIndex>=0,`word-timed verse targets a word at ${t.toFixed(2)} s`);
  else assert.equal(p.wordIndex,-1);
  if(previous)assert.ok(p.verseIndex>previous.verseIndex||p.verseIndex===previous.verseIndex&&p.wordIndex>=previous.wordIndex,`no backward target at ${t.toFixed(2)} s`);
  previous=p;
 }
});

test('the highlight leads the voice by a quarter second and keeps the last word at the end',()=>{
 const a=assets['scripture-unfoldingWordSimplified'].alignment;const w=a.verses[4].words[12];
 assert.equal(HIGHLIGHT_LEAD_SECONDS,0.25);
 assert.deepEqual(leadingPosition(a,w.start-0.25+0.001),{verseIndex:4,wordIndex:12});
 assert.deepEqual(leadingPosition(a,w.start-0.25-0.02),alignmentPosition(a,w.start-0.02));
 const last=a.verses.at(-1);assert.deepEqual(leadingPosition(a,last.end-0.1),alignmentPosition(a,last.end-0.1+0.25)??alignmentPosition(a,last.end-0.1));
 assert.notEqual(leadingPosition(a,last.end-0.1),null);
});
test('the gel is two words wide and slides one word at a time, never past the verse',()=>{
 assert.deepEqual(wordPair(0,5),{first:0,last:1});assert.deepEqual(wordPair(1,5),{first:1,last:2});
 assert.deepEqual(wordPair(2,5),{first:2,last:3});assert.deepEqual(wordPair(3,5),{first:3,last:4});
 assert.deepEqual(wordPair(4,5),{first:3,last:4});assert.deepEqual(wordPair(0,1),{first:0,last:0});
 for(let n=2;n<8;n++)for(let i=0;i<n;i++){const p=wordPair(i,n);assert.equal(p.last-p.first,1);assert.ok(p.first<=i&&i<=p.last);}
});
test('a card alignment from sidecar words drives the same media-time lookup as scripture',()=>{
 const text='Hear this, and put it in your hearts.';
 const words=[{text:"Hear",from:0,to:4,startMs:1000,endMs:1200},{text:"this",from:5,to:9,startMs:1300,endMs:1500},{text:"and",from:11,to:14,startMs:1900,endMs:2000}];
 const a=activityAlignment(text,words,3000);
 assert.equal(a.clockDomain,'delivery-media-seconds');assert.equal(a.verses.length,1);
 assert.equal(alignmentPosition(a,0.5),null);
 assert.deepEqual(alignmentPosition(a,1.4),{verseIndex:0,wordIndex:1});
 assert.deepEqual(alignmentPosition(a,1.7),{verseIndex:0,wordIndex:1});
 assert.deepEqual(alignmentPosition(a,1.95),{verseIndex:0,wordIndex:2});
 assert.equal(activityAlignment(text,[{from:0,to:99,startMs:0,endMs:1}],1),null,'offsets outside the shown text are refused');
 assert.equal(activityAlignment(text,[{from:5,to:9,startMs:0,endMs:1},{from:0,to:4,startMs:2,endMs:3}],1),null,'overlapping offsets are refused');
 assert.equal(activityAlignment('',words,1),null);
});
test('every guide activity in the sidecars aligns to its own narration with times that only move forward',()=>{
 const dir='public/transcripts/';let checked=0;
 for(const f of readdirSync(dir).filter(n=>n.endsWith('.words.json'))){
  const t=JSON.parse(readFileSync(dir+f));
  for(const [id,act] of Object.entries(t.activities||{})){
   const activity=activities.find(x=>x.id===id);if(!activity?.narration||!act.words?.length)continue;
   const a=activityAlignment(activity.narration,act.words,act.endMs);
   assert.ok(a,f+' '+id+' offsets fit the narration');let prev=-1;
   for(const w of a.verses[0].words){assert.ok(w.start>=prev-1e-9,f+' '+id+' moves forward');prev=w.start;}
   checked++;
  }
 }
 assert.ok(checked>=6,'checked '+checked);
});

test('activity alignment refuses stale words and normalizes both sides consistently',()=>{
 const word=(text,from,to)=>({text,from,to,startMs:0,endMs:100});
 assert.equal(activityAlignment('Read now',[word('Hear',0,4)],100),null);
 for(const [shown,spoken] of [['“Hello,”','hello'],['CAFÉ','cafe\u0301'],['Dios','DIOS'],["don’t","don't"],['爱','爱'],['שלום','שלום'],['123','123']])
   assert.ok(activityAlignment(shown,[word(spoken,0,shown.length)],100),shown);
 for(const spoken of [undefined,'','!!!','other','cafe'])
   assert.equal(activityAlignment('café',[word(spoken,0,4)],100),null,String(spoken));
 assert.equal(activityAlignment('hello',[word('hell',0,4)],100),null,'partial words refuse');
 assert.equal(activityAlignment('go now',[word('gonow',0,6)],100),null,'word separators cannot disappear');
 assert.equal(activityAlignment('Read now',[word('Read',0.5,4)],100),null,'fractional offsets refuse');
 assert.equal(activityAlignment('Read now',[word(undefined,0,4)],100),null,'missing word text refuses');
});

test('activity timing accepts adjacent tokens in scripts written without spaces',()=>{
 const words=parts=>{let from=0;return parts.map((text,i)=>{const word={text,from,to:from+text.length,startMs:i*100,endMs:(i+1)*100};from=word.to;return word;});};
 for(const parts of [['爱','人'],['読む','人'],['カタカナ','です'],['ภาษา','ไทย'],['ພາສາ','ລາວ'],['读','Bible']]){
  const shown=parts.join(''),alignment=activityAlignment(shown,words(parts),1000);
  assert.ok(alignment,shown);assert.equal(alignment.verses[0].words.length,parts.length);
  assert.equal(alignedSegments(shown,alignment.verses[0].words).map(p=>p.text).join(''),shown);
 }
});

test('activity timing rejects partial words at joining apostrophes and hyphens',()=>{
 const word=(text,from,to)=>({text,from,to,startMs:0,endMs:100});
 for(const [shown,spoken,from,to] of [["can't",'can',0,3],["can't",'t',4,5],['don’t','don',0,3],['co-operate','co',0,2],['co-operate','operate',3,10],['co-operate','co-',0,3],['co‐operate','co',0,2],['co‑operate','operate',3,10]])
  assert.equal(activityAlignment(shown,[word(spoken,from,to)],100),null,shown+' / '+spoken);
 for(const [shown,spoken] of [["can't",'cant'],['co-operate','cooperate'],['co‐operate','cooperate'],['co‑operate','cooperate'],['“hello”','hello']])
  assert.ok(activityAlignment(shown,[word(spoken,0,shown.length)],100),shown);
});

test('unspaced activity tokens cannot split combining marks or surrogate pairs',()=>{
 const word=(text,from,to)=>({text,from,to,startMs:0,endMs:100});
 assert.ok(activityAlignment('किताब',[word('किताब',0,5)],100));
 assert.ok(activityAlignment('กิคน',[word('กิ',0,2),{...word('คน',2,4),startMs:100,endMs:200}],200));
 assert.equal(activityAlignment('กิคน',[word('ก',0,1)],100),null,'Thai base and vowel stay together');
 assert.equal(activityAlignment('cafe\u0301',[word('cafe',0,4)],100),null,'decomposed accent stays with its letter');
 assert.equal(activityAlignment('爱𠮷',[word('爱',0,2)],100),null,'a span cannot end inside a surrogate pair');
});

test('joining punctuation uses the same compatibility normalization as activity words',()=>{
 const word=(text,from,to)=>({text,from,to,startMs:0,endMs:100});
 for(const joiner of ['-','‐','‑','－','﹣',"'",'‘','’','＇','\u00ad','\u200c','\u200d','\u2060']){
  const shown='co'+joiner+'operate';
  assert.equal(activityAlignment(shown,[word('co',0,2)],100),null,joiner+' prefix');
  assert.equal(activityAlignment(shown,[word('operate',3,10)],100),null,joiner+' suffix');
  assert.ok(activityAlignment(shown,[word('cooperate',0,shown.length)],100),joiner+' full token');
 }
});
