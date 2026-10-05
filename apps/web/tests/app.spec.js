import {libraryAdapter,bundledPack} from '../src/lib/library.js';
import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,fireEvent,screen,cleanup,within} from '@testing-library/svelte';
import {tick} from 'svelte';
import App from '../src/App.svelte';
import {createSession} from '../src/lib/engine.js';
import {activities,assets} from '../src/lib/content.js';
let players=[];
class FakeAudio {
 constructor(src){this.src=src;this.paused=true;this.currentTime=0;this.duration=12;players.push(this);}
 play(){this.paused=false;return Promise.resolve();} pause(){this.paused=true;} load(){} removeAttribute(){} end(){this.paused=true;this.onended?.();}
}
it('Pause between recording completion and queued next start revokes the pending session',async()=>{
 vi.useFakeTimers();await startAt('S01-U001');await fireEvent.click(screen.getByRole('button',{name:'Begin',exact:true}));await settle();
 expect(players).toHaveLength(1);players[0].end();await settle();
 await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));await settle();await vi.advanceTimersByTimeAsync(1000);
 expect(players).toHaveLength(1);expect(state().status).toBe('ready');expect(screen.getByRole('button',{name:'Play',exact:true})).toBeTruthy();
});
it('prepared online recording is silent until Play and does not require an offline download',async()=>{
 vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});
 vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({deliveryRevision:'d'.repeat(64),files:[{path:'/audio/source/S01-U001.mp3'}]});
 const request=vi.spyOn(libraryAdapter,'playMedia').mockResolvedValue({bytes:new Uint8Array([1,2,3]).buffer,mime:'audio/ogg',timing:{status:'not-applicable'}});
 vi.stubGlobal('URL',class extends URL{static createObjectURL(){return 'blob:verified-audio';}static revokeObjectURL(){}});
 await startAt('S01-U001');expect(request).not.toHaveBeenCalled();expect(players).toHaveLength(0);
 await fireEvent.click(screen.getByRole('button',{name:'Begin',exact:true}));await settle();await settle();
 expect(request).toHaveBeenCalledTimes(1);expect(request.mock.calls[0][1]).toBe('/audio/source/S01-U001.mp3');expect(players.at(-1).src).toBe('blob:verified-audio');expect(players.at(-1).paused).toBe(false);
});
it('gesture-denied verified audio retries synchronously without fetching again and navigation releases it',async()=>{
 vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});
 vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({deliveryRevision:'d'.repeat(64),files:[{path:'/audio/source/S01-U001.mp3'}]});
 const request=vi.spyOn(libraryAdapter,'playMedia').mockResolvedValue({bytes:new Uint8Array([1]).buffer,mime:'audio/ogg',timing:{status:'not-applicable'}});
 const revoked=vi.fn();vi.stubGlobal('URL',class extends URL{static createObjectURL(){return 'blob:verified-retry';}static revokeObjectURL(url){revoked(url);}});
 const play=vi.spyOn(FakeAudio.prototype,'play').mockRejectedValueOnce(Object.assign(Error('gesture required'),{name:'NotAllowedError'}));
 await startAt('S01-U001');await fireEvent.click(screen.getByRole('button',{name:'Begin',exact:true}));await settle();await settle();
 expect(request).toHaveBeenCalledTimes(1);expect(players).toHaveLength(1);expect(players[0].paused).toBe(true);
 await fireEvent.click(screen.getByRole('button',{name:'Resume',exact:true}));await settle();
 expect(play).toHaveBeenCalledTimes(2);expect(request).toHaveBeenCalledTimes(1);expect(players).toHaveLength(1);expect(players[0].paused).toBe(false);
 await fireEvent.click(screen.getByRole('button',{name:'Skip to next activity'}));await settle();
 expect(players[0].paused).toBe(true);expect(revoked).toHaveBeenCalledWith('blob:verified-retry');
});
it('navigation cancels selected proxy loading and a late response cannot start playback',async()=>{
 vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});
 vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({deliveryRevision:'d'.repeat(64),files:[{path:'/audio/source/S01-U001.mp3'}]});
 let resolve;const request=vi.spyOn(libraryAdapter,'playMedia').mockImplementation(()=>new Promise(r=>resolve=r));
 await startAt('S01-U001');await fireEvent.click(screen.getByRole('button',{name:'Begin',exact:true}));await settle();
 await fireEvent.click(screen.getByRole('button',{name:'Skip to next activity'}));expect(request.mock.calls[0][3].aborted).toBe(true);
 resolve({bytes:new Uint8Array([1]).buffer,mime:'audio/ogg'});await settle();await settle();expect(players).toHaveLength(0);
});
it('verified proxy Scripture keeps logical recording identity and maps codec delay to original cues',async()=>{
 const path=assets['scripture-BereanStandardBible'].descriptionAudio;
 vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});
 vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({deliveryRevision:'d'.repeat(64),files:[{path}]});
 vi.spyOn(libraryAdapter,'playMedia').mockResolvedValue({bytes:new Uint8Array([1]).buffer,mime:'audio/ogg',timing:{status:'verified',mapping:{scale:1,offsetSeconds:.012}}});
 vi.stubGlobal('URL',class extends URL{static createObjectURL(){return 'blob:verified-scripture';}static revokeObjectURL(){}});
 await startAt('S01-U002-reading-1');await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();await settle();
 const player=players.at(-1);expect(player.src).toBe('blob:verified-scripture');const boundary=assets['scripture-BereanStandardBible'].alignment.verses[1].start;player.currentTime=boundary+.006;player.ontimeupdate();await settle();expect(document.querySelectorAll('.scripture-scroll p')[0].getAttribute('aria-current')).toBe('true');
 player.currentTime=boundary+.020;player.ontimeupdate();await settle();expect(document.querySelectorAll('.scripture-scroll p')[1].getAttribute('aria-current')).toBe('true');
});
const settle=async()=>{await Promise.resolve();await tick();};
async function startAt(id,status='ready',prefs={}){const session=createSession(activities);session.index=activities.findIndex(a=>a.id===id);session.status=status;Object.assign(session.preferences,prefs);localStorage.setItem('fia-v3-session@2',JSON.stringify({session}));render(App);await settle();await settle();await settle();}
const originalRelated=assets.a112.relatedIds;
const state=()=>JSON.parse(localStorage.getItem('fia-v3-session@2')).session;
async function command(text){const kind=text==='watch the video'?'video':'map';const resource=Object.values(assets).find(a=>a.kind===kind);await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Passage resources'}));await fireEvent.click(within(screen.getByText(kind==='video'?'Videos':'Maps',{selector:'summary'}).parentElement).getByRole('button',{name:resource.subtitle||resource.title,exact:true}));await settle();if(kind==='video'){await fireEvent.click(screen.getByRole('button',{name:'Play video',exact:true}));await settle();}}

async function toggleDescriptions(){await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Settings',exact:true}));await fireEvent.click(screen.getByRole('checkbox',{name:/Describe images and maps/}));await fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));await settle();}
async function linkedVideo(){await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Settings',exact:true}));await fireEvent.click(screen.getByRole('button',{name:'Play video: Jordan River'}));await settle();}
beforeEach(()=>{vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:true,active:{manifest:{presentationRevision:bundledPack.revision},files:[...activities.map(a=>a.audioSrc),...Object.values(assets).flatMap(a=>[a.src,a.poster,a.descriptionAudio])].filter(Boolean).map(path=>({path}))}});vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});localStorage.clear();players=[];vi.stubGlobal('Audio',FakeAudio);HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};HTMLMediaElement.prototype.pause=vi.fn(function(){this.dispatchEvent(new Event('pause'));});HTMLMediaElement.prototype.play=vi.fn(function(){this.dispatchEvent(new Event('play'));return Promise.resolve();});Element.prototype.scrollTo=vi.fn();});
afterEach(()=>{assets.a112.relatedIds=originalRelated;delete document.modelContext;cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
describe('authentic FIA flow',()=>{
 it('keeps navigation discoverable without exposing the resource menus',async()=>{assets.a112.relatedIds=[];await startAt('S02-U005');expect(screen.getByRole('button',{name:'Previous activity'})).toBeTruthy();expect(screen.getByRole('button',{name:'Skip to next activity'})).toBeTruthy();expect(screen.queryByRole('progressbar')).toBeNull();expect(screen.getByRole('button',{name:/^Open .* full screen$/})).toBeTruthy();await fireEvent.click(screen.getByRole('button',{name:'More options'}));expect(screen.queryByRole('button',{name:'Show content tools'})).toBeNull();await fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));expect(screen.getByRole('button',{name:/^Open .* full screen$/})).toBeTruthy();});
 it('reads three actual translations and returns to the authored question',async()=>{vi.useFakeTimers();await startAt('S01-U002');await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();expect(players.at(-1).src).toBe('/audio/source/S01-U002.mp3');players.at(-1).end();await settle();for(const id of ['scripture-BereanStandardBible','scripture-unfoldingWordLiteral','scripture-unfoldingWordSimplified']){expect(screen.getByText(assets[id].subtitle)).toBeTruthy();await vi.advanceTimersByTimeAsync(700);expect(players.at(-1).src).toBe(assets[id].descriptionAudio);players.at(-1).end();await settle();}expect(screen.getByRole('heading',{name:'What do you like in this passage?'})).toBeTruthy();});
 it('holds the image, then presents the required map before the next guide unit',async()=>{vi.useFakeTimers();assets.a112.relatedIds=[];await startAt('S02-U005');await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();players.at(-1).end();await settle();expect(screen.getByRole('button',{name:'Continue',exact:true})).toBeTruthy();await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await settle();expect(document.querySelector('.media-stage').dataset.kind).toBe('map');expect(state().status).toBe('waiting');await vi.advanceTimersByTimeAsync(2000);expect(activities[state().index].id).toBe('S02-U005-resource-c197');await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));expect(activities[state().index].id).toBe('S02-U006');});
 it('pause/resume keeps the same source recording and position',async()=>{assets.a112.relatedIds=[];await startAt('S02-U005');await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();const player=players.at(-1);player.currentTime=6;await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));await fireEvent.click(screen.getByRole('button',{name:'Resume',exact:true}));await settle();expect(players).toHaveLength(1);expect(player.currentTime).toBe(6);expect(activities[state().index].id).toBe('S02-U005');});
 it('a map detour returns to the held discussion',async()=>{await startAt('S01-U003','waiting');await command('show the map');expect(document.querySelector('.media-stage').dataset.kind).toBe('map');await fireEvent.click(screen.getByRole('button',{name:'Return to guide',exact:true}));expect(screen.getByRole('heading',{name:'What do you like in this passage?'})).toBeTruthy();expect(state().status).toBe('waiting');});
 it('explicit replay reads even when automatic Scripture reading is disabled',async()=>{await startAt('S01-U002-reading-1','ready',{readScripture:false});await fireEvent.click(screen.getByRole('button',{name:'Replay',exact:true}));await settle();expect(players.at(-1).src).toBe(assets['scripture-BereanStandardBible'].descriptionAudio);});
 it('optional video plays, pauses, and returns to its held guide point',async()=>{assets.a112.relatedIds=[];await startAt('S02-U005','waiting');await command('watch the video');await settle();expect(screen.getByRole('button',{name:'Pause',exact:true})).toBeTruthy();await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));await settle();expect(screen.getByRole('button',{name:'Play video',exact:true})).toBeTruthy();await fireEvent.ended(document.querySelector('video'));await settle();expect(state().detour).toBeNull();expect(state().status).toBe('waiting');expect(activities[state().index].id).toBe('S02-U005');});
 it('restores progress without autoplay and opening preferences retains the source unit',async()=>{await startAt('S03-U007','playing');expect(players).toHaveLength(0);await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Settings'}));expect(activities[state().index].id).toBe('S03-U007');expect(players).toHaveLength(0);});
 it('in-page tools accept approved optional resources and reject unknown or stale completions',async()=>{const tools=new Map();document.modelContext={registerTool:tool=>tools.set(tool.name,tool)};assets.a112.relatedIds=[];await startAt('S02-U005','waiting');await expect(tools.get('fia_present_resource').execute({assetId:'unknown'})).rejects.toThrow();await tools.get('fia_present_resource').execute({assetId:'a184'});expect(state().detour).toBe('a184');await expect(tools.get('fia_complete_activity').execute({activityId:'S02-U005'})).rejects.toThrow();await tools.get('fia_return_to_guide').execute({});await tools.get('fia_complete_activity').execute({activityId:'S02-U005'});expect(activities[state().index].id).toBe('S02-U005-resource-c197');});
});
it('term recording pause/resume returns to waiting rather than completing discussion',async()=>{
 const activity=activities.find(a=>assets[a.assetId]?.kind==='term'&&a.audioSrc);await startAt(activity.id);await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();players.at(-1).end();await settle();expect(players).toHaveLength(1);await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await settle();expect(players.at(-1).src).toBe(assets[activity.assetId].descriptionAudio);await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));await fireEvent.click(screen.getByRole('button',{name:'Resume',exact:true}));await settle();players.at(-1).end();await settle();expect(state().status).toBe('waiting');expect(screen.getByRole('button',{name:'Continue',exact:true})).toBeTruthy();
});
it('routes the active Scripture recording clock into its aligned verse presentation',async()=>{
 await startAt('S01-U002-reading-1');await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();
 const source=assets['scripture-BereanStandardBible'];const player=players.at(-1);player.currentTime=source.alignment.verses[7].words[2].start;player.ontimeupdate();await settle();
 expect(document.querySelector('p[aria-current=true]').textContent).toContain(source.verses[7].text);
 await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));await settle();expect(document.querySelector('p[aria-current=true]').textContent).toContain(source.verses[7].text);
 await command('show the map');expect(document.querySelector('p[aria-current=true]')).toBeNull();
});
it('guide text shares the reading viewport and transport has accessible icon-only controls',async()=>{
 await startAt('S02-U004');expect(screen.getByRole('region',{name:'Guide text'})).toBeTruthy();
 const nav=screen.getByRole('navigation',{name:'Session controls'});expect(nav.textContent.trim()).toBe('');
 expect(screen.getByRole('button',{name:'Previous activity'})).toBeTruthy();expect(screen.getByRole('button',{name:'Skip to next activity'})).toBeTruthy();expect(screen.getByRole('button',{name:'Play',exact:true})).toBeTruthy();
});
it('enabled visual descriptions replace the viewing-pause cue and then hold the discussion',async()=>{
 assets.a112.relatedIds=[];await startAt('S02-U005','ready',{describeImages:true});await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();
 expect(players).toHaveLength(1);
 expect(players.at(-1).src).toBe(assets.a112.descriptionAudio);players.at(-1).end();await settle();expect(state().status).toBe('waiting');expect(activities[state().index].id).toBe('S02-U005');
});
it('disabled visual descriptions leave FIA narration intact without playing generated description',async()=>{
 assets.a112.relatedIds=[];await startAt('S02-U005','ready',{describeImages:false});await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();players.at(-1).end();await settle();expect(players).toHaveLength(1);expect(players[0].src).toBe('/audio/source/S02-U005.mp3');expect(state().status).toBe('waiting');
});
it('visual toggle queues description behind active FIA and disabling stops only the description',async()=>{
 assets.a112.relatedIds=[];await startAt('S02-U005');await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();
 await toggleDescriptions();expect(state().preferences.describeImages).toBe(true);expect(players).toHaveLength(1);expect(players[0].paused).toBe(false);
 players[0].end();await settle();const description=players.at(-1);expect(description.src).toBe(assets.a112.descriptionAudio);await toggleDescriptions();expect(description.paused).toBe(true);expect(state().preferences.describeImages).toBe(false);expect(state().status).toBe('waiting');
});
it('settings share one preference without granting playback; explicit Play reads the visual',async()=>{
 assets.a112.relatedIds=[];await startAt('S02-U005','waiting');await toggleDescriptions();await settle();expect(players).toHaveLength(0);await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();expect(players.at(-1).src).toBe(assets.a112.descriptionAudio);
 await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Settings',exact:true}));const setting=screen.getByRole('checkbox',{name:/Describe images and maps/});expect(setting.checked).toBe(true);await fireEvent.click(setting);await settle();expect(state().preferences.describeImages).toBe(false);expect(players.at(-1).paused).toBe(true);
 await fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));expect(screen.queryByRole('button',{name:'Image and map descriptions'})).toBeNull();
});
it('full-screen image overlay leaves the current description uninterrupted',async()=>{
 assets.a112.relatedIds=[];await startAt('S02-U005','ready',{describeImages:true});await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();const guide=players.at(-1);guide.currentTime=4;await fireEvent.wheel(screen.getByRole('button',{name:/^Open .* full screen$/}),{deltaY:-100});
 await settle();expect(screen.getByRole('dialog',{name:'Jordan River full screen'})).toBeTruthy();expect(guide.paused).toBe(false);expect(guide.currentTime).toBe(4);expect(players).toHaveLength(1);
 await fireEvent.keyDown(screen.getByRole('region',{name:'Explore Jordan River'}),{key:'+'});expect(screen.getByRole('dialog').querySelector('img').style.transform).toContain('scale(1.5)');
 const description=players.at(-1);expect(description.src).toBe(assets.a112.descriptionAudio);expect(description.paused).toBe(false);
 await fireEvent.click(screen.getByRole('button',{name:'Close full screen'}));await settle();expect(screen.queryByRole('dialog')).toBeNull();expect(description.paused).toBe(false);expect(document.querySelector('.visual-viewport img').style.transform).toContain('scale(1)');expect(activities[state().index].id).toBe('S02-U005');
});
it('full-screen map preserves paused audio and the guide place',async()=>{
 await startAt('S03-U007');await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();const player=players.at(-1);await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));await settle();await fireEvent.click(screen.getByRole('button',{name:/^Open .* full screen$/}));await settle();
 expect(player.paused).toBe(true);expect(players).toHaveLength(1);
 await fireEvent(screen.getByRole('dialog'),new Event('cancel',{cancelable:true}));await settle();expect(screen.queryByRole('dialog')).toBeNull();expect(player.paused).toBe(true);expect(activities[state().index].id).toBe('S03-U007');

});

