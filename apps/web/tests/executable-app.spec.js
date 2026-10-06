import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/svelte';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {fixture as savedFixture,worker as savedWorker} from './helpers/offline-execution.js';
const audio=vi.hoisted(()=>({play:vi.fn(),pause:vi.fn(),resume:vi.fn(),stop:vi.fn(),active:false}));
vi.mock('../src/lib/audio.js',()=>({createAudioController:(state,end)=>{audio.state=state;audio.end=end;return audio;}}));
import App from '../src/App.svelte';import {libraryAdapter} from '../src/lib/library.js';
const registry=JSON.parse(readFileSync('public/content/registry.json','utf8')),descriptor=registry.packs.find(p=>p.id==='eng.MRK-1-14-20'),base=JSON.parse(readFileSync('public'+descriptor.presentation.url,'utf8'));
const h='a'.repeat(64),ref={id:'server-authoritative-reference',sha256:h};
let presentation,tools;
const readyAudio={bytes:new Uint8Array([1,2]),mime:'audio/wav',playback:'whole-file-native-ended'};
beforeEach(()=>{
 presentation=structuredClone(base);presentation.execution={schema:'fia-executable-presentation@1',sourceRevision:'source-1',decisionEvidenceSha256:h,recipeRevision:'recipe-1'};
 for(const a of presentation.activities)a.execution={narration:{action:'none'},focalAssetId:a.assetId??null,completion:{action:'manual-continue'}};
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};HTMLMediaElement.prototype.pause=vi.fn();Element.prototype.scrollTo=vi.fn();
 vi.stubGlobal('crypto',webcrypto);localStorage.setItem('fia-v3-selected-pack',descriptor.id);tools=new Map();Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:t=>tools.set(t.name,t)}});
 audio.active=false;audio.play.mockImplementation((text,src)=>{audio.active=true;audio.src=src;audio.state({playing:true,src,elapsed:0,duration:2});});audio.stop.mockImplementation(()=>{audio.active=false;audio.state?.({playing:false,src:null,elapsed:0,duration:0});});audio.pause.mockImplementation(()=>audio.state({playing:false,src:audio.src,elapsed:0,duration:2}));audio.resume.mockImplementation(()=>{audio.state({playing:true,src:audio.src,elapsed:0,duration:2});return true;});
 vi.spyOn(libraryAdapter,'select').mockImplementation(async()=>({descriptor,presentation}));vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({files:[],savedFiles:[],deliveryRevision:null});
 vi.spyOn(libraryAdapter,'playBoundAudio').mockResolvedValue(readyAudio);vi.spyOn(libraryAdapter,'prepareOriginal').mockResolvedValue(null);vi.spyOn(libraryAdapter,'prepareRecording').mockResolvedValue({status:'ready',value:{}});vi.spyOn(libraryAdapter,'preparationStatus').mockResolvedValue({status:'ready',value:{}});vi.spyOn(libraryAdapter,'verifyPreparedRecording').mockResolvedValue({id:'verified'});vi.spyOn(libraryAdapter,'playPreparedRecording').mockResolvedValue(readyAudio);
 URL.createObjectURL=vi.fn(()=> 'blob:execution');URL.revokeObjectURL=vi.fn();
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();localStorage.clear();delete document.modelContext;});
// R5: the easy button checks availability before it shows an action.
async function mount(){render(App);await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(presentation.activities[0].prompt));await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false));}
function firstNarration(action='play-bound-audio',completion='manual-continue'){presentation.activities[0].execution.narration={action,[action==='prepare-original'?'demand':'artifact']:ref};presentation.activities[0].execution.completion.action=completion;}
function ended(){audio.active=false;audio.state({playing:false,src:null,elapsed:0,duration:0});audio.end();}
it('explicit server narration completes into a silent child; replay/back never infer narration from retained source',async()=>{
 firstNarration('play-bound-audio','advance-after-narration');presentation.activities[1].narration='';
 await mount();expect(libraryAdapter.playBoundAudio).not.toHaveBeenCalled();await fireEvent.click(screen.getByRole('button',{name:'Begin',exact:true}));await waitFor(()=>expect(audio.play).toHaveBeenCalledWith('','blob:execution',1));ended();
 await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(presentation.activities[1].prompt));await fireEvent.click(screen.getByRole('button',{name:'Replay',exact:true}));expect(libraryAdapter.playBoundAudio).toHaveBeenCalledTimes(1);expect(libraryAdapter.prepareRecording).not.toHaveBeenCalled();expect(libraryAdapter.preparationStatus).not.toHaveBeenCalled();expect(libraryAdapter.playPreparedRecording).not.toHaveBeenCalled();
 await fireEvent.click(screen.getByRole('button',{name:'Previous activity'}));expect(libraryAdapter.playBoundAudio).toHaveBeenCalledTimes(1);await fireEvent.click(screen.getByRole('button',{name:'Replay',exact:true}));await waitFor(()=>expect(libraryAdapter.playBoundAudio).toHaveBeenCalledTimes(2));
});
it('none with source text never prepares on manual Play, Replay, or browser completion tool',async()=>{
 await mount();await fireEvent.click(screen.getByRole('button',{name:'Replay',exact:true}));const play=screen.queryByRole('button',{name:'Play',exact:true});if(play)expect(play.disabled).toBe(true);
 await tools.get('fia_complete_activity').execute({activityId:presentation.activities[0].id});expect(libraryAdapter.playBoundAudio).not.toHaveBeenCalled();expect(libraryAdapter.prepareOriginal).not.toHaveBeenCalled();expect(libraryAdapter.prepareRecording).not.toHaveBeenCalled();expect(libraryAdapter.preparationStatus).not.toHaveBeenCalled();expect(audio.play).not.toHaveBeenCalled();
});
it('prepared action uses bound server identity unchanged even when it differs from visible projection revision',async()=>{
 firstNarration('prepare-original');const identity={packId:descriptor.id,presentationRevision:'b'.repeat(64),language:'eng',edition:'fia-guide',quality:'original',activityId:'server-step',sourceUnitId:'server-unit',sourceTextSha256:'c'.repeat(64)};
 libraryAdapter.prepareOriginal.mockImplementation((reference,context)=>context.prepareNarration(identity,context));await mount();await fireEvent.click(screen.getByRole('button',{name:'Begin',exact:true}));await waitFor(()=>expect(audio.play).toHaveBeenCalled());expect(libraryAdapter.prepareRecording.mock.calls[0][0]).toEqual(identity);expect(libraryAdapter.prepareOriginal.mock.calls[0][0]).toEqual(ref);ended();expect(JSON.parse(localStorage.getItem('fia-v3-progress@1:'+descriptor.id)).session.index).toBe(0);
});
it('navigation cancels bound action and prevents late port result playback',async()=>{
 firstNarration();let resolve;libraryAdapter.playBoundAudio.mockImplementation(()=>new Promise(r=>resolve=r));await mount();await fireEvent.click(screen.getByRole('button',{name:'Begin',exact:true}));await waitFor(()=>expect(libraryAdapter.playBoundAudio).toHaveBeenCalled());const signal=libraryAdapter.playBoundAudio.mock.calls[0][1].signal;
 await tools.get('fia_complete_activity').execute({activityId:presentation.activities[0].id});expect(signal.aborted).toBe(true);resolve(readyAudio);await new Promise(r=>setTimeout(r,0));expect(audio.play).not.toHaveBeenCalled();
});
it.each(['unsupported','unavailable','invalid'])('blocked executable narration uses approved readable copy without changing raw %s reason or authority',async status=>{
 const reason=`server-${status}-machine-code`;presentation.activities[0].execution.narration={action:'blocked',status,reason};await mount();expect(screen.getByRole('status').textContent).toContain('This recording is unavailable. You can continue.');expect(screen.getByRole('status').textContent).not.toContain(reason);expect(presentation.activities[0].execution.narration).toEqual({action:'blocked',status,reason});expect(screen.getByRole('button',{name:'Continue',exact:true}).disabled).toBe(false);await fireEvent.click(screen.getByRole('button',{name:'Replay',exact:true}));expect(libraryAdapter.playBoundAudio).not.toHaveBeenCalled();expect(libraryAdapter.prepareOriginal).not.toHaveBeenCalled();expect(libraryAdapter.prepareRecording).not.toHaveBeenCalled();expect(libraryAdapter.preparationStatus).not.toHaveBeenCalled();expect(audio.play).not.toHaveBeenCalled();
});
it('R5: a blocked recording notice is raised only once the passage is checked, never beside the checking pulse',async()=>{
 presentation.activities[0].execution.narration={action:'blocked',status:'unavailable',reason:'server-unavailable-machine-code'};
 let release;libraryAdapter.mediaStatus.mockReturnValue(new Promise(r=>release=r));
 render(App);await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(presentation.activities[0].prompt));await new Promise(r=>setTimeout(r,30));
 expect(document.querySelector('.guide-primary').getAttribute('aria-busy')).toBe('true');
 expect(screen.queryAllByRole('status').map(n=>n.textContent).join(' ')).not.toContain('This recording is unavailable.');
 release({files:[],savedFiles:[],deliveryRevision:null});
 await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false));
 expect(screen.getByRole('status').textContent).toContain('This recording is unavailable. You can continue.');
});
it('manual Play while automatic narration is off executes only the declared action and pause/resume reuses it',async()=>{
 firstNarration();await mount();await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Settings',exact:true}));await fireEvent.click(screen.getByRole('checkbox',{name:/Automatic guide narration/}));await fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));expect(libraryAdapter.playBoundAudio).not.toHaveBeenCalled();
 await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await waitFor(()=>expect(audio.play).toHaveBeenCalled());await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));expect(audio.pause).toHaveBeenCalled();await fireEvent.click(screen.getByRole('button',{name:'Resume',exact:true}));expect(audio.resume).toHaveBeenCalled();expect(libraryAdapter.playBoundAudio).toHaveBeenCalledTimes(1);
 const progress=()=>JSON.parse(localStorage.getItem('fia-v3-progress@1:'+descriptor.id));
 expect(progress().session.status).toBe('playing');ended();
 await waitFor(()=>expect(progress().session.status).toBe('waiting'));
 expect(progress().activityId).toBe(presentation.activities[0].id);expect(progress().session.index).toBe(0);
 await new Promise(resolve=>setTimeout(resolve,30));expect(progress().session.status).toBe('waiting');expect(libraryAdapter.playBoundAudio).toHaveBeenCalledTimes(1);
 await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(presentation.activities[1].prompt));
});
// R6.2/K4: a stored 'waiting' means this screen was heard, so a reload shows what its narration end showed.
it('R6.2/K4: a heard executable screen is Continue with Skip when its narration ends and again after a reload',async()=>{
 firstNarration();await mount();
 const centre=()=>document.querySelector('nav[aria-label="Session controls"] .guide-primary').getAttribute('aria-label');
 const sidePlays=()=>[...document.querySelectorAll('nav[aria-label="Session controls"] button')].map(b=>b.getAttribute('aria-label')).filter(label=>/^Play/.test(label));
 await fireEvent.click(screen.getByRole('button',{name:'Begin',exact:true}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));ended();
 const progress=()=>JSON.parse(localStorage.getItem('fia-v3-progress@1:'+descriptor.id));
 await waitFor(()=>expect(progress().session.status).toBe('waiting'));await waitFor(()=>expect(centre()).toBe('Continue'));
 expect(sidePlays()).toEqual([]);expect(screen.getByRole('button',{name:'Skip to next activity'}).disabled).toBe(false);
 cleanup();await mount();
 expect(centre()).toBe('Continue');expect(sidePlays()).toEqual([]);expect(screen.getByRole('button',{name:'Skip to next activity'}).disabled).toBe(false);
 // Continue moves on; it does not replay the heard narration.
 await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(presentation.activities[1].prompt));
 expect(libraryAdapter.playBoundAudio).toHaveBeenCalledTimes(1);
});
it('server focal display does not infer narration or automatically substitute its related video',async()=>{
 const image=Object.values(presentation.assets).find(a=>a.kind==='image');presentation.activities[0].execution.focalAssetId=image.id;presentation.activities[0].assetId=image.id;
 render(App);await waitFor(()=>expect(document.querySelector('.resource-visual')).toBeTruthy());await fireEvent.click(screen.getByRole('button',{name:'Replay',exact:true}));expect(libraryAdapter.playBoundAudio).not.toHaveBeenCalled();expect(libraryAdapter.prepareOriginal).not.toHaveBeenCalled();expect(audio.play).not.toHaveBeenCalled();expect(document.querySelector('video[src]')).toBeNull();
});

