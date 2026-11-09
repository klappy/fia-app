// Real App + shipped contracts/descriptors/sidecars, SYNTHETIC player clock/transport.
// This does not decode the source recording or certify acoustic synchronization.
import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,within} from '@testing-library/svelte';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {tick} from 'svelte';
const audio=vi.hoisted(()=>({play:vi.fn(),pause:vi.fn(),resume:vi.fn(),stop:vi.fn(),seek:vi.fn(),sync:vi.fn(),active:false}));
vi.mock('../src/lib/audio.js',()=>({createAudioController:(state,end)=>{audio.state=state;audio.end=end;return audio;}}));
import App from '../src/App.svelte';
import {libraryAdapter,bundledPack} from '../src/lib/library.js';
import {createSession} from '../src/lib/engine.js';
import {saveProgress} from '../src/lib/session-store.js';
const pack=JSON.parse(readFileSync('src/lib/pack.json'));
const manifest=JSON.parse(readFileSync('public/content/delivery/eng.MRK-1-1-13/b749c9c8246fd178a6c70604ef1037a1bed0e2804ba618750a2aec1de4d9a10e.json'));
const files=manifest.entries.filter(e=>e.delivery.kind==='audio').map(e=>({path:e.path,sha256:e.delivery.sha256,sourceSha256:e.source.sha256,logicalSourceSha256:e.audioReplacement?.logicalSource.sha256,deliveryURL:e.delivery.url,duration:e.delivery.duration,mime:e.delivery.mime,playbackRange:e.playbackRange,timing:e.timing}));
let playingSrc,time,held=false;
function emit(t,playing=true){time=t;audio.state({src:playingSrc,playing,elapsed:t,duration:400});}
beforeEach(()=>{
 localStorage.clear();HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};HTMLMediaElement.prototype.pause=vi.fn();Element.prototype.scrollTo=vi.fn();
 vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('fetch',vi.fn(async url=>{try{return new Response(readFileSync('public'+url),{headers:{'Content-Type':'application/json'}});}catch{return new Response('',{status:404});}}));
 audio.active=false;audio.src=null;
 audio.play.mockImplementation((text,src,rate,range)=>{audio.active=true;audio.src=playingSrc=src;held=false;emit(range.startSeconds);});
 audio.pause.mockImplementation(()=>{held=true;emit(time,false);});audio.resume.mockImplementation(()=>{held=false;emit(time);return true;});
 // The synthetic player seeks like the real one: the clock moves, the play/pause state does not, and it reports once inside the seek.
 audio.seek.mockImplementation(s=>{if(!audio.active)return false;emit(s,!held);return true;});audio.sync.mockImplementation(()=>{if(!audio.active)return false;emit(time,!held);return true;});
 audio.stop.mockImplementation(()=>{audio.active=false;audio.src=null;audio.state?.({src:null,playing:false,elapsed:0,duration:0});});
 vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({files,savedFiles:[],deliveryRevision:'reviewed-delivery'});
 vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});
 vi.spyOn(libraryAdapter,'playMedia').mockImplementation(async(_pack,path)=>{const file=files.find(f=>f.path===path);return {bytes:new Uint8Array([1,2]),mime:'audio/wav',file,timing:file.timing,playbackRange:file.playbackRange};});
 URL.createObjectURL=vi.fn(()=> 'blob:one-verified-recording');URL.revokeObjectURL=vi.fn();
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();localStorage.clear();});
async function begin(id,{manual=false}={}){
 const session=createSession(pack.activities);session.index=pack.activities.findIndex(a=>a.id===id);
 saveProgress(localStorage,bundledPack,pack.activities,{session,transitionSection:null,scale:1,rate:1,muted:manual});
 render(App);await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(pack.activities[session.index].prompt));
 await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false));
 await fireEvent.click(screen.getByRole('button',{name:/^(Play|Begin)$/}));
 await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));await waitFor(()=>expect(fetch).toHaveBeenCalled());
 stops=audio.stop.mock.calls.length;
}
let stops=0;
for(const intro of ['S03-U009','S04-U004','S05-U009'])it(`synthetic clock: ${intro} plays its whole authored screen once, with only a final tail`,async()=>{
 await begin(intro);const rows=pack.activities.filter(a=>a.readingGroupId===intro),first=files.find(f=>f.path===rows[0].audioSrc),last=files.find(f=>f.path===rows.at(-1).audioSrc);
 expect(audio.play.mock.calls[0][3]).toEqual({startSeconds:first.playbackRange.startSeconds,endSeconds:last.playbackRange.endSeconds+0.25});
 const stops=audio.stop.mock.calls.length;
 for(const row of rows){const f=files.find(f=>f.path===row.audioSrc);emit(f.playbackRange.startSeconds+0.02);await tick();await waitFor(()=>expect(JSON.parse(localStorage.getItem(`fia-v3-progress@1:${bundledPack.id}`)).activityId).toBe(row.id));}
 expect(audio.play).toHaveBeenCalledTimes(1);expect(audio.pause).not.toHaveBeenCalled();expect(audio.resume).not.toHaveBeenCalled();expect(audio.stop).toHaveBeenCalledTimes(stops);expect(libraryAdapter.playMedia).toHaveBeenCalledTimes(1);
 // A backwards media seek changes internal row custody without a transport restart.
 emit(first.playbackRange.startSeconds+0.02);await tick();await waitFor(()=>expect(JSON.parse(localStorage.getItem(`fia-v3-progress@1:${bundledPack.id}`)).activityId).toBe(intro));expect(audio.play).toHaveBeenCalledTimes(1);
});
it('synthetic clock: pause/resume, replay and skip preserve screen ownership',async()=>{
 await begin('S03-U009');emit(95.3);await tick();
 await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false),{timeout:2000});
 await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));expect(audio.pause).toHaveBeenCalledTimes(1);
 await fireEvent.click(screen.getByRole('button',{name:'Resume',exact:true}));expect(audio.resume).toHaveBeenCalledTimes(1);expect(audio.play).toHaveBeenCalledTimes(1);
 await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false),{timeout:2000});
 await fireEvent.click(screen.getByRole('button',{name:'Replay',exact:true}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(2));
 expect(audio.play.mock.calls.at(-1)[3]).toEqual({startSeconds:92.17,endSeconds:103.38});
 expect(JSON.parse(localStorage.getItem(`fia-v3-progress@1:${bundledPack.id}`)).activityId).toBe('S03-U009');
 await fireEvent.click(screen.getByRole('button',{name:'Skip to next activity',exact:true}));
 await tick();const after=JSON.parse(localStorage.getItem(`fia-v3-progress@1:${bundledPack.id}`)).activityId;expect(after).toBe('S03-U017');
 const plays=audio.play.mock.calls.length;emit(102.5);await tick();expect(JSON.parse(localStorage.getItem(`fia-v3-progress@1:${bundledPack.id}`)).activityId).toBe(after);expect(audio.play).toHaveBeenCalledTimes(plays);
});