it.each([['S03-U009','S03-U017'],['S04-U004','S04-U012']])('keeps the %s character roster on one page through every original recording',async(id,next)=>{
 vi.useFakeTimers();await startAt(id);
 const list=screen.getByRole('list');expect(screen.getAllByRole('listitem')).toHaveLength(7);
 const members=activities.filter(a=>a.readingGroupId===id);
 await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();
 for(const [index,member] of members.entries()){
  expect(players.at(-1).src).toBe(member.audioSrc);expect(screen.getByRole('list')).toBe(list);
  if(index===3){
   const recording=players.at(-1);recording.currentTime=2;
   await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));await settle();
   expect(recording.paused).toBe(true);
   await fireEvent.click(screen.getByRole('button',{name:'Resume',exact:true}));await settle();
   expect(recording.currentTime).toBe(2);expect(recording.paused).toBe(false);
  }
  players.at(-1).end();await settle();
  if(index<members.length-1)await vi.advanceTimersByTimeAsync(700);
 }
 expect(activities[state().index].id).toBe(next);expect(screen.queryByRole('list')).toBeNull();
});
it('restores a saved mid-list position with the whole list, and skip/back cross the list as a page',async()=>{
 await startAt('S04-U008','paused');expect(screen.getAllByRole('listitem')).toHaveLength(7);
 await fireEvent.click(screen.getByRole('button',{name:'Skip to next activity'}));await settle();
 expect(activities[state().index].id).toBe('S04-U012');
 await fireEvent.click(screen.getByRole('button',{name:'Previous activity'}));await settle();
 expect(activities[state().index].id).toBe('S04-U004');expect(screen.getAllByRole('listitem')).toHaveLength(7);
 await fireEvent.click(screen.getByRole('button',{name:'Previous activity'}));await settle();
 expect(activities[state().index].id).toBe('S04-U003');
});