it('manual-mode center Continue advances while bound narration plays instead of pausing',async()=>{
 firstNarration();await mount();await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Settings',exact:true}));await fireEvent.click(screen.getByRole('checkbox',{name:/Automatic guide narration/}));await fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));
 await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await waitFor(()=>expect(audio.play).toHaveBeenCalled());await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(presentation.activities[1].prompt));expect(libraryAdapter.playBoundAudio).toHaveBeenCalledTimes(1);
});
it('restore is read-only while an explicit library choice carries separate demand consent',async()=>{
 vi.spyOn(libraryAdapter,'languages').mockResolvedValue([{id:'eng',name:'English',nativeName:'English',ready:1}]);vi.spyOn(libraryAdapter,'passages').mockResolvedValue([descriptor]);await mount();expect(libraryAdapter.select.mock.calls[0][1].explicit).toBe(false);
 await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Passages',exact:true}));await fireEvent.click(await screen.findByRole('button',{name:'Open passage',exact:true}));
 await waitFor(()=>expect(libraryAdapter.select).toHaveBeenCalledTimes(2));expect(libraryAdapter.select.mock.calls[1][1].explicit).toBe(true);expect(libraryAdapter.select.mock.calls[0][1].signal.aborted).toBe(true);expect(audio.play).not.toHaveBeenCalled();
});
it.each(['current','older-projection','wrong-media','wrong-assets','invalid-snapshot'])('saved executable readiness requires coherent server snapshot and media authority: %s',async condition=>{
 const mediaIdentity={packId:descriptor.id,revision:'b'.repeat(64)},mediaAssetsSha256='c'.repeat(64),pack={...descriptor,mediaIdentity,mediaAssetsSha256};
 const record={revision:descriptor.revision,execution:{mediaIdentity:{...mediaIdentity},mediaAssetsSha256}},serverSnapshot={record},manifest={packId:descriptor.id,presentationRevision:mediaIdentity.revision,deliveryRevision:'delivery',files:[]};
 if(condition==='older-projection')record.revision='d'.repeat(64);if(condition==='wrong-media')manifest.presentationRevision='d'.repeat(64);if(condition==='wrong-assets')record.execution.mediaAssetsSha256='d'.repeat(64);if(condition==='invalid-snapshot')serverSnapshot.invalid=true;
 libraryAdapter.select.mockResolvedValue({descriptor:pack,presentation});libraryAdapter.downloadStatus.mockImplementation(async p=>p.id===pack.id?{saved:true,active:{manifest,serverSnapshot,files:[]}}:{saved:false});
 const network={onLine:true};vi.stubGlobal('navigator',network);await mount();await waitFor(()=>expect(libraryAdapter.mediaStatus).toHaveBeenCalledWith(pack));network.onLine=false;await fireEvent(window,new Event('offline'));
 expect(!!screen.queryByText('Offline · session saved')).toBe(condition==='current');expect(audio.play).not.toHaveBeenCalled();
});

