// Easy-button state machine at the App boundary (cookbook RECIPE R4, R5, R6).
// Faces are read from the rendered primary, never from internal state.
import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,within} from '@testing-library/svelte';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {createSession} from '../src/lib/engine.js';
const audio=vi.hoisted(()=>({play:vi.fn(),pause:vi.fn(),resume:vi.fn(),stop:vi.fn(),active:false}));
vi.mock('../src/lib/audio.js',()=>({createAudioController:(state,end)=>{audio.state=state;audio.end=end;return audio;}}));
import App from '../src/App.svelte';
import {libraryAdapter,RESTORE_TIMEOUT_MS} from '../src/lib/library.js';
import {activities,bundledPresentation} from '../src/lib/content.js';
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

// A slow answer is still the answer: nothing is guessed while a check is outstanding (k0006).
// Fake time jumps past every former deadline and otherwise follows the real clock.
const slowly=()=>vi.useFakeTimers({toFake:['setTimeout','clearTimeout'],shouldAdvanceTime:true});
const SLOW_MS=5000;
const notices=()=>screen.queryAllByRole('status').map(n=>n.textContent).join(' | ');
it('R5 E1: a slow check keeps verifying until it answers, then changes once; nothing is guessed meanwhile',async()=>{
 slowly();
 try{
  const media=deferred();libraryAdapter.mediaStatus.mockReturnValue(media.promise);
  render(App);await vi.advanceTimersByTimeAsync(10000);
  expect(faces.labels()).toEqual([CHECKING]);
  media.resolve(bundledMedia);await waitFor(()=>expect(readFace().busy).toBe(false));await wait(50);
  expect(faces.labels()).toEqual([CHECKING,'Begin']);
 }finally{vi.useRealTimers();}
});

for(const tap of [false,true])it(`R5 E1${tap?'/E4':''}: a restore slower than any check stays checking until the saved passage is verified${tap?'; a tap while checking never starts the default passage':''}`,async()=>{
 slowly();
 try{
  const selected=deferred();savePack(unadmitted);vi.spyOn(libraryAdapter,'select').mockReturnValue(selected.promise);
  render(App);await vi.advanceTimersByTimeAsync(30);
  if(tap)await fireEvent.click(primary());
  await vi.advanceTimersByTimeAsync(SLOW_MS);
  // The default passage was checked long ago, but it is not the passage the person will see.
  expect(faces.labels()).toEqual([CHECKING]);expect(libraryAdapter.playMedia).not.toHaveBeenCalled();expect(audio.play).not.toHaveBeenCalled();
  selected.resolve(unadmitted);await heading(unadmitted.presentation.activities[0].prompt);
  await waitFor(()=>expect(readFace().busy).toBe(false));await wait(50);
  expect(faces.labels()).toEqual([CHECKING,'Continue']);
  expect(libraryAdapter.playMedia).not.toHaveBeenCalled();expect(audio.play).not.toHaveBeenCalled();expect(libraryAdapter.prepareRecording).not.toHaveBeenCalled();
  expect(progress(unadmitted.descriptor.id)?.session.index??0).toBe(0);
 }finally{vi.useRealTimers();}
});

it('R5 E4: a tap queued during a slow restore performs the restored passage’s checked Begin once',async()=>{
 slowly();
 try{
  const selected=deferred();savePack(admitted);vi.spyOn(libraryAdapter,'select').mockReturnValue(selected.promise);
  render(App);await vi.advanceTimersByTimeAsync(30);await fireEvent.click(primary());
  await vi.advanceTimersByTimeAsync(SLOW_MS);
  expect(faces.labels()).toEqual([CHECKING]);expect(libraryAdapter.playMedia).not.toHaveBeenCalled();expect(audio.play).not.toHaveBeenCalled();
  selected.resolve(admitted);await heading(admitted.presentation.activities[0].prompt);
  await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));
  await waitFor(()=>expect(readFace().icon).toBe('lucide-pause'),{timeout:3000});await wait(50);
  expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(1);expect(libraryAdapter.prepareRecording.mock.calls[0][0].packId).toBe(admitted.descriptor.id);
  expect(libraryAdapter.playMedia).not.toHaveBeenCalled();expect(audio.play).toHaveBeenCalledTimes(1);
  // [verifying, the state the checked action leads to]: starting, then Pause.
  expect(faces.labels()).toEqual([CHECKING,'Pause','Pause']);expect(isStarting(faces.seen[1])).toBe(true);
 }finally{vi.useRealTimers();}
});