it('reads the prophet explanation together then preserves its glossary discussion pause',async()=>{
 vi.useFakeTimers();await startAt('S05-U009');
 const list=screen.getByRole('list');expect(screen.getAllByRole('listitem')).toHaveLength(3);
 await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();
 for(const member of activities.filter(a=>a.readingGroupId==='S05-U009')){
  expect(players.at(-1).src).toBe(member.audioSrc);expect(screen.getByRole('list')).toBe(list);
  players.at(-1).end();await settle();await vi.advanceTimersByTimeAsync(700);
 }
 expect(activities[state().index].id).toBe('S05-U013');
 players.at(-1).end();await settle();await vi.advanceTimersByTimeAsync(700);
 expect(activities[state().index].id).toBe('S05-U013');expect(state().status).toBe('waiting');
});
it('discussion list questions each wait for confirmation and show separately',async()=>{
 vi.useFakeTimers();await startAt('S01-U003');
 expect(screen.queryByRole('list')).toBeNull();
 await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();players.at(-1).end();await settle();await vi.advanceTimersByTimeAsync(1000);
 expect(activities[state().index].id).toBe('S01-U003');expect(state().status).toBe('waiting');
 await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await settle();
 expect(activities[state().index].id).toBe('S01-U004');expect(screen.queryByRole('list')).toBeNull();
});

