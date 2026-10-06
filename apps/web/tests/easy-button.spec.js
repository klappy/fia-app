// Easy-button state machine at the App boundary (cookbook RECIPE R4, R5, R6).
// Faces are read from the rendered primary, never from internal state.
import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/svelte';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {createSession} from '../src/lib/engine.js';
const audio=vi.hoisted(()=>({play:vi.fn(),pause:vi.fn(),resume:vi.fn(),stop:vi.fn(),active:false}));
vi.mock('../src/lib/audio.js',()=>({createAudioController:(state,end)=>{audio.state=state;audio.end=end;return audio;}}));
import App from '../src/App.svelte';
import {libraryAdapter} from '../src/lib/library.js';
import {activities} from '../src/lib/content.js';
const registry=JSON.parse(readFileSync('public/content/registry.json','utf8'));
const pack=id=>{const descriptor=registry.packs.find(p=>p.id===id);return {descriptor,presentation:JSON.parse(readFileSync('public'+descriptor.presentation.url,'utf8'))};};
const admitted=pack('eng.MRK-1-14-20'),unadmitted=pack('eng.MRK-1-21-28');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const ready={jobId:'a'.repeat(64),resultSha256:'b'.repeat(64),playbackRange:{startSeconds:4,endSeconds:9}};
const firstAudio=activities[0].audioSrc,bundledMedia={deliveryRevision:'d'.repeat(64),files:[{path:firstAudio,bytes:3,mime:'audio/mpeg'}],savedFiles:[]};
const CHECKING='Checking availability';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const primary=()=>document.querySelector('nav[aria-label="Session controls"] .guide-primary');
function readFace(){const b=primary();if(!b)return null;const svg=b.querySelector('.primary-disc svg');return {label:b.getAttribute('aria-label'),busy:b.getAttribute('aria-busy')==='true',disabled:b.getAttribute('aria-disabled')==='true'||b.disabled,icon:svg?[...svg.classList].find(c=>c.startsWith('lucide-')&&c!=='lucide-icon')??'svg':null};}
function recordFaces(){
 const seen=[];let last='';
 const read=()=>{const f=readFace();const key=JSON.stringify(f);if(f&&key!==last){last=key;seen.push(f);}};
 const observer=new MutationObserver(read);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-label','aria-busy','aria-disabled','class']});
 return {seen,labels:()=>seen.map(f=>f.label),stop:()=>observer.disconnect()};
}
const progress=id=>JSON.parse(localStorage.getItem('fia-v3-progress@1:'+id)||'null');
const isStarting=f=>f.label==='Pause'&&f.busy&&f.disabled&&f.icon==='lucide-loader';
let faces;
beforeEach(()=>{
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 audio.active=false;audio.play.mockImplementation((text,src)=>{audio.active=true;audio.src=src;audio.state({playing:true,src,elapsed:4,duration:60});});audio.pause.mockImplementation(()=>audio.state({playing:false,src:audio.src,elapsed:4,duration:60}));audio.stop.mockImplementation(()=>{audio.active=false;audio.state?.({playing:false,src:null,elapsed:0,duration:0});});audio.resume.mockImplementation(()=>{audio.state({playing:true,src:audio.src,elapsed:4,duration:60});return true;});
 vi.stubGlobal('crypto',webcrypto);
 vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});
 vi.spyOn(libraryAdapter,'mediaStatus').mockImplementation(async p=>p.id==='eng.MRK-1-1-13'?bundledMedia:{files:[],savedFiles:[],deliveryRevision:null});
 vi.spyOn(libraryAdapter,'playMedia').mockResolvedValue({bytes:new Uint8Array(2),mime:'audio/mpeg',timing:{status:'not-applicable'},playbackRange:null});
 vi.spyOn(libraryAdapter,'prepareRecording').mockResolvedValue({status:'ready',value:{}});vi.spyOn(libraryAdapter,'preparationStatus').mockResolvedValue({status:'ready',value:{}});vi.spyOn(libraryAdapter,'verifyPreparedRecording').mockResolvedValue(ready);vi.spyOn(libraryAdapter,'playPreparedRecording').mockResolvedValue({bytes:new Uint8Array(2),mime:'audio/mpeg',playbackRange:ready.playbackRange});
 URL.createObjectURL=vi.fn(()=> 'blob:easy');URL.revokeObjectURL=vi.fn();HTMLMediaElement.prototype.pause=vi.fn();Element.prototype.scrollTo=vi.fn();
 faces=recordFaces();
});
afterEach(()=>{faces.stop();cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();localStorage.clear();});
function savePack({descriptor,presentation},{index=0,status='ready'}={}){
 localStorage.setItem('fia-v3-selected-pack',descriptor.id);
 const session={...createSession(presentation.activities),index,status};
 localStorage.setItem('fia-v3-progress@1:'+descriptor.id,JSON.stringify({total:presentation.activities.length,revision:descriptor.revision,activityId:presentation.activities[index].id,session}));
}
async function heading(text){await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(text));}