it('actual worker saved status keeps declared JSON inventory separate and is accepted by App',async()=>{
 const f=savedFixture(),w=savedWorker(f);const saved=await w.message({type:'DOWNLOAD_START',selection:'audio',revision:f.record.revision,mediaIdentity:f.record.execution.mediaIdentity,mediaAssetsSha256:f.record.execution.mediaAssetsSha256});expect(saved.ok).toBe(true);
 const status=await w.message({type:'DOWNLOAD_STATUS'});expect(status.active.serverSnapshot.files.length).toBeGreaterThan(0);expect(status.active.files.some(file=>file.path.startsWith('/v1/artifacts/'))).toBe(false);
 const pack={id:f.record.packId,revision:f.record.revision,...f.record.identity,...f.record.execution,capabilities:f.record.capabilities};presentation=JSON.parse(f.bytes);libraryAdapter.select.mockResolvedValue({descriptor:pack,presentation});libraryAdapter.downloadStatus.mockImplementation(async p=>p.id===pack.id?status:{saved:false});
 const network={onLine:true};vi.stubGlobal('navigator',network);render(App);await waitFor(()=>expect(libraryAdapter.mediaStatus).toHaveBeenCalledWith(pack));network.onLine=false;await fireEvent(window,new Event('offline'));expect(screen.getByText('Offline · session saved')).toBeTruthy();expect(audio.play).not.toHaveBeenCalled();
});
it('historical saved passage displays its status and a fresh selection clears it',async()=>{
 const historical={...descriptor,offlineSnapshot:'historical-verified'};libraryAdapter.select.mockResolvedValue({descriptor:historical,presentation});await mount();expect(screen.getByRole('status').textContent).toContain('Using the last verified saved passage while offline.');
 libraryAdapter.select.mockResolvedValue({descriptor,presentation});vi.spyOn(libraryAdapter,'languages').mockResolvedValue([{id:'eng',name:'English',nativeName:'English',ready:1}]);vi.spyOn(libraryAdapter,'passages').mockResolvedValue([descriptor]);await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Passages',exact:true}));await fireEvent.click(await screen.findByRole('button',{name:'Open passage',exact:true}));await waitFor(()=>expect(screen.queryByText('Using the last verified saved passage while offline.')).toBeNull());
});
it('Cancel preparation revokes a pending executable demand and late ready cannot restart playback',async()=>{
 firstNarration('prepare-original');const identity={packId:descriptor.id,presentationRevision:'b'.repeat(64),language:'eng',edition:'fia-guide',quality:'original',activityId:'server-step',sourceUnitId:'server-unit',sourceTextSha256:'c'.repeat(64)};
 let resolve;const pending=new Promise(r=>resolve=r);libraryAdapter.prepareRecording.mockReturnValue(pending);libraryAdapter.prepareOriginal.mockImplementation((reference,context)=>context.prepareNarration(identity,context));
 await mount();await fireEvent.click(screen.getByRole('button',{name:'Begin',exact:true}));await waitFor(()=>expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(1));const signal=libraryAdapter.prepareRecording.mock.calls[0][1];
 await fireEvent.click(screen.getByRole('button',{name:'Cancel preparation',exact:true}));resolve({status:'ready',value:{}});await new Promise(r=>setTimeout(r,0));
 expect(signal.aborted).toBe(true);expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(1);expect(libraryAdapter.prepareOriginal).toHaveBeenCalledTimes(1);expect(libraryAdapter.verifyPreparedRecording).not.toHaveBeenCalled();expect(libraryAdapter.playPreparedRecording).not.toHaveBeenCalled();expect(audio.play).not.toHaveBeenCalled();expect(screen.getByRole('heading',{level:1}).textContent).toBe(presentation.activities[0].prompt);
 let retryReady;libraryAdapter.prepareRecording.mockReturnValue(new Promise(r=>retryReady=r));await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await waitFor(()=>expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(2));await fireEvent.click(screen.getByRole('button',{name:'Cancel preparation',exact:true}));retryReady({status:'ready',value:{}});await new Promise(r=>setTimeout(r,0));expect(libraryAdapter.prepareRecording.mock.calls[1][1].aborted).toBe(true);expect(audio.play).not.toHaveBeenCalled();
 libraryAdapter.prepareRecording.mockResolvedValue({status:'ready',value:{}});await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(3);expect(libraryAdapter.prepareRecording.mock.calls[2][1].aborted).toBe(false);
});
it('carried executable playback suppresses the ready notice and keeps it dismissed by declared identity association (R4.5)',async()=>{
 firstNarration('prepare-original');const identity={packId:descriptor.id,presentationRevision:'b'.repeat(64),language:'eng',edition:'fia-guide',quality:'original',activityId:'server-step',sourceUnitId:'server-unit',sourceTextSha256:'c'.repeat(64)};
 libraryAdapter.prepareOriginal.mockImplementation((reference,context)=>context.prepareNarration(identity,context));
 audio.play.mockImplementation((text,src)=>{audio.active=true;audio.src=src;});
 await mount();await fireEvent.click(screen.getByRole('button',{name:'Begin',exact:true}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));
 expect(screen.queryByText('Recording ready. Press Play to listen.')).toBeNull();
 audio.state({playing:true,src:'blob:unrelated',elapsed:0,duration:2});await new Promise(r=>setTimeout(r,0));expect(screen.queryByText('Recording ready. Press Play to listen.')).toBeNull();
 audio.state({playing:true,src:audio.src,elapsed:0.1,duration:2});await waitFor(()=>expect(screen.queryByText('Recording ready. Press Play to listen.')).toBeNull());
});
it('failed executable prepared playback re-requests and re-verifies on explicit retry',async()=>{
 firstNarration('prepare-original');const identity={packId:descriptor.id,presentationRevision:'b'.repeat(64),language:'eng',edition:'fia-guide',quality:'original',activityId:'server-step',sourceUnitId:'server-unit',sourceTextSha256:'c'.repeat(64)};
 libraryAdapter.prepareOriginal.mockImplementation((reference,context)=>context.prepareNarration(identity,context));libraryAdapter.playPreparedRecording.mockRejectedValueOnce(Error('Recording integrity failed.'));
 await mount();await fireEvent.click(screen.getByRole('button',{name:'Begin',exact:true}));await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Recording integrity failed.'));expect(audio.play).not.toHaveBeenCalled();
 await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));expect(libraryAdapter.prepareRecording).toHaveBeenCalledTimes(2);expect(libraryAdapter.verifyPreparedRecording).toHaveBeenCalledTimes(2);expect(libraryAdapter.prepareRecording.mock.calls[1][0]).toEqual(identity);
});
