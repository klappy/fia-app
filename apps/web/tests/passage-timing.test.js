import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {alignmentFromSidecar} from '../src/lib/passage-timing.js';
import {alignmentPosition,alignedSegments,durationScrollTop} from '../src/lib/alignment.js';
const mk=(text,t0)=>text.split(' ').map((w,i)=>({startMs:t0+i*500,endMs:t0+i*500+400,text:w}));
const verses=[{number:1,text:'In the beginning God made'},{number:2,text:'Then there was light'},{number:3,text:'And God saw it was good'}];
const sidecar=words=>({schema:'fia-word-transcript@1',durationMs:20000,activities:{},words});
test('every verse timed: word-level spans, page turns at the spoken times',()=>{
 const sc=sidecar([...mk('In the beginning God made',1000),...mk('Then there was light',6000),...mk('And God saw it was good',10000)]);
 const a=alignmentFromSidecar(verses,sc);
 assert.equal(a.verses.length,3);assert.deepEqual(a.verses.map(v=>v.highlightMode),['word','word','word']);
 assert.deepEqual(alignmentPosition(a,1.1),{verseIndex:0,wordIndex:0});
 assert.deepEqual(alignmentPosition(a,6.6),{verseIndex:1,wordIndex:1});
 assert.equal(alignmentPosition(a,10.1).verseIndex,2);
 const segs=alignedSegments(verses[0].text,a.verses[0].words);assert.equal(segs.filter(s=>s.wordIndex!==undefined).length,5);
});
test('a verse the sidecar does not carry is verse-timed inside the gap, and never highlights a word',()=>{
 const sc=sidecar([...mk('In the beginning God made',1000),...mk('And God saw it was good',12000)]);
 const a=alignmentFromSidecar(verses,sc);
 assert.equal(a.verses[1].highlightMode,'verse');assert.deepEqual(a.verses[1].words,[]);
 assert(a.verses[1].start>=a.verses[0].end&&a.verses[1].end<=a.verses[2].start);
 const p=alignmentPosition(a,8);assert.deepEqual(p,{verseIndex:1,wordIndex:-1});
});
test('words the recording left out are interpolated between matched neighbours; a text under the match floors is still timed, marked approximate',()=>{
 const sc=sidecar([...mk('In the God made',1000),...mk('Then there was light',6000),...mk('And God saw it was good',10000)]);
 const a=alignmentFromSidecar(verses,sc);const w=a.verses[0].words;assert.equal(w.length,5);assert.equal(a.timing,'exact');
 assert(w[2].start>=w[1].end&&w[2].end<=w[3].start+1e-9);
 // Captain 2026-11-09: never refuse for an imperfect alignment. Below the floors every verse is verse-timed across the playback
 // range (the whole file without one) by text length (page turns on time, no word highlighted on a guess), and the result says so.
 const spoken=mk('completely unrelated spoken words appear here instead of it',0),low=alignmentFromSidecar(verses,sidecar(spoken));
 assert.equal(low.timing,'approximate');assert.equal(low.verses.length,3);assert.deepEqual(low.verses.map(v=>v.highlightMode),['verse','verse','verse']);
 assert.equal(low.verses[0].start,0);assert.equal(+low.verses[2].end.toFixed(6),20,'no range: the file is the span');
 for(let i=1;i<3;i++)assert(low.verses[i].start>=low.verses[i-1].end-1e-9,'verse order');
 assert.deepEqual(alignmentPosition(low,0.2),{verseIndex:0,wordIndex:-1});
 // A verse that still reaches its own floor keeps word timing even when the passage as a whole is under the spoken floor.
 const partial=alignmentFromSidecar(verses,sidecar([...mk('In the beginning God made',1000),...mk('nothing of this is in the text at all nor this nor that',6000)]));
 assert.equal(partial.timing,'approximate');assert.equal(partial.verses[0].highlightMode,'word');assert.equal(partial.verses[0].words.length,5);assert.equal(partial.verses[1].highlightMode,'verse');
 assert.equal(alignmentFromSidecar(verses,null),null);assert.equal(alignmentFromSidecar([],sc),null);
});
test('verses before the only anchor still get time: an unanchored edge run takes the playback range, not the first spoken word (Codex P2 on #354)',()=>{
 // The only usable anchor is verse 2 and the unmatched speech follows it, so the first spoken word IS verse 2's start.
 const spoken=[...mk('Then there was light',6000),...mk('mumble mumble mumble mumble mumble mumble mumble mumble mumble mumble',8000)];
 const a=alignmentFromSidecar(verses,sidecar(spoken),{range:{startSeconds:2,endSeconds:20}});
 assert.equal(a.timing,'approximate');assert.deepEqual(a.verses.map(v=>v.highlightMode),['verse','word','verse']);
 assert.equal(a.verses[0].start,2);assert.equal(a.verses[0].end,a.verses[1].start);assert.ok(a.verses[0].end>a.verses[0].start,'verse 1 is no longer a zero-length span');
 assert.deepEqual(alignmentPosition(a,3),{verseIndex:0,wordIndex:-1});assert.equal(alignmentPosition(a,6.1).verseIndex,1);
 assert.equal(a.verses[2].start,a.verses[1].end);assert.equal(a.verses[2].end,20);assert.deepEqual(alignmentPosition(a,15),{verseIndex:2,wordIndex:-1});
 const whole=alignmentFromSidecar(verses,sidecar(spoken));assert.equal(whole.verses[0].start,0);assert.equal(whole.verses[2].end,20,'without a range the file is the range');
 const m=alignmentFromSidecar(verses,sidecar(spoken),{range:{startSeconds:2,endSeconds:20},mapping:{scale:1,offsetSeconds:2}});assert.equal(m.verses[0].start,0,'the boundary goes through the clock mapping like every other time');
});
test('a retained word in the 250 ms slack outside the range never widens an unmatched edge run past the playback boundary (Codex P2 on #354)',()=>{
 // Verse 2 is spoken inside the range; a stray word 200 ms before it starts and one 100 ms after it ends are retained by the
 // slack; verses 1 and 3 are unmatched edge runs. Every timestamp they get must lie inside the range, not at the stray words.
 const range={startSeconds:2,endSeconds:10};
 const spoken=[{startMs:1800,endMs:1900,text:'mumble'},...mk('Then there was light',5000),{startMs:10100,endMs:10200,text:'mumble'}];
 const a=alignmentFromSidecar(verses,sidecar(spoken),{range});
 assert.deepEqual(a.verses.map(v=>v.highlightMode),['verse','word','verse']);
 assert.equal(a.verses[0].start,2);assert.equal(a.verses[0].end,a.verses[1].start);assert.equal(a.verses[2].start,a.verses[1].end);assert.equal(a.verses[2].end,10);
 for(const v of a.verses){for(const t of [v.start,v.end,...v.words.flatMap(w=>[w.start,w.end])])assert.ok(t>=2&&t<=10,'inside the range: '+t);}
 assert.deepEqual(alignmentPosition(a,2.5),{verseIndex:0,wordIndex:-1});assert.deepEqual(alignmentPosition(a,9.9),{verseIndex:2,wordIndex:-1});
 const m=alignmentFromSidecar(verses,sidecar(spoken),{range,mapping:{scale:1,offsetSeconds:2}});assert.equal(m.verses[0].start,0);assert.equal(m.verses[2].end,8);
});
test('a matched word kept by the slack but crossing the playback boundary is clamped to it before edge verses are allocated (Codex P2 on #354)',()=>{
 const range={startSeconds:2,endSeconds:10};
 // "In" starts 200 ms before the range and "light" ends 200 ms after it; verse 3 is unmatched and trails.
 const spoken=[{startMs:1800,endMs:2100,text:'In'},...mk('the beginning God made',2200),...mk('Then there was',8000),{startMs:9900,endMs:10200,text:'light'}];
 const a=alignmentFromSidecar(verses,sidecar(spoken),{range});
 assert.deepEqual(a.verses.map(v=>v.highlightMode),['word','word','verse']);
 assert.equal(a.verses[0].words[0].start,2);assert.equal(a.verses[0].words[0].end,2.1);assert.equal(a.verses[0].start,2);
 assert.equal(a.verses[1].words.at(-1).start,9.9);assert.equal(a.verses[1].words.at(-1).end,10);assert.equal(a.verses[1].end,10);
 assert.deepEqual([a.verses[2].start,a.verses[2].end],[10,10],'no playback is left for the trailing verse: it sits at the boundary, never after it');
 for(const v of a.verses){for(const t of [v.start,v.end,...v.words.flatMap(w=>[w.start,w.end])])assert.ok(t>=2&&t<=10,'inside the range: '+t);}
 for(let i=1;i<3;i++)assert.ok(a.verses[i].start>=a.verses[i-1].end-1e-9,'never inverts');
 assert.deepEqual(alignmentPosition(a,9.95),{verseIndex:1,wordIndex:3});assert.equal(alignmentPosition(a,2.05).verseIndex,0);
});
test('a matched word the range clamp moves marks the reading clamped, not exact; the spans are unchanged (Codex P2 #2 on #365)',()=>{
 const range={startSeconds:0.5,endSeconds:15};
 const words=[...mk('In the beginning God made',1000),...mk('Then there was light',6000),...mk('And God saw it was',10000)];
 // "good" starts inside the range and ends 100 ms past its end: the 250 ms slack keeps it, the clamp moves its end to 15 s.
 const crossing=alignmentFromSidecar(verses,sidecar([...words,{startMs:14800,endMs:15100,text:'good'}]),{range});
 assert.equal(crossing.timing,'clamped');assert.deepEqual(crossing.verses.map(v=>v.highlightMode),['word','word','word']);
 assert.equal(crossing.verses[2].words.at(-1).start,14.8);assert.equal(crossing.verses[2].words.at(-1).end,15,'the clamped end is what the screen uses');
 // The same reading with "good" fully inside the range is untouched: exact, and every other span is identical.
 const inside=alignmentFromSidecar(verses,sidecar([...words,{startMs:14800,endMs:14950,text:'good'}]),{range});
 assert.equal(inside.timing,'exact');
 assert.deepEqual(crossing.verses.slice(0,2),inside.verses.slice(0,2));assert.deepEqual(crossing.verses[2].words.slice(0,-1),inside.verses[2].words.slice(0,-1));
 // The existing exact case (no range) stays exact; below the floors approximate still wins over clamped.
 assert.equal(alignmentFromSidecar(verses,sidecar([...mk('In the beginning God made',1000),...mk('Then there was light',6000),...mk('And God saw it was good',10000)])).timing,'exact');
 // Here "In" starts 200 ms before the range (kept by the slack, clamped) in a word-timed verse, but the passage is under the spoken floor.
 const low=alignmentFromSidecar(verses,sidecar([{startMs:300,endMs:700,text:'In'},...mk('the beginning God made',1000),...mk('nothing of this is in the text at all nor this nor that nor any',4000)]),{range});
 assert.equal(low.verses[0].highlightMode,'word');assert.equal(low.verses[0].words[0].start,0.5);assert.equal(low.timing,'approximate');
});
test('playbackRange trims the sidecar and the timing mapping converts to the player clock',()=>{
 const sc=sidecar([...mk('Stray words before',0),...mk('In the beginning God made',5000),...mk('Then there was light',9000),...mk('And God saw it was good',13000)]);
 const a=alignmentFromSidecar(verses,sc,{range:{startSeconds:5,endSeconds:20}});
 assert(a.verses[0].start>=5-0.25);
 const m=alignmentFromSidecar(verses,sc,{range:{startSeconds:5,endSeconds:20},mapping:{scale:1,offsetSeconds:5}});
 assert.equal(+(a.verses[0].start-m.verses[0].start).toFixed(6),5);
});
test('real Berean Mark 1:1-13 sidecar: 13 verses, timed ones word-level, untimed verses placed in the gaps (not by elapsed/duration)',()=>{
 const dir=new URL('../public/content/packs/eng.MRK-1-1-13/',import.meta.url);
 const pack=JSON.parse(readFileSync(new URL(readdirSync(dir).find(f=>f.endsWith('.json')),dir)));
 const asset=pack.assets.scripture?.['scripture-BereanStandardBible']??Object.values(pack.assets).find(x=>x.kind==='scripture'&&x.verses?.length===13);
 const sc=JSON.parse(readFileSync(new URL('../public/transcripts/0599996af6b15cf55853cfee33d2b4405e5ee95bd9068f297c5b4b4c24284235.words.json',import.meta.url)));
 const a=alignmentFromSidecar(asset.verses,sc,{});
 assert.equal(a.verses.length,13);
 const modes=a.verses.map(v=>v.highlightMode[0]).join('');assert.match(modes,/^(w|v)+$/);assert(modes.split('w').length-1>=7);
 for(let i=1;i<13;i++)assert(a.verses[i].start>=a.verses[i-1].start-1e-9,'verse starts are monotonic');
 // the old duration scroll puts 60 s of a 320 s file at ~19% of the page; the timing puts it at the verse actually being read
 const p=alignmentPosition(a,60);assert(p.verseIndex>=5&&p.verseIndex<=7);
});

