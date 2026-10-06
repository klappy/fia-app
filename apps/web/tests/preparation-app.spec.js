import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/svelte';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
const audio=vi.hoisted(()=>({play:vi.fn(),pause:vi.fn(),resume:vi.fn(),stop:vi.fn(),active:false}));
vi.mock('../src/lib/audio.js',()=>({createAudioController:(state,end)=>{audio.state=state;audio.end=end;return audio;}}));
import App from '../src/App.svelte';
import {libraryAdapter} from '../src/lib/library.js';
const registry=JSON.parse(readFileSync('public/content/registry.json','utf8'));
const descriptor=registry.packs.find(p=>p.id==='eng.MRK-1-14-20');
const presentation=JSON.parse(readFileSync('public'+descriptor.presentation.url,'utf8'));
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};
const ready={jobId:'a'.repeat(64),resultSha256:'b'.repeat(64),playbackRange:{startSeconds:4,endSeconds:9}};
beforeEach(()=>{
 audio.active=false;audio.play.mockImplementation((text,src)=>{audio.active=true;audio.src=src;audio.state({playing:true,src,elapsed:4,duration:60});});audio.pause.mockImplementation(()=>audio.state({playing:false,src:audio.src,elapsed:4,duration:60}));audio.stop.mockImplementation(()=>{audio.active=false;audio.state?.({playing:false,src:null,elapsed:0,duration:0});});audio.resume.mockImplementation(()=>{audio.state({playing:true,src:audio.src,elapsed:4,duration:60});return true;});
 vi.stubGlobal('crypto',webcrypto);localStorage.setItem('fia-v3-selected-pack',descriptor.id);
 vi.spyOn(libraryAdapter,'select').mockResolvedValue({descriptor,presentation});
 vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({files:[],savedFiles:[],deliveryRevision:null});
 vi.spyOn(libraryAdapter,'prepareRecording').mockResolvedValue({status:'ready',value:{}});vi.spyOn(libraryAdapter,'preparationStatus').mockResolvedValue({status:'ready',value:{}});vi.spyOn(libraryAdapter,'verifyPreparedRecording').mockResolvedValue(ready);vi.spyOn(libraryAdapter,'playPreparedRecording').mockResolvedValue({bytes:new Uint8Array(2),mime:'audio/mpeg',playbackRange:ready.playbackRange});
 URL.createObjectURL=vi.fn(()=> 'blob:prepared');URL.revokeObjectURL=vi.fn();HTMLMediaElement.prototype.pause=vi.fn();Element.prototype.scrollTo=vi.fn();
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();localStorage.clear();});
async function mount(){render(App);await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(presentation.activities[0].prompt));}
it('browse and Continue remain silent; explicit original Play requests exact activity and plays warm verified bytes',async()=>{
 await mount();expect(libraryAdapter.prepareRecording).not.toHaveBeenCalled();expect(audio.play).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Continue',exact:true})).toBeTruthy();
 await fireEvent.click(screen.getByRole('button',{name:'Play original recording',exact:true}));await waitFor(()=>expect(audio.play).toHaveBeenCalledWith(presentation.activities[0].narration,'blob:prepared',1,ready.playbackRange));
 expect(libraryAdapter.prepareRecording.mock.calls[0][0]).toEqual({packId:descriptor.id,presentationRevision:descriptor.revision,language:'eng',edition:'fia-guide',activityId:'S01-U001',sourceUnitId:'S01-U001',sourceTextSha256:presentation.activities[0].sourceSha256,quality:'original'});
});
it('Continue during pending preparation advances without enqueueing next activity and discards late ready',async()=>{
 const pending=deferred();libraryAdapter.prepareRecording.mockReturnValue(pending.promise);await mount();await fireEvent.click(screen.getByRole('button',{name:'Play original recording'}));await waitFor(()=>expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(1));
 const signal=libraryAdapter.prepareRecording.mock.calls[0][1];await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));expect(signal.aborted).toBe(true);pending.resolve({status:'ready',value:{}});await new Promise(r=>setTimeout(r,10));expect(audio.play).not.toHaveBeenCalled();expect(libraryAdapter.verifyPreparedRecording).not.toHaveBeenCalled();expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(1);
});
it('background status completion becomes ready without autoplay; next Play consumes descriptor',async()=>{
 libraryAdapter.prepareRecording.mockResolvedValue({status:'preparing',id:'a'.repeat(64)});await mount();await fireEvent.click(screen.getByRole('button',{name:'Play original recording'}));await waitFor(()=>expect(libraryAdapter.preparationStatus).toHaveBeenCalledTimes(1),{timeout:2500});await waitFor(()=>expect(screen.getByText('Recording ready. Press Play to listen.')).toBeTruthy());expect(audio.play).not.toHaveBeenCalled();await fireEvent.click(screen.getByRole('button',{name:'Play original recording'}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(1);expect(screen.queryByText('Recording ready. Press Play to listen.')).toBeNull();
});
it('unavailable state leaves Continue usable and never fabricates narration',async()=>{
 libraryAdapter.prepareRecording.mockResolvedValue({status:'unavailable',message:'This recording is awaiting review.'});await mount();await fireEvent.click(screen.getByRole('button',{name:'Play original recording'}));await waitFor(()=>expect(screen.getByText('This recording is awaiting review.')).toBeTruthy());expect(audio.play).not.toHaveBeenCalled();await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(1);
});
it('cancel while ready audio loads prevents late audio playback',async()=>{
 const pending=deferred();libraryAdapter.playPreparedRecording.mockReturnValue(pending.promise);await mount();await fireEvent.click(screen.getByRole('button',{name:'Play original recording'}));await waitFor(()=>expect(libraryAdapter.playPreparedRecording).toHaveBeenCalledTimes(1));await fireEvent.click(screen.getByRole('button',{name:'Cancel loading'}));pending.resolve({bytes:new Uint8Array(2),mime:'audio/mpeg',playbackRange:ready.playbackRange});await new Promise(r=>setTimeout(r,10));expect(audio.play).not.toHaveBeenCalled();
});

it('preparation notice can be dismissed without canceling work and later state is visible',async()=>{
 const pending=deferred();libraryAdapter.prepareRecording.mockReturnValue(pending.promise);await mount();await fireEvent.click(screen.getByRole('button',{name:'Play original recording'}));await waitFor(()=>expect(screen.getByText(/Preparing this recording/)).toBeTruthy());
 const signal=libraryAdapter.prepareRecording.mock.calls[0][1];await fireEvent.click(screen.getByRole('button',{name:'Dismiss notice'}));expect(screen.queryByText(/Preparing this recording/)).toBeNull();expect(signal.aborted).toBe(false);
 pending.resolve({status:'unavailable',message:'This recording is awaiting review.'});await waitFor(()=>expect(screen.getByText('This recording is awaiting review.')).toBeTruthy());expect(audio.play).not.toHaveBeenCalled();
});
it('primary pauses prepared playback and manual hold remains on the same instruction until Continue',async()=>{
 await mount();await fireEvent.click(screen.getByRole('button',{name:'Play original recording'}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));
 const primary=document.querySelector('.guide-primary')||screen.getAllByRole('button',{name:'Pause',exact:true})[0];expect(screen.queryByText('Recording ready. Press Play to listen.')).toBeNull();await fireEvent.click(primary);expect(audio.pause).toHaveBeenCalled();expect(screen.queryByText('Recording ready. Press Play to listen.')).toBeNull();expect(JSON.parse(localStorage.getItem('fia-v3-progress@1:'+descriptor.id)).session.index).toBe(0);
 const resume=screen.getAllByRole('button',{name:'Resume',exact:true})[0];await fireEvent.click(resume);expect(audio.resume).toHaveBeenCalled();audio.active=false;audio.state({playing:false,src:null,elapsed:0,duration:0});audio.end();
 await waitFor(()=>expect(screen.getByRole('button',{name:'Continue',exact:true})).toBeTruthy());expect(JSON.parse(localStorage.getItem('fia-v3-progress@1:'+descriptor.id)).session.index).toBe(0);
 await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await waitFor(()=>expect(JSON.parse(localStorage.getItem('fia-v3-progress@1:'+descriptor.id)).session.index).toBe(1));expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(1);
});

it('Replay reuses prepared descriptor with explicit range playback and no extra preparation POST',async()=>{
 await mount();await fireEvent.click(screen.getByRole('button',{name:'Play original recording'}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));
 audio.active=false;audio.state({playing:false,src:null,elapsed:0,duration:0});audio.end();await waitFor(()=>expect(screen.getByRole('button',{name:'Continue',exact:true})).toBeTruthy());
 await fireEvent.click(screen.getByRole('button',{name:'Replay',exact:true}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(2));expect(audio.play.mock.calls[1][3]).toEqual(ready.playbackRange);expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(1);expect(libraryAdapter.playPreparedRecording).toHaveBeenCalledTimes(2);
});

it('ready guidance remains until actual playback starts, then stays cleared on pause',async()=>{
 audio.play.mockImplementation((text,src)=>{audio.active=true;audio.src=src;audio.state({playing:false,src,elapsed:0,duration:60});});
 await mount();await fireEvent.click(screen.getByRole('button',{name:'Play original recording'}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));
 expect(screen.getByText('Recording ready. Press Play to listen.')).toBeTruthy();
 audio.state({playing:true,src:'blob:stale',elapsed:4,duration:60});await new Promise(r=>setTimeout(r,0));expect(screen.getByText('Recording ready. Press Play to listen.')).toBeTruthy();
 audio.state({playing:true,src:'blob:prepared',elapsed:4,duration:60});await waitFor(()=>expect(screen.queryByText('Recording ready. Press Play to listen.')).toBeNull());
 await fireEvent.click(screen.getAllByRole('button',{name:'Pause',exact:true})[0]);expect(screen.queryByText('Recording ready. Press Play to listen.')).toBeNull();expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(1);
});

it('failed playback keeps its actionable error instead of clearing preparation guidance early',async()=>{
 libraryAdapter.playPreparedRecording.mockRejectedValue(new Error('The prepared recording changed. Press Play to check again.'));
 await mount();await fireEvent.click(screen.getByRole('button',{name:'Play original recording'}));
 await waitFor(()=>expect(screen.getByText('The prepared recording changed. Press Play to check again.')).toBeTruthy());expect(audio.play).not.toHaveBeenCalled();
});
it('qualified original whole-file playback uses native EOF at 1x with no range argument',async()=>{
 const p3=registry.packs.find(p=>p.id==='eng.MRK-1-21-28'),body=JSON.parse(readFileSync('public'+p3.presentation.url,'utf8'));
 localStorage.setItem('fia-v3-selected-pack',p3.id);libraryAdapter.select.mockResolvedValue({descriptor:p3,presentation:body});
 libraryAdapter.playPreparedRecording.mockResolvedValue({bytes:new Uint8Array(4),mime:'audio/wav',playback:'whole-file-native-ended'});
 render(App);await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(body.activities[0].prompt));
 await fireEvent.click(screen.getByRole('button',{name:'Play original recording',exact:true}));
 await waitFor(()=>expect(audio.play).toHaveBeenCalledWith(body.activities[0].narration,'blob:prepared',1));
 expect(audio.play.mock.calls[0]).toHaveLength(3);expect(libraryAdapter.prepareRecording.mock.calls[0][0].packId).toBe(p3.id);
});
