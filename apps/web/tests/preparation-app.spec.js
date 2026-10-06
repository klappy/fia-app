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
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 audio.active=false;audio.play.mockImplementation((text,src)=>{audio.active=true;audio.src=src;audio.state({playing:true,src,elapsed:4,duration:60});});audio.pause.mockImplementation(()=>audio.state({playing:false,src:audio.src,elapsed:4,duration:60}));audio.stop.mockImplementation(()=>{audio.active=false;audio.state?.({playing:false,src:null,elapsed:0,duration:0});});audio.resume.mockImplementation(()=>{audio.state({playing:true,src:audio.src,elapsed:4,duration:60});return true;});
 vi.stubGlobal('crypto',webcrypto);localStorage.setItem('fia-v3-selected-pack',descriptor.id);
 vi.spyOn(libraryAdapter,'select').mockResolvedValue({descriptor,presentation});
 vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({files:[],savedFiles:[],deliveryRevision:null});
 vi.spyOn(libraryAdapter,'prepareRecording').mockResolvedValue({status:'ready',value:{}});vi.spyOn(libraryAdapter,'preparationStatus').mockResolvedValue({status:'ready',value:{}});vi.spyOn(libraryAdapter,'verifyPreparedRecording').mockResolvedValue(ready);vi.spyOn(libraryAdapter,'playPreparedRecording').mockResolvedValue({bytes:new Uint8Array(2),mime:'audio/mpeg',playbackRange:ready.playbackRange});
 URL.createObjectURL=vi.fn(()=> 'blob:prepared');URL.revokeObjectURL=vi.fn();HTMLMediaElement.prototype.pause=vi.fn();Element.prototype.scrollTo=vi.fn();
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();localStorage.clear();});
async function mount({automatic=false}={}){render(App);await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(presentation.activities[0].prompt));if(!automatic)await toggleNarration();}
async function toggleNarration(){await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Settings',exact:true}));await fireEvent.click(screen.getByRole('checkbox',{name:/Automatic guide narration/}));await fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));}
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
 const pending=deferred();libraryAdapter.playPreparedRecording.mockReturnValue(pending.promise);await mount();await fireEvent.click(screen.getByRole('button',{name:'Play original recording'}));await waitFor(()=>expect(libraryAdapter.playPreparedRecording).toHaveBeenCalledTimes(1));const cancel=screen.getByRole('button',{name:'Cancel loading'});expect(cancel.querySelector('svg.lucide-x')).toBeTruthy();expect(cancel.querySelector('svg.lucide-play')).toBeNull();await fireEvent.click(cancel);pending.resolve({bytes:new Uint8Array(2),mime:'audio/mpeg',playbackRange:ready.playbackRange});await new Promise(r=>setTimeout(r,10));expect(audio.play).not.toHaveBeenCalled();
});

it('preparation notice can be dismissed without canceling work and later state is visible',async()=>{
 const pending=deferred();libraryAdapter.prepareRecording.mockReturnValue(pending.promise);await mount();await fireEvent.click(screen.getByRole('button',{name:'Play original recording'}));await waitFor(()=>expect(screen.getByText(/Preparing this recording/)).toBeTruthy());
 const signal=libraryAdapter.prepareRecording.mock.calls[0][1];await fireEvent.click(screen.getByRole('button',{name:'Dismiss notice'}));expect(screen.queryByText(/Preparing this recording/)).toBeNull();expect(signal.aborted).toBe(false);
 pending.resolve({status:'unavailable',message:'This recording is awaiting review.'});await waitFor(()=>expect(screen.getByText('This recording is awaiting review.')).toBeTruthy());expect(audio.play).not.toHaveBeenCalled();
});
it('primary pauses prepared playback and manual hold remains on the same instruction until Continue',async()=>{
 await mount({automatic:true});await fireEvent.click(screen.getByRole('button',{name:'Begin'}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));
 expect(screen.getAllByRole('button',{name:'Pause',exact:true})).toHaveLength(1);expect(screen.getByRole('button',{name:'Skip to next activity'})).toBeTruthy();
 const primary=screen.getByRole('button',{name:'Pause',exact:true});expect(screen.queryByText('Recording ready. Press Play to listen.')).toBeNull();await fireEvent.click(primary);expect(audio.pause).toHaveBeenCalled();expect(screen.queryByText('Recording ready. Press Play to listen.')).toBeNull();expect(JSON.parse(localStorage.getItem('fia-v3-progress@1:'+descriptor.id)).session.index).toBe(0);
 expect(screen.getAllByRole('button',{name:'Resume',exact:true})).toHaveLength(1);const resume=screen.getByRole('button',{name:'Resume',exact:true});await fireEvent.click(resume);expect(audio.resume).toHaveBeenCalled();audio.active=false;audio.state({playing:false,src:null,elapsed:0,duration:0});audio.end();
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

it('manual narration keeps Continue in the center and one side Pause/Resume',async()=>{
 await mount();
 await fireEvent.click(screen.getByRole('button',{name:'Play original recording'}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));
 expect(screen.getByRole('button',{name:'Continue',exact:true}).classList.contains('guide-primary')).toBe(true);
 expect(screen.getAllByRole('button',{name:'Pause',exact:true})).toHaveLength(1);await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));
 expect(screen.getByRole('button',{name:'Continue',exact:true})).toBeTruthy();expect(screen.getAllByRole('button',{name:'Resume',exact:true})).toHaveLength(1);
});