for(const delay of [0,SLOW_MS])it(`R1/R5: a failed restore${delay?' slower than any check':''} re-checks the default passage, then changes once; a tap queued for the saved passage is dropped`,async()=>{
 slowly();
 try{
  const selected=deferred();savePack(unadmitted);vi.spyOn(libraryAdapter,'select').mockReturnValue(selected.promise);
  render(App);await vi.advanceTimersByTimeAsync(30);await fireEvent.click(primary());
  await vi.advanceTimersByTimeAsync(delay);
  expect(faces.labels()).toEqual([CHECKING]);
  const checks=libraryAdapter.mediaStatus.mock.calls.length;
  selected.reject(Object.assign(Error('This passage is not available yet. Your current passage stays open.'),{code:'passage-unavailable'}));
  await waitFor(()=>expect(readFace().busy).toBe(false));await wait(50);
  // The default passage's own check ran after the restore failed; its action is verified, not guessed.
  expect(libraryAdapter.mediaStatus.mock.calls.length).toBeGreaterThan(checks);
  expect(faces.labels()).toEqual([CHECKING,'Begin']);
  expect(notices()).toContain('Your last passage is not available yet, so Mark 1:1–13 is open.');
  expect(localStorage.getItem('fia-v3-selected-pack')).toBeNull();
  expect(audio.play).not.toHaveBeenCalled();expect(libraryAdapter.playMedia).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
});

// A stalled restore (accepted, never answered) is bounded where it is made: past its bound it is a
// missing connection, so R1's fallback says so, keeps the saved key and the default passage is checked.
const bound=RESTORE_TIMEOUT_MS??15000;
it('R1/R5: a launch restore that never answers ends at its bound in R1\'s transient fallback: checking, then one Begin; the key is kept',async()=>{
 slowly();
 try{
  let signal;savePack(unadmitted);
  vi.spyOn(libraryAdapter,'select').mockImplementation((id,options)=>{signal=options.signal;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));});
  render(App);await vi.advanceTimersByTimeAsync(30);await fireEvent.click(primary());
  await vi.advanceTimersByTimeAsync(bound-1000);
  expect(faces.labels()).toEqual([CHECKING]);expect(signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1000);
  await waitFor(()=>expect(readFace().busy).toBe(false));await wait(50);
  expect(signal.aborted).toBe(true);expect(signal.reason.code).toBe('passage-transient');
  expect(faces.labels()).toEqual([CHECKING,'Begin']);
  expect(notices()).toContain('Your last passage could not be reached, so Mark 1:1–13 is open.');
  expect(localStorage.getItem('fia-v3-selected-pack')).toBe(unadmitted.descriptor.id);
  // The tap was for the saved passage; it never starts the fallback.
  expect(audio.play).not.toHaveBeenCalled();expect(libraryAdapter.playMedia).not.toHaveBeenCalled();
  expect(RESTORE_TIMEOUT_MS).toBeGreaterThanOrEqual(10000);expect(RESTORE_TIMEOUT_MS).toBeLessThanOrEqual(15000);
 }finally{vi.useRealTimers();}
});

