// Real App + shipped contracts/descriptors/sidecars, SYNTHETIC player clock/transport.
// This does not decode the source recording or certify acoustic synchronization.
import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/svelte';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {tick} from 'svelte';
const audio=vi.hoisted(()=>({play:vi.fn(),pause:vi.fn(),resume:vi.fn(),stop:vi.fn(),active:false}));
vi.mock('../src/lib/audio.js',()=>({createAudioController:(state,end)=>{audio.state=state;audio.end=end;return audio;}}));
import App from '../src/App.svelte';
import {libraryAdapter,bundledPack} from '../src/lib/library.js';
import {createSession} from '../src/lib/engine.js';
import {saveProgress} from '../src/lib/session-store.js';
const pack=JSON.parse(readFileSync('src/lib/pack.json'));
const manifest=JSON.parse(readFileSync('public/content/delivery/eng.MRK-1-1-13/b749c9c8246fd178a6c70604ef1037a1bed0e2804ba618750a2aec1de4d9a10e.json'));
const files=manifest.entries.filter(e=>e.delivery.kind==='audio').map(e=>({path:e.path,sha256:e.delivery.sha256,sourceSha256:e.source.sha256,logicalSourceSha256:e.audioReplacement?.logicalSource.sha256,deliveryURL:e.delivery.url,duration:e.delivery.duration,mime:e.delivery.mime,playbackRange:e.playbackRange,timing:e.timing}));
let playingSrc,time;
function emit(t,playing=true){time=t;audio.state({src:playingSrc,playing,elapsed:t,duration:400});}
beforeEach(()=>{
 localStorage.clear();HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};HTMLMediaElement.prototype.pause=vi.fn();Element.prototype.scrollTo=vi.fn();
 vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('fetch',vi.fn(async url=>{try{return new Response(readFileSync('public'+url),{headers:{'Content-Type':'application/json'}});}catch{return new Response('',{status:404});}}));
 audio.active=false;audio.src=null;
 audio.play.mockImplementation((text,src,rate,range)=>{audio.active=true;audio.src=playingSrc=src;emit(range.startSeconds);});
 audio.pause.mockImplementation(()=>emit(time,false));audio.resume.mockImplementation(()=>{emit(time);return true;});
 audio.stop.mockImplementation(()=>{audio.active=false;audio.src=null;audio.state?.({src:null,playing:false,elapsed:0,duration:0});});
 vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({files,savedFiles:[],deliveryRevision:'reviewed-delivery'});
 vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});
 vi.spyOn(libraryAdapter,'playMedia').mockImplementation(async(_pack,path)=>{const file=files.find(f=>f.path===path);return {bytes:new Uint8Array([1,2]),mime:'audio/wav',file,timing:file.timing,playbackRange:file.playbackRange};});
 URL.createObjectURL=vi.fn(()=> 'blob:one-verified-recording');URL.revokeObjectURL=vi.fn();
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();localStorage.clear();});
async function begin(id){
 const session=createSession(pack.activities);session.index=pack.activities.findIndex(a=>a.id===id);
 saveProgress(localStorage,bundledPack,pack.activities,{session,transitionSection:null,scale:1,rate:1,muted:false});
 render(App);await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(pack.activities[session.index].prompt));
 await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false));
 await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));
 await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));await waitFor(()=>expect(fetch).toHaveBeenCalled());
}
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
