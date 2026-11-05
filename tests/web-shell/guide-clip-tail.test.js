import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {tailExtendedRange,tailRoomFor,TAIL_GRACE_SECONDS,NEXT_CLIP_GUARD_SECONDS} from '../../apps/web/src/lib/range-tail.js';
import {guideSpeech} from '../../apps/web/src/lib/guide-speech.js';
// Every recorded guide clip must keep playing through the end of its last spoken word, and must never play
// into other speech. Speech ends in guide-speech.js were measured from the delivered audio by
// scripts/measure-guide-speech.py (10 ms RMS frames), so this test checks every clip of the passage.
const root=new URL('../../apps/web/public/content/delivery/',import.meta.url);
const MIN_TAIL=0.3;
// #333 played 0.5 s past the stored end and left 0.04-0.6 s before the next question number; DEV reported the number starting.
const NEXT_SOUND_MARGIN=0.25;
const deliveries=readdirSync(root).flatMap(dir=>readdirSync(new URL(dir+'/',root)).map(f=>({dir,doc:JSON.parse(readFileSync(new URL(dir+'/'+f,root)))})));
const clips=doc=>doc.entries.filter(e=>e.path.startsWith('/audio/source/')&&e.playbackRange&&e.audioReplacement).map(e=>({path:e.path,group:'audio',logicalSourceSha256:e.audioReplacement.logicalSource.sha256,sourceSha256:e.source.sha256,deliveryURL:e.delivery.url,duration:e.delivery.duration,playbackRange:e.playbackRange}));
const passages=deliveries.map(d=>({...d,files:clips(d.doc)})).filter(d=>d.files.length);
test('only Mark 1:1-13 carries recorded guide clips, and every one has a speech measurement',()=>{
 assert.deepEqual(passages.map(p=>p.dir),['eng.MRK-1-1-13'],'a new passage with recorded guide ranges needs its speech measured: run scripts/measure-guide-speech.py');
 assert.equal(passages[0].files.length,111);
 const measured=Object.values(guideSpeech.sources).reduce((n,v)=>n+Object.keys(v).length,0);
 assert.equal(measured,111);
});
const rows=[];
for(const p of passages)for(const f of p.files){
 const m=guideSpeech.sources[f.sourceSha256]?.[f.path];
 const range=tailExtendedRange(f.playbackRange,f,p.files);
 const next=Math.min(Infinity,...p.files.filter(o=>o!==f&&o.sourceSha256===f.sourceSha256&&o.playbackRange.startSeconds>f.playbackRange.startSeconds&&o.playbackRange.startSeconds>=f.playbackRange.endSeconds).map(o=>o.playbackRange.startSeconds));
 rows.push({id:f.path.replace('/audio/source/','').replace('.mp3',''),source:f.sourceSha256.slice(0,8),f,m,range,next});
}
test('every clip has a measured speech window inside its stored range',()=>{
 for(const r of rows){assert.ok(r.m,`no speech measurement for ${r.source}/${r.id}`);assert.ok(r.m.speechStartSeconds>=r.f.playbackRange.startSeconds-0.01,`${r.source}/${r.id} starts speaking before its range`);assert.ok(r.m.speechEndSeconds<=r.f.playbackRange.endSeconds+1e-9||r.next===Infinity,`${r.source}/${r.id} speech passes its stored end`);}
});
test('the tail is a plain two-key range that never enters the next clip, other speech, or the audio end',()=>{
 for(const r of rows){
  const o=r.f.playbackRange,x=r.range;
  assert.equal(Object.getPrototypeOf(x),Object.prototype);assert.deepEqual(Object.keys(x).sort(),['endSeconds','startSeconds']);
  assert.equal(x.startSeconds,o.startSeconds);
  assert.ok(x.endSeconds>=o.endSeconds,`${r.id} shrank`);
  assert.ok(x.endSeconds<=o.endSeconds+TAIL_GRACE_SECONDS+1e-9,`${r.id} extended too far`);
  assert.ok(x.endSeconds<=r.f.duration,`${r.id} past audio end`);
  if(x.endSeconds>o.endSeconds){
   assert.ok(x.endSeconds<=r.next-NEXT_CLIP_GUARD_SECONDS+1e-9,`${r.source}/${r.id} runs into the next clip`);
   if(r.m.nextSoundSeconds!==null)assert.ok(x.endSeconds<=r.m.nextSoundSeconds-NEXT_SOUND_MARGIN+1e-9,`${r.source}/${r.id} plays into the next sound (the next question number)`);
  }
 }
});
test('every clip plays at least 0.3 s past its last word unless the recording leaves no silence there',()=>{
 const tight=[];
 for(const r of rows){
  const tail=r.range.endSeconds-r.m.speechEndSeconds;
  if(tail>=MIN_TAIL-1e-9)continue;
  tight.push(`${r.source}/${r.id}`);
  // The only allowed reasons: the next clip or the next speech starts right after the stored end.
  const limit=Math.min(r.next-NEXT_CLIP_GUARD_SECONDS,(r.m.nextSoundSeconds??Infinity)-NEXT_SOUND_MARGIN);
  assert.ok(limit-r.m.speechEndSeconds<MIN_TAIL+0.011,`${r.source}/${r.id} stops ${tail.toFixed(2)} s after its last word although the audio has room`);
 }
 assert.deepEqual(tight.sort(),KNOWN_TIGHT);
});
const KNOWN_TIGHT=['6ac21bee/S03-U002','6ac21bee/S03-U005','6ac21bee/S03-U010','6ac21bee/S03-U023','76a956c8/S05-U023','76a956c8/S05-U024','76a956c8/S05-U026','76a956c8/S05-U027'];
test('Mark 1:1-13 Hear and Heart plays every slide to the end of its last word, question 3 included',()=>{
 const s1=rows.filter(r=>r.id.startsWith('S01-U'));
 assert.deepEqual(s1.map(r=>r.id),['S01-U001','S01-U002','S01-U003','S01-U004','S01-U005','S01-U006','S01-U007','S01-U008']);
 for(const r of s1)assert.ok(r.range.endSeconds-r.m.speechEndSeconds>=0.45,`${r.id} ends only ${(r.range.endSeconds-r.m.speechEndSeconds).toFixed(2)} s after its last word`);
 const q3=s1.find(r=>r.id==='S01-U005');
 assert.ok(q3.m.speechEndSeconds>40.9&&q3.range.endSeconds>=q3.m.speechEndSeconds+0.45);
});
test('Mark 1:1-13 Hear and Heart stops well before each next question number and does not run long past the last word',()=>{
 // #333 left 0.04 s (U002) to 0.61 s before the next number's onset and played 0.74-1.0 s past the last word.
 const s1=rows.filter(r=>r.id.startsWith('S01-U'));
 for(const r of s1){
  assert.ok(r.m.nextSoundSeconds-r.range.endSeconds>=NEXT_SOUND_MARGIN-1e-9,`${r.id} stops only ${(r.m.nextSoundSeconds-r.range.endSeconds).toFixed(2)} s before the next sound`);
  assert.ok(r.range.endSeconds-r.m.speechEndSeconds<=0.76,`${r.id} runs ${(r.range.endSeconds-r.m.speechEndSeconds).toFixed(2)} s past its last word`);
  assert.ok(r.range.endSeconds-r.f.playbackRange.endSeconds<=0.25+1e-9);
 }
});
test('scripture clips, unmeasured clips and files that are not recorded guide clips are left alone',()=>{
 const speech={sources:{a:{'/audio/source/S01-U001.mp3':{tailRoomSeconds:0.4}}}};
 const f={path:'/audio/source/S01-U001.mp3',logicalSourceSha256:'l',sourceSha256:'a',deliveryURL:'u',duration:10,playbackRange:{startSeconds:1,endSeconds:2}};
 const run=(file,files=[],range=file.playbackRange)=>tailExtendedRange(range,file,files,{speech});
 assert.deepEqual(run({...f,logicalSourceSha256:undefined}),f.playbackRange);
 assert.deepEqual(run({...f,scripturePlaybackMode:'passage-only'}),f.playbackRange);
 assert.deepEqual(run({...f,sourceSha256:'unmeasured'}),f.playbackRange);
 assert.equal(run(f,[],null),null);
 assert.deepEqual(run(f,[f]),{startSeconds:1,endSeconds:2.25});
 assert.deepEqual(run(f,[f,{...f,playbackRange:{startSeconds:2.1,endSeconds:3}}]),{startSeconds:1,endSeconds:2.08});
 assert.deepEqual(run(f,[f,{...f,playbackRange:{startSeconds:2,endSeconds:3}}]),f.playbackRange);
 const late={...f,duration:9.95,playbackRange:{startSeconds:8,endSeconds:9.8}};
 assert.deepEqual(run(late),{startSeconds:8,endSeconds:9.9});
 assert.equal(tailRoomFor(f,speech),0.25);assert.equal(tailRoomFor({...f,path:'x'},speech),0);
});
// The stored data does not accumulate an offset: the gap between a stored end and the last word it must reach does not
// trend with position in the recording. A drift that grows with position can then only come from the playing side
// (see opus-webm.test.js), and the slack that is there is the margin any clock error eats.
test('the gap between each stored end and its last word does not grow along the recording',()=>{
 const fit=pts=>{const n=pts.length,mx=pts.reduce((a,p)=>a+p[0],0)/n,my=pts.reduce((a,p)=>a+p[1],0)/n;let sxy=0,sxx=0;for(const [x,y] of pts){sxy+=(x-mx)*(y-my);sxx+=(x-mx)**2;}return sxy/sxx;};
 const bySource=Map.groupBy(rows,r=>r.source);
 for(const [source,list] of bySource){
  const slope=fit(list.map(r=>[r.f.playbackRange.endSeconds,r.f.playbackRange.endSeconds-r.m.speechEndSeconds]));
  assert.ok(Math.abs(slope)<=(source==='9834ac98'?0.005:0.02),`${source}: the end gap trends ${slope.toFixed(4)} s per s along the recording`);
 }
 const s1=rows.filter(r=>r.source==='9834ac98').map(r=>r.f.playbackRange.endSeconds-r.m.speechEndSeconds);
 assert.ok(Math.min(...s1)>=0.2&&Math.max(...s1)<=0.55,`S01 end gaps: ${s1.map(g=>g.toFixed(2))}`);
});