it('section boundaries hold a title transition and Continue reads the first instruction without skipping',async()=>{
 vi.useFakeTimers();const last=activities.filter(a=>a.sectionId==='S01').at(-1);await startAt(last.id,'waiting');
 await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await settle();await vi.advanceTimersByTimeAsync(1000);
 expect(screen.getByRole('heading',{name:'Setting the Stage'})).toBeTruthy();
 expect(activities[state().index].id).toBe('S02-U001');expect(players).toHaveLength(0);
 await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await settle();
 expect(players).toHaveLength(0);await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();expect(players.at(-1).src).toBe('/audio/source/S02-U001.mp3');
 players.at(-1).end();await settle();await vi.advanceTimersByTimeAsync(700);
 expect(activities[state().index].kind).toBe('scripture');
});
it('the visual overview selects a section without marking prior content complete and skip enters its first screen',async()=>{
 await startAt('S03-U009');
 await fireEvent.click(screen.getByRole('button',{name:'Session progress: open section overview'}));
 await fireEvent.click(screen.getByRole('button',{name:'Filling the Gaps',exact:true}));await settle();
 expect(screen.getByRole('heading',{name:'Filling the Gaps'})).toBeTruthy();expect(state().completed).toEqual([]);
 await fireEvent.click(screen.getByRole('button',{name:'Skip to next activity'}));await settle();
 expect(activities[state().index].id).toBe('S05-U001');expect(players).toHaveLength(0);await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();expect(players.at(-1).src).toBe('/audio/source/S05-U001.mp3');
});
it('dark colors persist without changing the primary control or interrupting narration',async()=>{
 assets.a112.relatedIds=[];await startAt('S02-U005');await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();const player=players.at(-1);player.currentTime=4;
 const primary=document.querySelector('.guide-primary'),disc=primary.querySelector('.primary-disc');
 await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Settings'}));
 await fireEvent.click(screen.getByRole('checkbox',{name:/Dark theme/}));await settle();
 expect(document.documentElement.dataset.theme).toBe('dark');expect(JSON.parse(localStorage.getItem('fia-v3-session@2')).dark).toBe(true);
 expect(document.querySelector('.guide-primary')).toBe(primary);expect(primary.querySelector('.primary-disc')).toBe(disc);
 expect(player.paused).toBe(false);expect(player.currentTime).toBe(4);
 cleanup();render(App);await settle();expect(document.documentElement.dataset.theme).toBe('dark');
});
it('the mini map exposes every visible screen and jumps directly to a chosen image without a section detour',async()=>{
 await startAt('S01-U003');await fireEvent.click(screen.getByRole('button',{name:'Session progress: open section overview'}));
 expect(document.querySelectorAll('.progress-map-item')).toHaveLength(111);
 expect(document.querySelector('dialog.glass-sheet')).toBeTruthy();
 for(const title of ['Hear and Heart','Setting the Stage','Defining the Scenes','Embodying the Text','Filling the Gaps','Speaking the Word'])expect(screen.getByRole('heading',{name:title})).toBeTruthy();
 const image=document.querySelector('.progress-map-item img');
 const button=image.closest('button');const label=button.getAttribute('aria-label');
 await fireEvent.click(button);await settle();
 expect(screen.queryByRole('region',{name:'New section'})).toBeNull();
 expect(document.querySelector('.section-transition')).toBeNull();
 expect(activities[state().index].assetId).toBeTruthy();
 expect(state().completed).toEqual([]);expect(players).toHaveLength(0);
 expect(label).toContain('Setting the Stage');
 expect(screen.getByRole('button',{name:/^Open .* full screen$/})).toBeTruthy();
});