it('R5 E1/E3: on load the primary checks quietly, then changes once to its verified action',async()=>{
 const media=deferred();libraryAdapter.mediaStatus.mockReturnValue(media.promise);
 render(App);await wait(20);
 const face=readFace();
 expect(face).toEqual({label:CHECKING,busy:true,disabled:false,icon:null});
 expect(primary().querySelector('.primary-disc').children).toHaveLength(0);
 media.resolve(bundledMedia);
 await waitFor(()=>expect(readFace().label).toBe('Begin'));await wait(50);
 expect(faces.labels()).toEqual([CHECKING,'Begin']);
 expect(readFace()).toEqual({label:'Begin',busy:false,disabled:false,icon:'lucide-play'});
});

it('R5: a check that never answers stops verifying at its deadline; a late answer then applies as a status change',async()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 try{
  const media=deferred();libraryAdapter.mediaStatus.mockReturnValue(media.promise);
  render(App);await vi.advanceTimersByTimeAsync(3900);
  expect(faces.labels()).toEqual([CHECKING]);
  await vi.advanceTimersByTimeAsync(200);
  // Nothing playable is known yet, so the honest action is Continue (no guess at audio).
  expect(faces.labels()).toEqual([CHECKING,'Continue']);
  media.resolve(bundledMedia);await vi.advanceTimersByTimeAsync(10);
  expect(faces.labels()).toEqual([CHECKING,'Continue','Begin']);
 }finally{vi.useRealTimers();}
});

it('R5 E1: a returning visit stays checking until the saved passage itself is verified',async()=>{
 const selected=deferred();savePack(unadmitted);vi.spyOn(libraryAdapter,'select').mockReturnValue(selected.promise);
 render(App);await wait(30);
 // The bundled passage is known by now, but it is not the passage the person will see.
 expect(libraryAdapter.mediaStatus).toHaveBeenCalled();expect(faces.labels()).toEqual([CHECKING]);
 selected.resolve(unadmitted);await heading(unadmitted.presentation.activities[0].prompt);
 await waitFor(()=>expect(readFace().busy).toBe(false));await wait(50);
 expect(faces.labels()).toEqual([CHECKING,'Continue']);
});

it('R5 E4: a tap while checking waits, then performs the checked Begin exactly once',async()=>{
 const media=deferred();libraryAdapter.mediaStatus.mockReturnValue(media.promise);
 render(App);await wait(20);
 for(let i=0;i<3;i++){await fireEvent.click(primary());await wait(5);}
 expect(faces.labels()).toEqual([CHECKING]);expect(libraryAdapter.playMedia).not.toHaveBeenCalled();expect(audio.play).not.toHaveBeenCalled();
 media.resolve(bundledMedia);
 await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));
 await waitFor(()=>expect(readFace().icon).toBe('lucide-pause'),{timeout:2000});await wait(50);
 expect(libraryAdapter.playMedia).toHaveBeenCalledTimes(1);expect(audio.play).toHaveBeenCalledTimes(1);
 // [verifying, the state its action leads to]: starting, then Pause; never Begin in between.
 expect(faces.labels()).toEqual([CHECKING,'Pause','Pause']);expect(isStarting(faces.seen[1])).toBe(true);
});

it('R5 E4: a queued tap is dropped when the check finds nothing to play',async()=>{
 const selected=deferred();savePack(unadmitted);vi.spyOn(libraryAdapter,'select').mockReturnValue(selected.promise);
 render(App);await wait(20);await fireEvent.click(primary());
 selected.resolve(unadmitted);await heading(unadmitted.presentation.activities[0].prompt);await waitFor(()=>expect(readFace().label).toBe('Continue'));await wait(50);
 expect(progress(unadmitted.descriptor.id)?.session.index??0).toBe(0);expect(libraryAdapter.prepareRecording).not.toHaveBeenCalled();expect(audio.play).not.toHaveBeenCalled();
});