it('synthetic clock: manual narration also uses one together-screen session and waits at its end',async()=>{
 await begin('S03-U009',{manual:true});const rows=pack.activities.filter(a=>a.readingGroupId==='S03-U009');
 for(const row of rows){const f=files.find(f=>f.path===row.audioSrc);emit(f.playbackRange.startSeconds+0.02);await tick();}
 expect(audio.play).toHaveBeenCalledTimes(1);expect(audio.play.mock.calls[0][3]).toEqual({startSeconds:92.17,endSeconds:103.38});
 audio.state({src:null,playing:false,elapsed:0,duration:0});audio.end();await tick();
 const stored=JSON.parse(localStorage.getItem(`fia-v3-progress@1:${bundledPack.id}`));expect(stored.activityId).toBe('S03-U016');expect(stored.session.status).toBe('waiting');
 // Codex P2 on #351: with automatic narration off, every row the clock crossed counts as heard (progress totals).
 expect(stored.session.completed).toEqual(rows.slice(0,-1).map(r=>r.id));
});

// Audio is the player and the pages turn to the audio (captain, 2026-11-09). Each case drives the real App with the
// shipped contracts, descriptors and sidecars on a SYNTHETIC player clock; none certifies acoustic synchronization.
const stored=()=>JSON.parse(localStorage.getItem(`fia-v3-progress@1:${bundledPack.id}`));
const clipRange=path=>files.find(f=>f.path===path).playbackRange;
const rx=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// An Overview item is a button named "<kind>, <n> of <m>[, done][, stop to discuss]: <prompt>" inside the stage's group.
async function overviewJump(section,id){
 await fireEvent.click(screen.getByRole('button',{name:'Session progress: open section overview'}));
 const items=screen.getByRole('group',{name:`${section} items`}),target=pack.activities.find(a=>a.id===id);
 await fireEvent.click(within(items).getByRole('button',{name:new RegExp(`: ${rx(target.prompt)}$`)}));await tick();
}
it('run: a forward crossing turns the page and completes the row; the gap before the next clip is seeked, never voiced',async()=>{
 await begin('S02-U002');const {tailExtendedRange}=await import('../src/lib/range-tail.js');
 const last=files.find(f=>f.path==='/audio/source/S02-U005.mp3');
 expect(audio.play.mock.calls[0][3]).toEqual({startSeconds:15.09,endSeconds:tailExtendedRange(last.playbackRange,last,files).endSeconds});
 emit(25.0);await tick();expect(stored().activityId).toBe('S02-U002');expect(audio.seek).not.toHaveBeenCalled();
 emit(25.52);await tick();
 expect(audio.seek).toHaveBeenCalledTimes(1);expect(audio.seek).toHaveBeenCalledWith(25.84);
 await waitFor(()=>expect(stored().activityId).toBe('S02-U003'));expect(stored().session.completed).toEqual(['S02-U002']);expect(stored().session.status).toBe('playing');
 await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(pack.activities.find(a=>a.id==='S02-U003').prompt));
 expect(audio.play).toHaveBeenCalledTimes(1);expect(audio.pause).not.toHaveBeenCalled();expect(audio.stop).toHaveBeenCalledTimes(stops);
});
it('run: pause freezes the page and the highlight; resume continues the same session from the same clock',async()=>{
 await begin('S02-U002');await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false),{timeout:2000});
 emit(20);await tick();const before=stored().activityId;
 await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));expect(audio.pause).toHaveBeenCalledTimes(1);expect(stored().session.status).toBe('paused');
 const words=[...document.querySelectorAll('[data-align-word][data-active="true"]')].map(n=>n.getAttribute('data-align-word'));
 await new Promise(r=>setTimeout(r,30));await tick();
 expect(stored().activityId).toBe(before);expect([...document.querySelectorAll('[data-align-word][data-active="true"]')].map(n=>n.getAttribute('data-align-word'))).toEqual(words);
 await fireEvent.click(screen.getByRole('button',{name:'Resume',exact:true}));expect(audio.resume).toHaveBeenCalledTimes(1);expect(audio.play).toHaveBeenCalledTimes(1);expect(time).toBe(20);expect(stored().session.status).toBe('playing');
});
it('run: the confirmation stop ends the session at its own end and waits; the crossed rows are complete',async()=>{
 await begin('S02-U002');for(const t of [25.9,58.3,84.5]){emit(t);await tick();}
 expect(stored().activityId).toBe('S02-U005');expect(stored().session.completed).toEqual(['S02-U002','S02-U003','S02-U004']);
 expect(audio.seek.mock.calls.map(c=>c[0])).toEqual([]);
 audio.state({src:null,playing:false,elapsed:0,duration:0});audio.end();audio.end();await tick();
 expect(stored().activityId).toBe('S02-U005');expect(stored().session.status).toBe('waiting');expect(audio.play).toHaveBeenCalledTimes(1);
});
it('run: a Scripture reading is a file break; the run ends before it and the reading starts on its own clip',async()=>{
 await begin('S01-U001');const {tailExtendedRange}=await import('../src/lib/range-tail.js');
 const u2=files.find(f=>f.path==='/audio/source/S01-U002.mp3');
 expect(audio.play.mock.calls[0][3]).toEqual({startSeconds:6.2,endSeconds:tailExtendedRange(u2.playbackRange,u2,files).endSeconds});
 emit(11.8);await tick();expect(audio.seek).toHaveBeenCalledWith(13.15);expect(stored().activityId).toBe('S01-U002');
 audio.state({src:null,playing:false,elapsed:0,duration:0});audio.end();await tick();
 expect(stored().activityId).toBe('S01-U002-reading-1');expect(stored().session.completed).toEqual(['S01-U001','S01-U002']);
 await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(2),{timeout:2000});
 expect(audio.play.mock.calls[1][3]).toEqual(clipRange('/audio/source/scripture-BereanStandardBible.mp3'));
});
it('run: a section transition is never crossed; the last clip of a file plays alone and the transition screen waits',async()=>{
 await begin('S02-U013');expect(audio.play.mock.calls[0][3].startSeconds).toBe(429.48);
 audio.state({src:null,playing:false,elapsed:0,duration:0});audio.end();await tick();
 expect(stored().activityId).toBe('S03-U001');expect(stored().transitionSection).toBe('S03');
 await new Promise(r=>setTimeout(r,700));expect(audio.play).toHaveBeenCalledTimes(1);
});
it('run: Next inside the run seeks the running session forward and completes the row it leaves; no restart',async()=>{
 await begin('S02-U002');await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false),{timeout:2000});
 await fireEvent.click(screen.getByRole('button',{name:'Skip to next activity',exact:true}));await tick();
 expect(audio.seek).toHaveBeenCalledWith(25.84);expect(stored().activityId).toBe('S02-U003');expect(stored().session.completed).toEqual(['S02-U002']);expect(stored().session.status).toBe('playing');
 expect(audio.play).toHaveBeenCalledTimes(1);expect(audio.stop).toHaveBeenCalledTimes(stops);expect(audio.pause).not.toHaveBeenCalled();
 emit(30);await tick();expect(stored().activityId).toBe('S02-U003');
});
it('run: Back inside the run seeks backwards without completing anything and keeps playing',async()=>{
 await begin('S02-U002');emit(25.9);await tick();expect(stored().activityId).toBe('S02-U003');
 await fireEvent.click(screen.getByRole('button',{name:'Previous activity',exact:true}));await tick();
 expect(audio.seek).toHaveBeenLastCalledWith(15.09);expect(stored().activityId).toBe('S02-U002');expect(stored().session.completed).toEqual(['S02-U002']);expect(stored().session.status).toBe('playing');
 expect(audio.play).toHaveBeenCalledTimes(1);expect(audio.stop).toHaveBeenCalledTimes(stops);
 emit(16);await tick();expect(stored().activityId).toBe('S02-U002');
});
it('run: a paused Back keeps the pause; Resume continues from the seeked place',async()=>{
 await begin('S02-U002');emit(25.9);await tick();await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false),{timeout:2000});
 await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));expect(stored().session.status).toBe('paused');
 await fireEvent.click(screen.getByRole('button',{name:'Previous activity',exact:true}));await tick();
 expect(audio.seek).toHaveBeenLastCalledWith(15.09);expect(stored().activityId).toBe('S02-U002');expect(stored().session.status).toBe('paused');expect(audio.resume).not.toHaveBeenCalled();expect(audio.play).toHaveBeenCalledTimes(1);
 await fireEvent.click(screen.getByRole('button',{name:'Resume',exact:true}));expect(audio.resume).toHaveBeenCalledTimes(1);expect(time).toBe(15.09);
});
it('run: an Overview jump inside the run seeks the audio and keeps playing; the skipped row is not completed',async()=>{
 await begin('S02-U002');await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false),{timeout:2000});
 await overviewJump('Setting the Stage','S02-U004');
 expect(audio.seek).toHaveBeenLastCalledWith(58.19);expect(stored().activityId).toBe('S02-U004');expect(stored().session.completed).toEqual([]);expect(stored().session.status).toBe('playing');
 expect(audio.play).toHaveBeenCalledTimes(1);expect(audio.stop).toHaveBeenCalledTimes(stops);
 emit(84.5);await tick();expect(stored().activityId).toBe('S02-U005');expect(stored().session.completed).toEqual(['S02-U004']);
});
it('run: a jump outside the run falls back to the clip path (stop, then the next clip on its own)',async()=>{
 await begin('S02-U002');await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false),{timeout:2000});
 await overviewJump('Setting the Stage','S02-U006');
 expect(audio.seek).not.toHaveBeenCalled();expect(audio.stop).toHaveBeenCalled();expect(stored().activityId).toBe('S02-U006');
});
it('run: manual narration (automatic narration off) completes each crossed row and Continue seeks the same session',async()=>{
 await begin('S02-U002',{manual:true});expect(audio.play).toHaveBeenCalledTimes(1);
 emit(25.9);await tick();expect(stored().activityId).toBe('S02-U003');expect(stored().session.completed).toEqual(['S02-U002']);
 emit(58.3);await tick();expect(stored().activityId).toBe('S02-U004');expect(stored().session.completed).toEqual(['S02-U002','S02-U003']);
 await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await tick();
 expect(audio.seek).toHaveBeenLastCalledWith(84.45);expect(stored().activityId).toBe('S02-U005');expect(stored().session.completed).toEqual(['S02-U002','S02-U003','S02-U004']);expect(audio.play).toHaveBeenCalledTimes(1);
 audio.state({src:null,playing:false,elapsed:0,duration:0});audio.end();await tick();expect(stored().session.status).toBe('waiting');expect(stored().activityId).toBe('S02-U005');
});
it('run: returning to a hidden page re-syncs the screen to the player clock',async()=>{
 await begin('S02-U002');time=60;
 document.dispatchEvent(new Event('visibilitychange'));await tick();
 expect(audio.sync).toHaveBeenCalledTimes(1);await waitFor(()=>expect(stored().activityId).toBe('S02-U004'));expect(stored().session.completed).toEqual(['S02-U002','S02-U003']);expect(audio.play).toHaveBeenCalledTimes(1);
});
it('synthetic clock: a together-screen ends once while separate questions remain confirmation stops',async()=>{
 await begin('S01-U003');expect(audio.play.mock.calls[0][3]).toEqual({startSeconds:27.08,endSeconds:29.63});
 audio.end();audio.end();await tick();const stored=JSON.parse(localStorage.getItem(`fia-v3-progress@1:${bundledPack.id}`));
 expect(stored.activityId).toBe('S01-U003');expect(stored.session.status).toBe('waiting');expect(audio.play).toHaveBeenCalledTimes(1);
});
it('synthetic clock with integrated source-bound sidecar: all eight rows highlight on the shared clock',async()=>{
 await begin('S03-U009');const sc=JSON.parse(readFileSync('public/transcripts/4396f92c538c1292ccff0c9026f6608686006970df9f1b7028892edbfede05b9.words.json'));
 await waitFor(()=>expect(fetch.mock.calls.some(([url])=>String(url).includes('/transcripts/4396'))).toBe(true));await new Promise(r=>setTimeout(r,0));
 const entry=files.find(f=>f.path==='/audio/source/S03-U009.mp3');expect(sc.audioSha256).toBe(entry.sha256);expect(sc.sourceAudioSha256).toBe(entry.sourceSha256);expect(sc.timingMapping).toEqual(entry.timing.mapping);
 const valid=pack.activities.filter(a=>a.readingGroupId==='S03-U009').map(a=>a.id);
 for(const row of pack.activities.filter(a=>a.readingGroupId==='S03-U009')){
  const map=sc.activities[row.id],f=files.find(f=>f.path===row.audioSrc);emit(valid.includes(row.id)?(map.words[0].startMs+map.words[0].endMs)/2000:f.playbackRange.startSeconds+0.02);await tick();
  await waitFor(()=>expect(document.querySelector('[data-reading-item][aria-current="true"]').textContent).toBe(row.sourceText));
  if(valid.includes(row.id))await waitFor(()=>expect(document.querySelectorAll('[data-align-word][data-active="true"]').length).toBeGreaterThan(0));
  else expect(document.querySelectorAll('[data-align-word]')).toHaveLength(0);
 }
 expect(audio.play).toHaveBeenCalledTimes(1);
});
it('UNAPPROVED source-bound overlay: all eight S03 rows highlight in one synthetic-clock session',async()=>{
 const {execFileSync}=await import('node:child_process');
 const proposal=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',"import {buildS03Proposal} from './analysis/s03-highlight/build.mjs';console.log(JSON.stringify(buildS03Proposal()));"],{cwd:'../..',encoding:'utf8'}));
 vi.mocked(fetch).mockImplementation(async url=>{
  if(String(url)===`/transcripts/${proposal.pins.delivery}.words.json`)return new Response(JSON.stringify(proposal.sidecar),{headers:{'Content-Type':'application/json'}});
  try{return new Response(readFileSync('public'+url),{headers:{'Content-Type':'application/json'}});}catch{return new Response('',{status:404});}
 });
 await begin('S03-U009');await waitFor(()=>expect(fetch.mock.calls.some(([url])=>String(url).includes('/transcripts/4396'))).toBe(true));await new Promise(r=>setTimeout(r,0));
 for(const row of pack.activities.filter(a=>a.readingGroupId==='S03-U009')){
  const map=proposal.sidecar.activities[row.id];emit((map.words[0].startMs+map.words[0].endMs)/2000);await tick();
  await waitFor(()=>expect(document.querySelector('[data-reading-item][aria-current="true"]').textContent).toBe(row.sourceText));
  await waitFor(()=>expect(document.querySelectorAll('[data-align-word][data-active="true"]').length).toBeGreaterThan(0));
 }
 // Every repaired word is checked against the actual DOM's two-word lead window.
 // These are deliberate synthetic clock samples, not measured acoustic offsets.
 for(const row of proposal.rows){
  for(let i=0;i<row.deltas.length;i++){
   const d=row.deltas[i],elapsed=Math.max(row.unchangedRange.startSeconds+0.001,(d.proposal.startMs+d.proposal.endMs)/2000-0.25);
   emit(elapsed);await tick();
   const first=Math.max(0,Math.min(i,row.deltas.length-2)),last=Math.min(row.deltas.length-1,first+1);
   await waitFor(()=>expect([...document.querySelectorAll('[data-align-word][data-active="true"]')].map(n=>n.getAttribute('data-align-word'))).toEqual(Array.from({length:last-first+1},(_,j)=>`0-${first+j}`)));
  }
 }
 expect(audio.play).toHaveBeenCalledTimes(1);expect(proposal.counts.recordingAdmissions).toBe(0);expect(proposal.unchangedU024).toBe(true);
});