it.each(activities.filter(a=>assets[a.assetId]?.kind==='term'&&a.audioSrc).map(a=>[a.id]))('term %s shows and holds the discussion instruction before its definition',async(id)=>{
 vi.useFakeTimers();const activity=activities.find(a=>a.id===id);await startAt(id);
 expect(screen.getByRole('region',{name:'Guide text'}).textContent).toContain(activity.narration);
 await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();
 expect(players.at(-1).src).toBe(activity.audioSrc);players.at(-1).end();await settle();await vi.advanceTimersByTimeAsync(2000);
 expect(players).toHaveLength(1);expect(state().status).toBe('waiting');expect(activities[state().index].id).toBe(id);
 expect(screen.getByRole('region',{name:'Guide text'}).textContent).toContain(activity.narration);
 await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await settle();
 expect(players.at(-1).src).toBe(assets[activity.assetId].descriptionAudio);
 expect(screen.getByRole('region',{name:'Guide text'}).textContent).toContain(assets[activity.assetId].description);
 players.at(-1).end();await settle();await vi.advanceTimersByTimeAsync(2000);
 expect(activities[state().index].id).toBe(id);expect(state().status).toBe('waiting');
 await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await settle();expect(activities[state().index].id).not.toBe(id);
});
it('restores a term definition without replaying its instruction and returns to the instruction on revisit',async()=>{
 await startAt('S05-U004','waiting');
 await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await settle();cleanup();render(App);await settle();
 expect(screen.getByRole('region',{name:'Guide text'}).textContent).toContain(assets['eng-t60-v1'].description);
 await fireEvent.click(screen.getByRole('button',{name:'Skip to next activity'}));await fireEvent.click(screen.getByRole('button',{name:'Previous activity'}));await settle();
 expect(screen.getByRole('region',{name:'Guide text'}).textContent).toContain('Stop here and discuss');
});

it.each(['term','image','map','video'])('%s resources show their title and source without opening tools',async(kind)=>{
 const resource=Object.values(assets).find(a=>a.kind===kind);
 const tools=new Map();document.modelContext={registerTool:tool=>tools.set(tool.name,tool)};
 await startAt('S01-U003');await tools.get('fia_present_resource').execute({assetId:resource.id});await settle();
 const label={term:'Key term',image:'Image',map:'Map',video:'Video'}[kind];
 const header=screen.getByRole('group',{name:label+' source'});
 expect(header.textContent).toContain(resource.title);
 expect(header.textContent).toContain(resource.source.replace('Familiarization, Internalization, Articulation (FIA)','FIA'));
 if(['image','map'].includes(kind)){
  await fireEvent.click(screen.getByRole('button',{name:/^Open .* full screen$/}));await settle();
  expect(screen.getByRole('dialog').querySelector('.reading-identification').textContent).toContain(resource.title);
 }
});