it('R5 E4: a queued tap is dropped when the person moves to another screen before the check ends',async()=>{
 const media=deferred();libraryAdapter.mediaStatus.mockReturnValue(media.promise);
 render(App);await wait(20);await fireEvent.click(primary());
 await fireEvent.click(screen.getByRole('button',{name:'Skip to next activity'}));await heading(activities[1].prompt);
 media.resolve({...bundledMedia,files:[...bundledMedia.files,{path:activities[1].audioSrc,bytes:3,mime:'audio/mpeg'}]});
 await waitFor(()=>expect(readFace().busy).toBe(false));await wait(50);
 expect(readFace().label).toBe('Play');expect(libraryAdapter.playMedia).not.toHaveBeenCalled();expect(audio.play).not.toHaveBeenCalled();
});

it('R4 D1/D2/D5: repeated taps while starting never cancel, pause or skip; Begin -> starting -> Pause',async()=>{
 const bytes=deferred();libraryAdapter.playMedia.mockReturnValue(bytes.promise);
 render(App);await waitFor(()=>expect(readFace().label).toBe('Begin'));
 for(let i=0;i<6;i++){await fireEvent.click(primary());await wait(15);}
 expect(isStarting(readFace())).toBe(true);
 expect(screen.queryByText('Playback canceled.')).toBeNull();expect(libraryAdapter.playMedia).toHaveBeenCalledTimes(1);expect(libraryAdapter.playMedia.mock.calls[0][3].aborted).toBe(false);
 bytes.resolve({bytes:new Uint8Array(2),mime:'audio/mpeg',timing:{status:'not-applicable'},playbackRange:null});
 await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));
 // A tap right after first sound still belongs to the start burst.
 await fireEvent.click(primary());expect(audio.pause).not.toHaveBeenCalled();
 await waitFor(()=>expect(readFace().icon).toBe('lucide-pause'),{timeout:2000});await wait(50);
 expect(faces.labels()).toEqual([CHECKING,'Begin','Pause','Pause']);expect(isStarting(faces.seen[2])).toBe(true);
 expect(faces.seen.some(f=>['lucide-x','lucide-chevron-right'].includes(f.icon)||['Cancel loading','Continue','Resume'].includes(f.label))).toBe(false);
 expect(audio.play).toHaveBeenCalledTimes(1);expect(audio.pause).not.toHaveBeenCalled();expect(progress('eng.MRK-1-1-13')?.session.index??0).toBe(0);
 // Once settled, the primary is an honest Pause again.
 await fireEvent.click(primary());expect(audio.pause).toHaveBeenCalledTimes(1);expect(readFace().label).toBe('Resume');
});

it('R4 D3/D4: a centre tap during a carried preparation keeps the activity and shows no Press Play notice',async()=>{
 const job=deferred();libraryAdapter.prepareRecording.mockReturnValue(job.promise);savePack(admitted);vi.spyOn(libraryAdapter,'select').mockResolvedValue(admitted);
 render(App);await heading(admitted.presentation.activities[0].prompt);await waitFor(()=>expect(readFace().label).toBe('Begin'));
 const notices=[];const watch=new MutationObserver(()=>{for(const n of document.querySelectorAll('[role=status]'))notices.push(n.textContent);});watch.observe(document.body,{subtree:true,childList:true,characterData:true});
 await fireEvent.click(primary());await waitFor(()=>expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(1));
 expect(isStarting(readFace())).toBe(true);
 // Cancel lives beside the primary, labelled; the centre slot never becomes Continue or X.
 expect(screen.getByRole('button',{name:'Cancel preparation',exact:true}).classList.contains('guide-primary')).toBe(false);
 await wait(600);await fireEvent.click(primary());
 expect(progress(admitted.descriptor.id).session.index).toBe(0);expect(libraryAdapter.prepareRecording.mock.calls[0][1].aborted).toBe(false);
 job.resolve({status:'ready',value:{}});await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));
 await waitFor(()=>expect(readFace().icon).toBe('lucide-pause'),{timeout:2000});await wait(30);watch.disconnect();
 expect(notices.some(text=>/Press Play/.test(text))).toBe(false);
 const start=faces.labels().slice(faces.labels().indexOf('Begin'));
 expect(start).toEqual(['Begin','Pause','Pause']);expect(progress(admitted.descriptor.id).session.index).toBe(0);
});