it('synthetic paused native seek changes row custody while preserving pause and the one session',async()=>{
 await begin('S03-U009');await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false),{timeout:2000});
 await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));
 const stored=()=>JSON.parse(localStorage.getItem(`fia-v3-progress@1:${bundledPack.id}`));
 emit(95.0,false);await tick();expect(stored().activityId).toBe('S03-U010');expect(stored().session.status).toBe('paused');
 expect(audio.play).toHaveBeenCalledTimes(1);expect(audio.resume).not.toHaveBeenCalled();
 await fireEvent.click(screen.getByRole('button',{name:'Resume',exact:true}));expect(audio.resume).toHaveBeenCalledTimes(1);expect(stored().session.status).toBe('playing');
 await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false),{timeout:2000});await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));
 emit(92.8,false);await tick();expect(stored().activityId).toBe('S03-U009');expect(stored().session.status).toBe('paused');expect(audio.play).toHaveBeenCalledTimes(1);expect(audio.resume).toHaveBeenCalledTimes(1);
});
it('synthetic integrated S04 screen keeps one session with John/Satan highlights and an explicitly untimed intro',async()=>{
 await begin('S04-U004');const stops=audio.stop.mock.calls.length;emit(23.5);await tick();expect(document.querySelectorAll('[data-align-word]')).toHaveLength(0);
 for(const [id,time]of [['S04-U005',26.5],['S04-U010',35.55]]){emit(time);await tick();await waitFor(()=>expect(JSON.parse(localStorage.getItem(`fia-v3-progress@1:${bundledPack.id}`)).activityId).toBe(id));await waitFor(()=>expect(document.querySelectorAll('[data-align-word][data-active="true"]').length).toBeGreaterThan(0));}
 expect(audio.play).toHaveBeenCalledTimes(1);expect(audio.stop).toHaveBeenCalledTimes(stops);expect(audio.pause).not.toHaveBeenCalled();expect(audio.play.mock.calls[0][3]).toEqual({startSeconds:23.37,endSeconds:38.09});
});
for(const id of ['S01-U008','S04-U012','S05-U002'])it(`synthetic integrated whole map ${id} follows its verified sidecar without changing confirmation policy`,async()=>{
 await begin(id);const a=pack.activities.find(a=>a.id===id),f=files.find(f=>f.path===a.audioSrc),sc=JSON.parse(readFileSync(`public/transcripts/${f.sha256}.words.json`)),map=sc.activities[id];
 expect(sc.audioSha256).toBe(f.sha256);expect(sc.sourceAudioSha256).toBe(f.sourceSha256);expect(sc.timingMapping).toEqual(f.timing.mapping);
 await waitFor(()=>expect(fetch.mock.calls.some(([url])=>String(url).includes(`/transcripts/${f.sha256}`))).toBe(true));await new Promise(r=>setTimeout(r,0));emit((map.words[0].startMs+map.words[0].endMs)/2000);await tick();await waitFor(()=>expect(document.querySelectorAll('[data-align-word][data-active="true"]').length).toBeGreaterThan(0));expect(audio.play).toHaveBeenCalledTimes(1);
 if(a.completion==='confirm'){audio.state({src:null,playing:false,elapsed:0,duration:0});audio.end();await tick();const saved=JSON.parse(localStorage.getItem(`fia-v3-progress@1:${bundledPack.id}`));expect(saved.activityId).toBe(id);expect(saved.session.status).toBe('waiting');}
});