it('R5: a restore that answers inside its bound is not cut off by it',async()=>{
 slowly();
 try{
  let signal;const selected=deferred();savePack(unadmitted);
  vi.spyOn(libraryAdapter,'select').mockImplementation((id,options)=>{signal=options.signal;return selected.promise;});
  render(App);await vi.advanceTimersByTimeAsync(bound-500);
  selected.resolve(unadmitted);await heading(unadmitted.presentation.activities[0].prompt);
  await waitFor(()=>expect(readFace().busy).toBe(false));await vi.advanceTimersByTimeAsync(bound);await wait(50);
  expect(faces.labels()).toEqual([CHECKING,'Continue']);expect(signal.aborted).toBe(false);expect(notices()).not.toContain('Your last passage');
  expect(localStorage.getItem('fia-v3-selected-pack')).toBe(unadmitted.descriptor.id);
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

it('R6.2: an admitted screen that has not been heard offers Begin/Play on every arrival; Back never settles it into a hold',async()=>{
 savePack(admitted);vi.spyOn(libraryAdapter,'select').mockResolvedValue(admitted);
 render(App);await heading(admitted.presentation.activities[0].prompt);await waitFor(()=>expect(readFace().busy).toBe(false));await wait(30);
 expect(faces.labels()).toEqual([CHECKING,'Begin']);expect(readFace().icon).toBe('lucide-play');
 expect(screen.queryByRole('button',{name:'Play original recording'})).toBeNull();expect(screen.getByRole('button',{name:'Skip to next activity'})).toBeTruthy();
 // Forward then Back: navigation does not settle an admitted screen into a silent hold.
 await fireEvent.click(screen.getByRole('button',{name:'Skip to next activity'}));await heading(admitted.presentation.activities[1].prompt);await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));
 await fireEvent.click(screen.getByRole('button',{name:'Previous activity'}));await heading(admitted.presentation.activities[0].prompt);
 await waitFor(()=>expect(readFace().label).toBe('Play'));expect(screen.queryByRole('button',{name:'Play original recording'})).toBeNull();
 expect(progress(admitted.descriptor.id).session.status).toBe('ready');
});

// R6.2/K4: 'waiting' means this screen was heard. An admitted screen enters it only the ways a
// Mark 1:1–13 screen does (its own recording ended), and a heard screen shows the same dock
// however the person arrives: when the recording ends, after a reload, and after reopening it.
function dockState(){const nav=screen.getByRole('navigation',{name:'Session controls'});return {primary:readFace().label,others:[...nav.querySelectorAll('button:not(.guide-primary)')].map(b=>`${b.getAttribute('aria-label')}${b.disabled?' (disabled)':''}`)};}
async function verified(){await waitFor(()=>expect(readFace().busy).toBe(false));await wait(50);}
async function openFromPassages(title){
 await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Passages',exact:true}));
 const card=(await screen.findByRole('heading',{name:title})).closest('article');
 await fireEvent.click(within(card).getByRole('button',{name:/Open passage|Resume passage/}));
}
const bundledServer=pack('eng.MRK-1-1-13');
for(const c of [{name:'Mark 1:1–13 S01-U003 (discussion)',pack:bundledServer,index:5,other:admitted},{name:'Mark 1:14–20 S01-U001 (admitted guide)',pack:admitted,index:0,other:bundledServer}])it(`R6.2/K4: ${c.name}, once heard, shows the same dock on every arrival: recording end, reload, reopen`,async()=>{
 const a=c.pack.presentation.activities[c.index],id=c.pack.descriptor.id;
 libraryAdapter.mediaStatus.mockImplementation(async p=>p.id==='eng.MRK-1-1-13'?{...bundledMedia,files:[{path:bundledServer.presentation.activities[5].audioSrc,bytes:3,mime:'audio/mpeg'}]}:{files:[],savedFiles:[],deliveryRevision:null});
 vi.spyOn(libraryAdapter,'select').mockImplementation(async selected=>pack(selected));
 vi.spyOn(libraryAdapter,'languages').mockResolvedValue([{id:'eng',name:'English',nativeName:'English',ready:68}]);
 vi.spyOn(libraryAdapter,'passages').mockResolvedValue([c.pack.descriptor,c.other.descriptor]);
 savePack(c.pack,{index:c.index});
 // 1. The recording ends on this screen.
 render(App);await heading(a.prompt);await verified();
 await fireEvent.click(primary());await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));
 audio.active=false;audio.state({playing:false,src:null,elapsed:0,duration:0});audio.end();
 await waitFor(()=>expect(progress(id).session.status).toBe('waiting'));await waitFor(()=>expect(readFace().label).toBe('Continue'));await wait(50);
 const live=dockState();
 expect(live.others).toContain('Skip to next activity');expect(live.others.filter(label=>/^Play/.test(label))).toEqual([]);
 // 2. A reload.
 faces.stop();cleanup();faces=recordFaces();
 render(App);await heading(a.prompt);await verified();
 expect(faces.labels()).toEqual([CHECKING,'Continue']);expect(dockState()).toEqual(live);
 // 3. Another passage, then this one again from Passages.
 await openFromPassages(c.other.descriptor.title);await heading(c.other.presentation.activities[0].prompt);await verified();
 const from=faces.seen.length;
 await openFromPassages(c.pack.descriptor.title);await heading(a.prompt);await verified();
 expect(faces.labels().slice(from)).toEqual([CHECKING,'Continue']);expect(dockState()).toEqual(live);
 expect(progress(id).session.index).toBe(c.index);
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

it('R6.3/K4: a restored waiting term screen keeps Continue, which opens the definition, with Skip beside it',async()=>{
 const i=75,a=activities[i],term=bundledPresentation.assets[a.assetId];
 expect(term.kind).toBe('term');
 libraryAdapter.mediaStatus.mockResolvedValue({...bundledMedia,files:[{path:a.audioSrc,bytes:3,mime:'audio/mpeg'},{path:term.descriptionAudio,bytes:3,mime:'audio/mpeg'}]});
 savePack(pack('eng.MRK-1-1-13'),{index:i,status:'waiting'});
 render(App);await waitFor(()=>expect(readFace().busy).toBe(false));await wait(50);
 expect(faces.labels()).toEqual([CHECKING,'Continue']);
 const dock=screen.getByRole('navigation',{name:'Session controls'});
 expect([...dock.querySelectorAll('button')].map(b=>b.getAttribute('aria-label')).filter(l=>/^Play/.test(l))).toEqual([]);
 expect(screen.getByRole('button',{name:'Skip to next activity'}).disabled).toBe(false);
 await fireEvent.click(primary());await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));
 // The definition plays; the instruction is not replayed and the screen does not advance.
 expect(libraryAdapter.playMedia.mock.calls.map(c=>c[1])).toEqual([term.descriptionAudio]);
 expect(progress('eng.MRK-1-1-13').session.index).toBe(i);
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