test('every verse of Mark 1:1–13 (Berean) is word-timed: no verse is left without a word highlight', async () => {
  const {readFileSync} = await import('node:fs');
  const {assets} = await import('../src/lib/content.js');
  const side = JSON.parse(readFileSync(new URL('../public/transcripts/0599996af6b15cf55853cfee33d2b4405e5ee95bd9068f297c5b4b4c24284235.words.json', import.meta.url), 'utf8'));
  const asset = assets['scripture-BereanStandardBible'];
  const out = alignmentFromSidecar(asset.verses, side, { range: { startSeconds: 4.4, endSeconds: 97.1 }, mapping: { scale: 1, offsetSeconds: 0 } });
  assert.equal(out.verses.length, 13);
  const tokens = t => (t.match(/[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu) || []).length;
  out.verses.forEach((v, i) => {
    assert.equal(v.highlightMode, 'word', `verse ${asset.verses[i].number} is word-timed`);
    assert.equal(v.words.length, tokens(asset.verses[i].text), `verse ${asset.verses[i].number} times every word`);
    v.words.forEach((w, k) => { assert.ok(w.end >= w.start); if (k) assert.ok(w.start >= v.words[k - 1].start); });
    if (i) assert.ok(v.start >= out.verses[i - 1].end - 0.5, `verse ${asset.verses[i].number} follows ${asset.verses[i - 1].number}`);
  });
});