it('linked video stays in the image step through pause, resume, completion, and next',async()=>{
 await startAt('S02-U005','waiting');
 await linkedVideo();await settle();
 expect(screen.getByRole('button',{name:'Pause',exact:true})).toBeTruthy();
 expect(state().detour).toBeNull();
 const video=document.querySelector('video');video.currentTime=12;
 await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));await settle();
 expect(screen.getByRole('button',{name:'Skip to next activity'}).disabled).toBe(false);
 await fireEvent.click(screen.getByRole('button',{name:'Resume',exact:true}));await settle();
 expect(document.querySelector('video')).toBe(video);
 expect(video.currentTime).toBe(12);
 expect(activities[state().index].id).toBe('S02-U005');
 await fireEvent.ended(document.querySelector('video'));await settle();
 expect(document.querySelector('.media-stage').dataset.kind).toBe('image');
 expect(activities[state().index].id).toBe('S02-U005');
 await linkedVideo();await settle();
 HTMLMediaElement.prototype.pause=vi.fn();
 await fireEvent.click(screen.getByRole('button',{name:'Skip to next activity',exact:true}));await settle();
 expect(screen.queryByRole('button',{name:'Pause',exact:true})).toBeNull();
 expect(activities[state().index].id).not.toBe('S02-U005');
 expect(state().detour).toBeNull();
});

it('approved linked video takes priority over generated description on the easy button',async()=>{
 await startAt('S02-U005','waiting',{describeImages:true});
 await fireEvent.click(screen.getByRole('button',{name:'Play video',exact:true}));await settle();
 expect(document.querySelector('video').getAttribute('src')).toBe(assets.a13.src);
 expect(players).toHaveLength(0);
 await fireEvent.ended(document.querySelector('video'));await settle();
 expect(screen.getByRole('button',{name:'Continue',exact:true})).toBeTruthy();
});

it.each(['S02-U005','S03-U019','S05-U015'])('plays the approved video without the viewing-pause cue at %s',async(id)=>{
 await startAt(id);await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();
 expect(players).toHaveLength(0);expect(document.querySelector('video')).toBeTruthy();expect(state().detour).toBeNull();
});
it.each(['S03-U007','S03-U021'])('uses the map description instead of the viewing-pause cue at %s',async(id)=>{
 await startAt(id,'ready',{describeImages:true});await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();
 expect(players).toHaveLength(1);expect(players[0].src).toBe(assets[activities[state().index].assetId].descriptionAudio);
});

it('keeps the image over a loading video until a frame is available',async()=>{
 await startAt('S02-U005');await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();
 const video=document.querySelector('video');
 expect(document.querySelector('.video-loading-poster').getAttribute('src')).toBe(assets.a112.src);
 await fireEvent.play(video);await settle();expect(document.querySelector('.video-loading-poster')).toBeTruthy();
 await fireEvent.loadedData(video);await settle();expect(document.querySelector('.video-loading-poster')).toBeNull();
});

it('changes credit with the visible media and replays the completed matching video',async()=>{
 await startAt('S02-U005');await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();
 const credit=()=>document.querySelector('.visual-identification').textContent;
 expect(credit()).toContain('FIA Images');
 await fireEvent.loadedData(document.querySelector('video'));await settle();expect(credit()).toContain('FIA Videos');
 await fireEvent.ended(document.querySelector('video'));await settle();expect(credit()).toContain('FIA Images');
 await fireEvent.click(screen.getByRole('button',{name:'Replay',exact:true}));await settle();
 expect(document.querySelector('video').getAttribute('src')).toBe(assets.a13.src);expect(players).toHaveLength(0);
 expect(credit()).toContain('FIA Images');
 await fireEvent.loadedData(document.querySelector('video'));await settle();expect(credit()).toContain('FIA Videos');
});

it('video clock drives the ring through pause, seek, replay, and completion',async()=>{
 await startAt('S02-U005');await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();
 const video=document.querySelector('video');Object.defineProperty(video,'duration',{value:40,configurable:true});
 const offset=()=>Number(document.querySelector('.playback-arc').getAttribute('stroke-dashoffset'));
 const full=2*Math.PI*45.5;
 await fireEvent.loadedMetadata(video);video.currentTime=10;await fireEvent.timeUpdate(video);await settle();expect(offset()).toBeCloseTo(full*.75);
 await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));await settle();expect(offset()).toBeCloseTo(full*.75);
 video.currentTime=20;await fireEvent.seeked(video);await settle();expect(offset()).toBeCloseTo(full*.5);
 await fireEvent.click(screen.getByRole('button',{name:'Replay',exact:true}));await settle();expect(offset()).toBeCloseTo(full);expect(video.currentTime).toBe(0);
 video.currentTime=30;await fireEvent.timeUpdate(video);await settle();expect(offset()).toBeCloseTo(full*.25);
 await fireEvent.ended(video);await settle();expect(offset()).toBeCloseTo(full);
});

it('phone rotation makes visuals immersive without remounting the playing video',async()=>{
 let rotate;const query={matches:false,addEventListener:(_,fn)=>rotate=fn,removeEventListener:vi.fn()};
 const prior=window.matchMedia;window.matchMedia=vi.fn(()=>query);
 try{
 await startAt('S02-U005');await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();
 const video=document.querySelector('video');video.currentTime=15;
 query.matches=true;rotate();await settle();expect(document.querySelector('main').classList.contains('immersive')).toBe(true);
 expect(document.querySelector('video')).toBe(video);expect(video.currentTime).toBe(15);
 await fireEvent.click(screen.getByRole('button',{name:'Pause video',exact:true}));await settle();
 expect(screen.getByRole('button',{name:'Play video',exact:true})).toBeTruthy();
 query.matches=false;rotate();await settle();expect(document.querySelector('main').classList.contains('immersive')).toBe(false);expect(document.querySelector('video')).toBe(video);
 }finally{window.matchMedia=prior;}
});

