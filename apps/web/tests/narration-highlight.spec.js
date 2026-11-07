// Synthetic Audio/controller clocks exercise the real App DOM, not acoustic/device acceptance.
import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/svelte';
import {tick} from 'svelte';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
const audio=vi.hoisted(()=>({play:vi.fn(),pause:vi.fn(),resume:vi.fn(),stop:vi.fn(),active:false}));
vi.mock('../src/lib/audio.js',()=>({createAudioController:(state,end)=>{audio.state=state;audio.end=end;return audio;}}));
import App from '../src/App.svelte';
import {libraryAdapter} from '../src/lib/library.js';
const registry=JSON.parse(readFileSync('public/content/registry.json','utf8'));
const descriptor=registry.packs.find(p=>p.id==='eng.MRK-1-14-20');
const base=JSON.parse(readFileSync('public'+descriptor.presentation.url,'utf8'));
const hash='c'.repeat(64),range={startSeconds:4,endSeconds:9};
let presentation,sidecar,result,requests,blobIndex;
function emit(time,playing=true){audio.time=time;audio.state({src:audio.src,playing,elapsed:time,duration:10});}
function wordMap(text){return [...text.matchAll(/\S+/gu)].map((m,i)=>({text:m[0],from:m.index,to:m.index+m[0].length,startMs:4200+i*300,endMs:4400+i*300}));}
beforeEach(()=>{
 presentation=structuredClone(base);const a=presentation.activities[0],words=wordMap(a.readingGroupId?a.sourceText:a.narration);
 sidecar={schema:'fia-word-transcript@1',audioSha256:hash,sourceAudioSha256:'d'.repeat(64),clockDomain:'delivery-media-seconds',durationMs:10000,words:words.map(({text,startMs,endMs})=>({text,startMs,endMs})),activities:{[a.id]:{startMs:4000,endMs:9000,matched:words.length,total:words.length,words}}};
 result={bytes:new Uint8Array([1,2]),mime:'audio/wav',playbackRange:range,audioSha256:hash};requests=[];blobIndex=0;
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};HTMLMediaElement.prototype.pause=vi.fn();Element.prototype.scrollTo=vi.fn();
 vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('fetch',vi.fn(async url=>{requests.push(String(url));return sidecar&&String(url)===`/transcripts/${hash}.words.json`?new Response(JSON.stringify(sidecar),{headers:{'Content-Type':'application/json'}}):new Response('',{status:404});}));
 localStorage.setItem('fia-v3-selected-pack',descriptor.id);
 audio.active=false;audio.src=null;audio.time=0;audio.play.mockImplementation((text,src,rate,clip)=>{audio.active=true;audio.src=src;emit(clip?.startSeconds??0);});audio.pause.mockImplementation(()=>emit(audio.time,false));audio.resume.mockImplementation(()=>{emit(audio.time);return true;});audio.stop.mockImplementation(()=>{audio.active=false;audio.src=null;audio.state?.({playing:false,src:null,elapsed:0,duration:0});});
 vi.spyOn(libraryAdapter,'select').mockImplementation(async()=>({descriptor,presentation}));vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({files:[],savedFiles:[],deliveryRevision:null});
 vi.spyOn(libraryAdapter,'playBoundAudio').mockImplementation(async()=>result);vi.spyOn(libraryAdapter,'prepareOriginal').mockResolvedValue(null);vi.spyOn(libraryAdapter,'prepareRecording').mockResolvedValue({status:'ready',value:{}});vi.spyOn(libraryAdapter,'preparationStatus').mockResolvedValue({status:'ready',value:{}});vi.spyOn(libraryAdapter,'verifyPreparedRecording').mockResolvedValue({jobId:'a'.repeat(64),resultSha256:'b'.repeat(64),playbackRange:range});vi.spyOn(libraryAdapter,'playPreparedRecording').mockImplementation(async()=>result);
 URL.createObjectURL=vi.fn(()=>`blob:narration-${++blobIndex}`);URL.revokeObjectURL=vi.fn();
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();localStorage.clear();});
function route(kind){if(kind==='bound'){
 presentation.execution={schema:'fia-executable-presentation@1',sourceRevision:'source-1',decisionEvidenceSha256:'a'.repeat(64),recipeRevision:'recipe-1'};
 for(const a of presentation.activities)a.execution={narration:{action:'none'},focalAssetId:a.assetId??null,completion:{action:'manual-continue'}};
 presentation.activities[0].execution.narration={action:'play-bound-audio',artifact:{id:'synthetic-bound-reference',sha256:'a'.repeat(64)}};
}}
async function begin(kind){route(kind);render(App);await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(presentation.activities[0].prompt));await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false));await fireEvent.click(screen.getByRole('button',{name:'Begin',exact:true}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));}
const active=()=>[...document.querySelectorAll('[data-align-word][data-active="true"]')].map(n=>n.getAttribute('data-align-word'));
for(const kind of ['bound','prepared'])it(`synthetic ${kind} ranged narration uses verified sidecar and exact player clock for first-screen highlighting`,async()=>{
 await begin(kind);await waitFor(()=>expect(requests).toContain(`/transcripts/${hash}.words.json`));
 emit(4.31);await waitFor(()=>expect(active()).toEqual(['0-1','0-2']));
 expect([...document.querySelectorAll('[data-align-word]')].map(n=>n.textContent)).toEqual(sidecar.activities[presentation.activities[0].id].words.map(w=>w.text));
 emit(5.21);await waitFor(()=>expect(active()).toEqual(['0-4','0-5']));
 emit(4.31);await waitFor(()=>expect(active()).toEqual(['0-1','0-2'])); // synthetic backward native-clock seek
 await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false),{timeout:2000}); // accepted Play's 800ms tap burst
 await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));const held=active();await tick();expect(active()).toEqual(held);
 await fireEvent.click(screen.getByRole('button',{name:'Resume',exact:true}));emit(5.21);await waitFor(()=>expect(active()).toEqual(['0-4','0-5']));
 await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false),{timeout:2000});
 await fireEvent.click(screen.getByRole('button',{name:'Replay',exact:true}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(2));emit(4.31);await waitFor(()=>expect(active()).toEqual(['0-1','0-2']));
 expect(audio.play.mock.calls.at(-1)[3]).toEqual(range);
});
for(const kind of ['bound','prepared'])for(const failure of ['wrong-recording-sha','missing-sidecar','low-asr-coverage','outside-clip','stale-text','unverified-recording','whole-file-native-ended'])it(`synthetic ${kind} ${failure} remains readable and untimed`,async()=>{
 if(failure==='wrong-recording-sha')sidecar.audioSha256='e'.repeat(64);
 if(failure==='missing-sidecar')sidecar=null;
 if(failure==='low-asr-coverage')sidecar.activities[presentation.activities[0].id].matched=0;
 if(failure==='outside-clip')sidecar.activities[presentation.activities[0].id].endMs=9500;
 if(failure==='stale-text')sidecar.activities[presentation.activities[0].id].words[1].text='WRONG';
 if(failure==='unverified-recording')delete result.audioSha256;
 if(failure==='whole-file-native-ended'){result.playback='whole-file-native-ended';delete result.playbackRange;}
 await begin(kind);emit(5.21);await new Promise(resolve=>setTimeout(resolve,0));await tick();
 if(['unverified-recording','whole-file-native-ended'].includes(failure))expect(requests).not.toContain(`/transcripts/${hash}.words.json`);
 else expect(requests).toContain(`/transcripts/${hash}.words.json`);
 expect(document.querySelectorAll('[data-align-word]')).toHaveLength(0);expect(active()).toEqual([]);
 expect(document.querySelector('.reading-verses').textContent).toContain(presentation.activities[0].narration);
});
for(const kind of ['bound','prepared'])it(`synthetic ${kind} whole-file replay cannot reuse a previous ranged word clock`,async()=>{
 await begin(kind);await waitFor(()=>expect(requests).toContain(`/transcripts/${hash}.words.json`));emit(4.31);await waitFor(()=>expect(active()).toEqual(['0-1','0-2']));
 await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false),{timeout:2000});
 result={...result,playback:'whole-file-native-ended'};delete result.playbackRange;
 await fireEvent.click(screen.getByRole('button',{name:'Replay',exact:true}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(2));
 emit(5.21);await tick();expect(document.querySelectorAll('[data-align-word]')).toHaveLength(0);expect(active()).toEqual([]);
 expect(requests.filter(url=>url===`/transcripts/${hash}.words.json`)).toHaveLength(1); // old sidecar stays cached, but cannot qualify a new clock
 expect(audio.play.mock.calls.at(-1)[3]).toBeUndefined();
});
for(const kind of ['bound','prepared'])it(`synthetic ${kind} full reselection revokes an old sidecar and same-activity clock`,async()=>{
 let release;vi.mocked(fetch).mockImplementation(async url=>{requests.push(String(url));return new Promise(resolve=>release=()=>resolve(new Response(JSON.stringify(sidecar),{headers:{'Content-Type':'application/json'}})));});
 vi.spyOn(libraryAdapter,'languages').mockResolvedValue([{id:'eng',name:'English',nativeName:'English',ready:1}]);vi.spyOn(libraryAdapter,'passages').mockResolvedValue([descriptor]);
 await begin(kind);await waitFor(()=>expect(release).toBeTypeOf('function'));const oldSrc=audio.src;
 await fireEvent.click(screen.getByRole('button',{name:'Session progress: open section overview'}));await fireEvent.click(screen.getByRole('button',{name:/^Passages/}));await fireEvent.click(await screen.findByRole('button',{name:/^Open passage: /}));
 await waitFor(()=>expect(libraryAdapter.select).toHaveBeenCalledTimes(2));await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false));
 release();await new Promise(resolve=>setTimeout(resolve,0));audio.state({src:oldSrc,playing:true,elapsed:5.21,duration:10});await tick();
 expect(audio.play).toHaveBeenCalledTimes(1);expect(document.querySelectorAll('[data-align-word]')).toHaveLength(0);expect(active()).toEqual([]);
});