it('explicit Next with automatic narration prepares only its destination and continues owned delayed readiness',async()=>{
 libraryAdapter.prepareRecording.mockResolvedValue({status:'preparing',id:'a'.repeat(64)});
 await mount({automatic:true});expect(libraryAdapter.prepareRecording).not.toHaveBeenCalled();
 await fireEvent.click(screen.getByRole('button',{name:'Skip to next activity',exact:true}));
 await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1),{timeout:2500});
 expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(1);expect(libraryAdapter.prepareRecording.mock.calls[0][0].activityId).toBe('S01-U002');
 expect(audio.play).toHaveBeenCalledWith(presentation.activities[1].narration,'blob:prepared',1,ready.playbackRange);
 expect(screen.getAllByRole('button',{name:'Pause',exact:true})).toHaveLength(1);
});
for(const phase of ['preparation','bytes'])it(`toggling automatic narration off/on revokes pending ${phase} playback`,async()=>{
 const pending=deferred();if(phase==='preparation')libraryAdapter.prepareRecording.mockReturnValue(pending.promise);else libraryAdapter.playPreparedRecording.mockReturnValue(pending.promise);
 await mount({automatic:true});await fireEvent.click(screen.getByRole('button',{name:'Skip to next activity',exact:true}));
 await waitFor(()=>expect(phase==='preparation'?libraryAdapter.prepareRecording:libraryAdapter.playPreparedRecording).toHaveBeenCalledTimes(1));
 await toggleNarration();await toggleNarration();
 pending.resolve(phase==='preparation'?{status:'ready',value:{}}:{bytes:new Uint8Array(2),mime:'audio/mpeg',playbackRange:ready.playbackRange});
 await new Promise(r=>setTimeout(r,20));expect(audio.play).not.toHaveBeenCalled();expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(1);
});
it('leaving an automatic preparation destination discards its late ready result',async()=>{
 const pending=deferred();libraryAdapter.prepareRecording.mockReturnValue(pending.promise);await mount({automatic:true});await fireEvent.click(screen.getByRole('button',{name:'Skip to next activity',exact:true}));await waitFor(()=>expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(1));
 await fireEvent.click(screen.getByRole('button',{name:'Previous activity'}));pending.resolve({status:'ready',value:{}});await new Promise(r=>setTimeout(r,20));expect(audio.play).not.toHaveBeenCalled();expect(libraryAdapter.verifyPreparedRecording).not.toHaveBeenCalled();
});