it('manual listening keeps Continue central and supports play pause resume and replay',async()=>{
 await startAt('S02-U004');
 await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Settings'}));
 await fireEvent.click(screen.getByRole('checkbox',{name:/Automatic guide narration/}));await fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));
 expect(screen.getByRole('button',{name:'Continue',exact:true}).classList.contains('guide-primary')).toBe(true);
 await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();const audio=players.at(-1);audio.currentTime=5;
 await fireEvent.click(screen.getByRole('button',{name:'Pause',exact:true}));await settle();
 await fireEvent.click(screen.getByRole('button',{name:'Resume',exact:true}));await settle();expect(players.at(-1)).toBe(audio);expect(audio.currentTime).toBe(5);
 audio.end();await settle();expect(activities[state().index].id).toBe('S02-U004');
 await fireEvent.click(screen.getByRole('button',{name:'Replay',exact:true}));await settle();expect(players.at(-1)).not.toBe(audio);
 await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await settle();expect(activities[state().index].id).not.toBe('S02-U004');expect(players.at(-1).paused).toBe(true);
});

it('shows both language counts without changing the active saved place',async()=>{
 vi.spyOn(libraryAdapter,'languages').mockResolvedValue([{id:'eng',nativeName:'English',ready:68},{id:'spa',nativeName:'Español',ready:68}]);
 vi.spyOn(libraryAdapter,'passages').mockResolvedValue([]);
 await startAt('S03-U007','waiting');await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:/^Language/}));await settle();
 expect(screen.getByRole('button',{name:/English.*68 passages with text available/})).toBeTruthy();await fireEvent.click(screen.getByRole('button',{name:/Español/}));await settle();
 expect(screen.queryByText(/No Spanish passage is ready/)).toBeNull();expect(activities[state().index].id).toBe('S03-U007');expect(players).toHaveLength(0);
});
it('consolidates settings and explicit Scripture Play overrides its automatic setting',async()=>{
 await startAt('S01-U002-reading-1','ready',{readScripture:false});await fireEvent.click(screen.getByRole('button',{name:'More options'}));
 expect(screen.queryByRole('button',{name:'Media settings'})).toBeNull();expect(screen.queryByRole('button',{name:'Preferences'})).toBeNull();await fireEvent.click(screen.getByRole('button',{name:'Settings'}));
 expect(screen.getByRole('heading',{name:'Listening'})).toBeTruthy();expect(screen.getByRole('heading',{name:'Appearance'})).toBeTruthy();expect(screen.getByRole('checkbox',{name:/Automatic Scripture reading/}).checked).toBe(false);
 await fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();expect(players.at(-1).src).toBe(assets['scripture-BereanStandardBible'].descriptionAudio);expect(state().preferences.readScripture).toBe(false);
});
it('automatic Scripture reading is independent of automatic guide narration',async()=>{
 vi.useFakeTimers();const session=createSession(activities);session.index=activities.findIndex(a=>a.id==='S01-U002');localStorage.setItem('fia-v3-session@2',JSON.stringify({session,muted:true}));render(App);await settle();await settle();await settle();
 await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await vi.advanceTimersByTimeAsync(700);await settle();expect(players).toHaveLength(0);await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();expect(players.at(-1).src).toBe(assets['scripture-BereanStandardBible'].descriptionAudio);expect(JSON.parse(localStorage.getItem('fia-v3-session@2')).muted).toBe(true);
});