it('R6: a restored or revisited admitted screen offers Begin/Play in the centre, never Continue beside a Play',async()=>{
 savePack(admitted,{status:'waiting'});vi.spyOn(libraryAdapter,'select').mockResolvedValue(admitted);
 render(App);await heading(admitted.presentation.activities[0].prompt);await waitFor(()=>expect(readFace().busy).toBe(false));await wait(30);
 expect(faces.labels()).toEqual([CHECKING,'Play']);expect(readFace().icon).toBe('lucide-play');
 expect(screen.queryByRole('button',{name:'Play original recording'})).toBeNull();expect(screen.getByRole('button',{name:'Skip to next activity'})).toBeTruthy();
 // Forward then Back: navigation does not settle an admitted screen into a silent hold.
 await fireEvent.click(screen.getByRole('button',{name:'Skip to next activity'}));await heading(admitted.presentation.activities[1].prompt);await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));
 await fireEvent.click(screen.getByRole('button',{name:'Previous activity'}));await heading(admitted.presentation.activities[0].prompt);
 await waitFor(()=>expect(readFace().label).toBe('Play'));expect(screen.queryByRole('button',{name:'Play original recording'})).toBeNull();
});

it('R6: after the recording ends the discussion hold is Continue with no Play beside it',async()=>{
 savePack(admitted);vi.spyOn(libraryAdapter,'select').mockResolvedValue(admitted);
 render(App);await heading(admitted.presentation.activities[0].prompt);await waitFor(()=>expect(readFace().label).toBe('Begin'));
 await fireEvent.click(primary());await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));
 audio.active=false;audio.state({playing:false,src:null,elapsed:0,duration:0});audio.end();
 await waitFor(()=>expect(readFace().label).toBe('Continue'));
 expect(screen.queryByRole('button',{name:'Play original recording'})).toBeNull();expect(screen.queryByRole('button',{name:'Play',exact:true})).toBeNull();
 expect(progress(admitted.descriptor.id).session.index).toBe(0);
});

it('R6: a screen with no possible recording shows no enabled Play and sends no preparation request',async()=>{
 savePack(unadmitted);vi.spyOn(libraryAdapter,'select').mockResolvedValue(unadmitted);
 render(App);await heading(unadmitted.presentation.activities[0].prompt);await waitFor(()=>expect(readFace().label).toBe('Continue'));
 const dock=screen.getByRole('navigation',{name:'Session controls'});
 expect([...dock.querySelectorAll('button')].filter(b=>/^Play/.test(b.getAttribute('aria-label'))&&!b.disabled)).toHaveLength(0);
 await fireEvent.click(screen.getByRole('button',{name:'Replay'}));await wait(20);
 // Manual mode keeps the side Play in its slot, but it is disabled here.
 await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Settings',exact:true}));await fireEvent.click(screen.getByRole('checkbox',{name:/Automatic guide narration/}));await fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));
 const side=screen.getByRole('button',{name:'Play',exact:true});expect(side.disabled).toBe(true);await fireEvent.click(side);
 expect(libraryAdapter.prepareRecording).not.toHaveBeenCalled();expect(audio.play).not.toHaveBeenCalled();
});

it('R4: with narration off, a side Play keeps the centre on Continue and offers its own labelled cancel',async()=>{
 const bytes=deferred();libraryAdapter.playPreparedRecording.mockReturnValue(bytes.promise);savePack(admitted);vi.spyOn(libraryAdapter,'select').mockResolvedValue(admitted);
 render(App);await heading(admitted.presentation.activities[0].prompt);await waitFor(()=>expect(readFace().busy).toBe(false));
 await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Settings',exact:true}));await fireEvent.click(screen.getByRole('checkbox',{name:/Automatic guide narration/}));await fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));
 const from=faces.seen.length;
 await fireEvent.click(screen.getByRole('button',{name:'Play original recording'}));await waitFor(()=>expect(libraryAdapter.playPreparedRecording).toHaveBeenCalledTimes(1));
 const cancel=screen.getByRole('button',{name:'Cancel loading',exact:true});expect(cancel.classList.contains('guide-primary')).toBe(false);expect(cancel.querySelector('svg.lucide-x')).toBeTruthy();
 expect(faces.seen.slice(from-1).map(f=>f.label)).toEqual(['Continue']);
 await fireEvent.click(cancel);bytes.resolve({bytes:new Uint8Array(2),mime:'audio/mpeg',playbackRange:ready.playbackRange});await wait(20);
 expect(audio.play).not.toHaveBeenCalled();expect(readFace().label).toBe('Continue');
});