it('first Begin prepares the current guide without skipping and owns delayed playback',async()=>{
 libraryAdapter.prepareRecording.mockResolvedValue({status:'preparing',id:'a'.repeat(64)});await mount({automatic:true});
 expect(audio.play).not.toHaveBeenCalled();await fireEvent.click(screen.getByRole('button',{name:'Begin',exact:true}));
 await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1),{timeout:2500});expect(libraryAdapter.prepareRecording.mock.calls[0][0].activityId).toBe('S01-U001');
 expect(JSON.parse(localStorage.getItem('fia-v3-progress@1:'+descriptor.id)).session.index).toBe(0);
});
it('automatic Scripture with no published recording explains the absence and keeps text available',async()=>{
 await mount({automatic:true});await fireEvent.click(screen.getByRole('button',{name:'Skip to next activity'}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));
 await fireEvent.click(screen.getByRole('button',{name:'Skip to next activity'}));
 await waitFor(()=>expect(screen.getByText('No recording is available for this Scripture passage. You can read it and continue.')).toBeTruthy());
 expect(screen.getByRole('region',{name:'Scripture passage'})).toBeTruthy();expect(screen.getByRole('button',{name:'Continue',exact:true})).toBeTruthy();expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(1);
});

it('restored paused requestable instruction offers Play instead of skipping unheard text',async()=>{
 await mount({automatic:true});await fireEvent.click(screen.getByRole('button',{name:'Begin'}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));
 cleanup();audio.active=false;await mount({automatic:true});expect(screen.getByRole('button',{name:'Play',exact:true}).classList.contains('guide-primary')).toBe(true);expect(audio.play).toHaveBeenCalledTimes(1);
 await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(2));expect(libraryAdapter.prepareRecording.mock.calls.at(-1)[0].activityId).toBe('S01-U001');
});
it('automatic-mode Replay reuses the same current range without preparing a later activity',async()=>{
 await mount({automatic:true});await fireEvent.click(screen.getByRole('button',{name:'Begin'}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));
 audio.active=false;audio.state({playing:false,src:null,elapsed:0,duration:0});audio.end();await waitFor(()=>expect(screen.getByRole('button',{name:'Continue',exact:true})).toBeTruthy());
 await fireEvent.click(screen.getByRole('button',{name:'Replay'}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(2));expect(audio.play.mock.calls[1][3]).toEqual(ready.playbackRange);expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(1);
});


it('preparation cancellation shows an X and aborts without starting late ready audio',async()=>{
 const pending=deferred();libraryAdapter.prepareRecording.mockReturnValue(pending.promise);await mount();await fireEvent.click(screen.getByRole('button',{name:'Play original recording'}));
 await waitFor(()=>expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(1));const signal=libraryAdapter.prepareRecording.mock.calls[0][1];
 const cancel=screen.getByRole('button',{name:'Cancel preparation',exact:true});expect(cancel.querySelector('svg.lucide-x')).toBeTruthy();expect(cancel.querySelector('svg.lucide-play')).toBeNull();
 await fireEvent.click(cancel);expect(signal.aborted).toBe(true);pending.resolve({status:'ready',value:{}});await new Promise(r=>setTimeout(r,20));expect(audio.play).not.toHaveBeenCalled();
});

it('pre-request hash completion cannot resurrect playback after narration is turned off',async()=>{
 await mount({automatic:true});const gate=deferred(),digest=crypto.subtle.digest.bind(crypto.subtle);vi.spyOn(crypto.subtle,'digest').mockImplementationOnce(async(...args)=>{await gate.promise;return digest(...args);});
 await fireEvent.click(screen.getByRole('button',{name:'Begin',exact:true}));expect(libraryAdapter.prepareRecording).not.toHaveBeenCalled();
 await toggleNarration();gate.resolve();await new Promise(r=>setTimeout(r,20));expect(libraryAdapter.prepareRecording).not.toHaveBeenCalled();expect(audio.play).not.toHaveBeenCalled();
});

it('an admitted guide with a companion video honors the advertised Play video action',async()=>{
 const visual=structuredClone(presentation);visual.activities[0].assetId='test-image';visual.assets['test-image']={id:'test-image',kind:'image',title:'Companion image',relatedIds:['test-video']};visual.assets['test-video']={id:'test-video',kind:'video',title:'Companion video',src:'/test-video.mp4'};
 libraryAdapter.select.mockResolvedValue({descriptor,presentation:visual});libraryAdapter.mediaStatus.mockResolvedValue({deliveryRevision:'d'.repeat(64),files:[{path:'/test-video.mp4',bytes:3,group:'video'}]});
 const request=vi.spyOn(libraryAdapter,'playMedia').mockResolvedValue({bytes:new Uint8Array(3),mime:'video/mp4'});HTMLMediaElement.prototype.play=vi.fn(()=>Promise.resolve());
 render(App);await fireEvent.click(await screen.findByRole('button',{name:'Play video',exact:true}));
 await waitFor(()=>expect(request).toHaveBeenCalled());expect(libraryAdapter.prepareRecording).not.toHaveBeenCalled();expect(audio.play).not.toHaveBeenCalled();await waitFor(()=>expect(document.querySelector('video')).toBeTruthy());
});
it('an admitted guide with a requested image description honors its visual Play action',async()=>{
 const visual=structuredClone(presentation);visual.activities[0].assetId='test-image';visual.assets['test-image']={id:'test-image',kind:'image',title:'Companion image',description:'Describe this image',descriptionAudio:'/test-description.mp3',relatedIds:[]};
 libraryAdapter.select.mockResolvedValue({descriptor,presentation:visual});libraryAdapter.mediaStatus.mockResolvedValue({deliveryRevision:'d'.repeat(64),files:[{path:'/test-description.mp3',bytes:3,group:'audio'}]});
 const request=vi.spyOn(libraryAdapter,'playMedia').mockResolvedValue({bytes:new Uint8Array(3),mime:'audio/mpeg'});
 render(App);await waitFor(()=>expect(document.querySelector('.resource-visual')).toBeTruthy());await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Settings',exact:true}));await fireEvent.click(screen.getByRole('checkbox',{name:/Describe images and maps/}));await fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));
 await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await waitFor(()=>expect(request).toHaveBeenCalled());expect(libraryAdapter.prepareRecording).not.toHaveBeenCalled();expect(audio.play.mock.calls[0][0]).toBe('Describe this image');
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

it.each(['ready','failed'])('older media refresh %s cannot replace the newest installed revision',async outcome=>{
 const earlier=deferred(),registration=deferred(),body=structuredClone(presentation),path='/refresh-test.mp3';
 body.activities[0].audioSrc=path;libraryAdapter.select.mockResolvedValue({descriptor,presentation:body});
 vi.stubGlobal('navigator',{onLine:true,serviceWorker:{register:()=>registration.promise}});
 let selectedReads=0;
 libraryAdapter.mediaStatus.mockImplementation(pack=>pack.id===descriptor.id?(++selectedReads===1?earlier.promise:Promise.resolve({files:[{path}],savedFiles:[],deliveryRevision:'new-revision'})):Promise.resolve({files:[],savedFiles:[],deliveryRevision:null}));
 vi.spyOn(libraryAdapter,'playMedia').mockResolvedValue({bytes:new Uint8Array(2),mime:'audio/mpeg',playbackRange:ready.playbackRange});
 await mount();await waitFor(()=>expect(selectedReads).toBe(1));registration.resolve();await waitFor(()=>expect(selectedReads).toBe(2));
 if(outcome==='ready')earlier.resolve({files:[{path}],savedFiles:[],deliveryRevision:'old-revision'});else earlier.resolve(Promise.reject(Error('old status failed')));
 await new Promise(r=>setTimeout(r,0));await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));
 await waitFor(()=>expect(libraryAdapter.playMedia).toHaveBeenCalled());expect(libraryAdapter.playMedia.mock.calls[0][2]).toBe('new-revision');
});

it('late download status cannot resurrect saved capability after the newest status removes it',async()=>{
 const earlier=deferred(),registration=deferred(),network={onLine:true,serviceWorker:{register:()=>registration.promise}};
 vi.stubGlobal('navigator',network);let selectedReads=0;
 libraryAdapter.downloadStatus.mockImplementation(pack=>pack.id===descriptor.id?(++selectedReads===1?earlier.promise:Promise.resolve({saved:false})):Promise.resolve({saved:false}));
 await mount();await waitFor(()=>expect(selectedReads).toBe(1));registration.resolve();await waitFor(()=>expect(selectedReads).toBe(2));
 earlier.resolve({saved:true,active:{manifest:{presentationRevision:descriptor.revision,deliveryRevision:'old-revision',files:[]},files:[]}});
 await new Promise(r=>setTimeout(r,0));network.onLine=false;await fireEvent(window,new Event('offline'));
 expect(screen.getByText('You’re offline')).toBeTruthy();expect(screen.queryByText('Offline · session saved')).toBeNull();
});