function preparedVisuals(){
 vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});
 const visuals=Object.values(assets).filter(a=>['image','map'].includes(a.kind));
 vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({deliveryRevision:'d'.repeat(64),files:visuals.map(a=>({path:a.src}))});
 let serial=0;vi.stubGlobal('URL',class extends URL{static createObjectURL(){return `blob:visual-${++serial}`;}static revokeObjectURL(){}});
 return visuals;
}
it('restored prepared image stays silent, then View loads it without an offline download',async()=>{
 const visuals=preparedVisuals(),image=visuals.find(a=>a.kind==='image');const target=activities.find(a=>a.assetId===image.id);
 const request=vi.spyOn(libraryAdapter,'playMedia').mockResolvedValue({bytes:new Uint8Array([1]).buffer,mime:'image/webp'});
 await startAt(target.id);expect(request).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'View image'})).toBeTruthy();
 await fireEvent.click(screen.getByRole('button',{name:'View image'}));await settle();await settle();
 expect(request).toHaveBeenCalledTimes(1);expect(request.mock.calls[0][1]).toBe(image.src);expect(document.querySelector('.visual-viewport img').src).toContain('blob:visual-1');
});
it('explicit resource selection loads current map without a second View action',async()=>{
 const map=preparedVisuals().find(a=>a.kind==='map');const request=vi.spyOn(libraryAdapter,'playMedia').mockResolvedValue({bytes:new Uint8Array([1]).buffer,mime:'image/webp'});
 await startAt('S01-U001');await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Passage resources',exact:true}));
 const button=within(screen.getByRole('dialog')).getByRole('button',{name:map.subtitle||map.title,exact:false});await fireEvent.click(button);await settle();await settle();
 expect(request).toHaveBeenCalledTimes(1);expect(request.mock.calls[0][1]).toBe(map.src);expect(document.querySelector('.visual-viewport img').src).toContain('blob:visual-1');
});
it('canceling an unfinished visual prevents late response from mounting',async()=>{
 const image=preparedVisuals().find(a=>a.kind==='image');const target=activities.find(a=>a.assetId===image.id);let finish;
 const request=vi.spyOn(libraryAdapter,'playMedia').mockImplementation(()=>new Promise(r=>finish=r));await startAt(target.id);
 await fireEvent.click(screen.getByRole('button',{name:'View image'}));await settle();await fireEvent.click(screen.getByRole('button',{name:'Cancel loading'}));
 expect(request.mock.calls[0][3].aborted).toBe(true);finish({bytes:new Uint8Array([1]).buffer,mime:'image/webp'});await settle();expect(document.querySelector('.visual-viewport img')).toBeNull();expect(screen.getByRole('button',{name:'View image'})).toBeTruthy();
});
it('all eight prepared visuals use the same explicit resource resolver without offline readiness',async()=>{
 const visuals=preparedVisuals(),tools=new Map();document.modelContext={registerTool:tool=>tools.set(tool.name,tool)};
 const request=vi.spyOn(libraryAdapter,'playMedia').mockResolvedValue({bytes:new Uint8Array([1]).buffer,mime:'image/webp'});
 await startAt('S01-U001');expect(visuals).toHaveLength(8);
 for(const visual of visuals){await tools.get('fia_present_resource').execute({assetId:visual.id});await settle();expect(document.querySelector('.visual-viewport img')).not.toBeNull();expect(request.mock.calls.at(-1)[1]).toBe(visual.src);}
 expect(request).toHaveBeenCalledTimes(8);expect(localStorage.getItem('fia-v3-offline')).toBeNull();
});
it('active guide transition loads its current image while keeping recording ownership separate',async()=>{
 const visuals=preparedVisuals(),before=activities.find(a=>a.id==='S02-U004');
 vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({deliveryRevision:'d'.repeat(64),files:[...visuals.map(a=>({path:a.src})),{path:before.audioSrc}]});
 const request=vi.spyOn(libraryAdapter,'playMedia').mockImplementation(async(_pack,path)=>({bytes:new Uint8Array([1]).buffer,mime:path===before.audioSrc?'audio/ogg':'image/webp'}));
 await startAt(before.id);expect(request).not.toHaveBeenCalled();await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();await settle();
 const player=players.at(-1);expect(player.paused).toBe(false);player.end();await settle();await settle();
 expect(activities[state().index].id).toBe('S02-U005');expect(request.mock.calls.map(c=>c[1])).toEqual([before.audioSrc,assets.a112.src]);expect(document.querySelector('.visual-viewport img')).not.toBeNull();
});
it('explicit navigation to an image with no recording loads it, but late previous visual cannot replace a new detour',async()=>{
 const visuals=preparedVisuals(),tools=new Map();document.modelContext={registerTool:tool=>tools.set(tool.name,tool)};const pending=[];
 const request=vi.spyOn(libraryAdapter,'playMedia').mockImplementation((_pack,path,_revision,signal)=>new Promise(resolve=>pending.push({path,signal,resolve})));
 await startAt('S02-U004');await tools.get('fia_complete_activity').execute({activityId:'S02-U004'});await settle();expect(pending[0].path).toBe(assets.a112.src);
 const next=visuals.find(v=>v.src!==assets.a112.src);await tools.get('fia_present_resource').execute({assetId:next.id});await settle();expect(pending[0].signal.aborted).toBe(true);
 pending[1].resolve({bytes:new Uint8Array([1]).buffer,mime:'image/webp'});await settle();const url=document.querySelector('.visual-viewport img').src;
 pending[0].resolve({bytes:new Uint8Array([2]).buffer,mime:'image/webp'});await settle();expect(document.querySelector('.visual-viewport img').src).toBe(url);expect(request).toHaveBeenCalledTimes(2);
});

it('failed visual waits for explicit retry despite an unrelated session preference update',async()=>{
 const image=preparedVisuals().find(a=>a.kind==='image'),target=activities.find(a=>a.assetId===image.id);
 const request=vi.spyOn(libraryAdapter,'playMedia').mockRejectedValueOnce(Error('Verification failed')).mockResolvedValue({bytes:new Uint8Array([1]).buffer,mime:'image/webp'});
 await startAt(target.id);await fireEvent.click(screen.getByRole('button',{name:'View image'}));await settle();expect(request).toHaveBeenCalledTimes(1);
 await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Settings',exact:true}));await fireEvent.click(screen.getByRole('checkbox',{name:/Automatic Scripture reading/}));await fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));await settle();expect(request).toHaveBeenCalledTimes(1);
 await fireEvent.click(screen.getByRole('button',{name:'Try again',exact:true}));await settle();expect(request).toHaveBeenCalledTimes(2);expect(document.querySelector('.visual-viewport img')).not.toBeNull();
});
it('canceling a concurrent pending image keeps the verified recording playing',async()=>{
 const visuals=preparedVisuals(),target=activities.find(a=>a.id==='S02-U005');
 vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({deliveryRevision:'d'.repeat(64),files:[...visuals.map(a=>({path:a.src})),{path:target.audioSrc}]});
 let resolveImage,imageSignal;const request=vi.spyOn(libraryAdapter,'playMedia').mockImplementation((_pack,path,_revision,signal)=>path===target.audioSrc?Promise.resolve({bytes:new Uint8Array([1]).buffer,mime:'audio/ogg'}):new Promise(r=>{resolveImage=r;imageSignal=signal;}));
 await startAt(target.id);await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();await settle();expect(players.at(-1).paused).toBe(false);expect(request).toHaveBeenCalledTimes(2);
 await fireEvent.click(screen.getByRole('button',{name:'Cancel loading',exact:true}));expect(imageSignal.aborted).toBe(true);expect(players.at(-1).paused).toBe(false);
 resolveImage({bytes:new Uint8Array([2]).buffer,mime:'image/webp'});await settle();expect(document.querySelector('.visual-viewport img')).toBeNull();expect(players.at(-1).paused).toBe(false);
});

it('keeps FIA Guide browser title after hydration',async()=>{await startAt('S01-U001');expect(document.title).toBe('FIA Guide');});
