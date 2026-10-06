import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,within} from '@testing-library/svelte';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
// R3 (scripted journeys G5, G6; RECIPE C1–C5): a notice belongs to the passage, screen
// and sheet that raised it. Exercised at the App boundary with the real passages.
const audio=vi.hoisted(()=>({play:vi.fn(),pause:vi.fn(),resume:vi.fn(),stop:vi.fn(),active:false}));
vi.mock('../src/lib/audio.js',()=>({createAudioController:(state,end,error)=>{audio.state=state;audio.end=end;audio.error=error;return audio;}}));
import App from '../src/App.svelte';
import {libraryAdapter} from '../src/lib/library.js';
import {createSession} from '../src/lib/engine.js';
import {saveProgress} from '../src/lib/session-store.js';
const registry=JSON.parse(readFileSync('public/content/registry.json','utf8'));
const load=id=>{const descriptor=registry.packs.find(p=>p.id===id);return {descriptor,presentation:JSON.parse(readFileSync('public'+descriptor.presentation.url,'utf8'))};};
const scriptureNotice='No recording is available for this Scripture passage. You can read it and continue.';
const h='a'.repeat(64);
let packs,refused;
beforeEach(()=>{
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};HTMLMediaElement.prototype.pause=vi.fn();Element.prototype.scrollTo=vi.fn();
 vi.stubGlobal('crypto',webcrypto);packs=new Map();refused=new Map();
 audio.active=false;audio.play.mockImplementation((text,src)=>{audio.active=true;audio.src=src;audio.state({playing:true,src,elapsed:0,duration:2});});audio.stop.mockImplementation(()=>{audio.active=false;audio.state?.({playing:false,src:null,elapsed:0,duration:0});});audio.pause.mockImplementation(()=>audio.state({playing:false,src:audio.src,elapsed:0,duration:2}));audio.resume.mockImplementation(()=>{audio.state({playing:true,src:audio.src,elapsed:0,duration:2});return true;});
 vi.spyOn(libraryAdapter,'select').mockImplementation(async id=>{if(refused.has(id))throw Object.assign(Error(refused.get(id)),{code:'passage-unavailable'});return packs.get(id)||load(id);});
 vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({files:[],savedFiles:[],deliveryRevision:null});
 vi.spyOn(libraryAdapter,'languages').mockResolvedValue([{id:'eng',nativeName:'English',ready:68},{id:'spa',nativeName:'Español',ready:68}]);
 vi.spyOn(libraryAdapter,'passages').mockImplementation(async language=>registry.packs.filter(p=>p.language===language&&/MRK-1-(14-20|21-28|29-34)$/.test(p.id)));
 vi.spyOn(libraryAdapter,'playBoundAudio').mockResolvedValue({bytes:new Uint8Array([1,2]),mime:'audio/wav',playback:'whole-file-native-ended'});
 URL.createObjectURL=vi.fn(()=> 'blob:notice-scope');URL.revokeObjectURL=vi.fn();
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();localStorage.clear();});

const heading=()=>screen.getByRole('heading',{level:1}).textContent;
const notices=()=>screen.queryAllByRole('status').map(n=>n.textContent);
const openDialog=()=>document.querySelector('dialog[open]');
// Start on a passage at a saved screen with automatic guide narration off (the audit's PROD steps).
async function start(id,index=0,{descriptor}={}){
 const pack=load(id);if(descriptor)packs.set(id,{...pack,descriptor:{...pack.descriptor,...descriptor}});
 localStorage.setItem('fia-v3-selected-pack',id);const session=createSession(pack.presentation.activities);session.index=index;
 saveProgress(localStorage,pack.descriptor,pack.presentation.activities,{session,muted:true});render(App);
 await waitFor(()=>expect(heading()).toBe(pack.presentation.activities[index].prompt));return pack;
}
// Continue from the guide screen before the first reading: automatic Scripture finds no recording.
// R5: the primary checks availability first; act once it shows the checked action.
async function raiseScriptureNotice(){await fireEvent.click(await screen.findByRole('button',{name:'Continue',exact:true}));await waitFor(()=>expect(notices()).toContain(scriptureNotice));}
async function menu(item){await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',item==='Language'?{name:/^Language/}:{name:item,exact:true}));}
const card=title=>screen.getAllByRole('article').find(a=>within(a).queryByRole('heading',{name:title,exact:true}));
async function openPassage(title){await waitFor(()=>expect(card(title)).toBeTruthy());await fireEvent.click(within(card(title)).getByRole('button',{name:/Open passage|Resume passage/}));}
// G5: records every rendered state in which the new passage's heading shows next to a stale notice.
function watchStale(stale,nextHeading){
 const overlaps=[];const look=()=>{const headings=[...document.querySelectorAll('h1')].map(e=>e.textContent),shown=[...document.querySelectorAll('[role="status"]')].map(e=>e.textContent);if(headings.includes(nextHeading)&&shown.some(t=>t.includes(stale)))overlaps.push(shown);};
 const observer=new MutationObserver(look);observer.observe(document.body,{subtree:true,childList:true,characterData:true});return {overlaps,stop:()=>{look();observer.disconnect();}};
}
function executable(id,first='advance-after-narration'){
 const pack=load(id),presentation=structuredClone(pack.presentation);
 presentation.execution={schema:'fia-executable-presentation@1',sourceRevision:'source-1',decisionEvidenceSha256:h,recipeRevision:'recipe-1'};
 for(const a of presentation.activities)a.execution={narration:{action:'none'},focalAssetId:a.assetId??null,completion:{action:'manual-continue'}};
 presentation.activities[0].execution={narration:{action:'play-bound-audio',artifact:{id:'server-authoritative-reference',sha256:h}},focalAssetId:presentation.activities[0].assetId??null,completion:{action:first}};
 packs.set(id,{descriptor:pack.descriptor,presentation});localStorage.setItem('fia-v3-selected-pack',id);return presentation;
}
async function beginNarration(id){const presentation=executable(id);render(App);await waitFor(()=>expect(heading()).toBe(presentation.activities[0].prompt));await fireEvent.click(await screen.findByRole('button',{name:'Begin',exact:true}));await waitFor(()=>expect(audio.play).toHaveBeenCalledTimes(1));return presentation;}

it('C1: a Scripture notice on Mark 1:21–28 is gone when Mark 1:29–34 renders its heading',async()=>{
 await start('eng.MRK-1-21-28',1);await raiseScriptureNotice();
 const next=load('eng.MRK-1-29-34').presentation.activities[0].prompt,watch=watchStale(scriptureNotice,next);
 await menu('Passages');await openPassage('Mark 1:29–34');await waitFor(()=>expect(heading()).toBe(next));watch.stop();
 expect(watch.overlaps).toEqual([]);expect(notices()).not.toContain(scriptureNotice);
});

it('C2: a Spanish RV1909 notice does not carry onto English Mark 1:14–20',async()=>{
 await start('spa.MRK-1-14-20',1);await raiseScriptureNotice();
 await menu('Language');await fireEvent.click(await screen.findByRole('button',{name:/English/}));await fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));
 const next=load('eng.MRK-1-14-20').presentation.activities[0].prompt,watch=watchStale(scriptureNotice,next);
 await menu('Passages');await openPassage('Mark 1:14–20');await waitFor(()=>expect(heading()).toBe(next));watch.stop();
 expect(watch.overlaps).toEqual([]);expect(notices()).toEqual([]);
});

it('C3: after a refused switch, a successful switch carries no stale error',async()=>{
 const refusal='This passage is not available yet. Your current passage stays open.';refused.set('eng.MRK-1-14-20',refusal);
 await start('eng.MRK-1-21-28');await menu('Passages');await openPassage('Mark 1:14–20');
 await waitFor(()=>expect(document.body.textContent).toContain(refusal));
 const next=load('eng.MRK-1-29-34').presentation.activities[0].prompt,watch=watchStale(refusal,next);
 await openPassage('Mark 1:29–34');await waitFor(()=>expect(heading()).toBe(next));watch.stop();
 expect(watch.overlaps).toEqual([]);expect(document.body.textContent).not.toContain(refusal);
});

it('C4: a notice raised while the Language sheet is open shows inside the sheet and ends with it',async()=>{
 const setItem=Storage.prototype.setItem;vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(key,value){if(key==='fia-v3-library-language')throw Error('quota');return setItem.call(this,key,value);});
 await start('eng.MRK-1-21-28');await menu('Language');await fireEvent.click(await screen.findByRole('button',{name:/Español/}));
 const notice=await screen.findByText('Language choice could not be saved on this device.');
 expect(openDialog()).toBeTruthy();expect(openDialog().contains(notice)).toBe(true);
 expect(within(openDialog()).getByRole('button',{name:'Dismiss notice'})).toBeTruthy();
 await fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));
 expect(openDialog()).toBeNull();expect(screen.queryByText('Language choice could not be saved on this device.')).toBeNull();
});

it('C4: a playback error raised while the menu is open shows inside the sheet',async()=>{
 await beginNarration('eng.MRK-1-14-20');await fireEvent.click(screen.getByRole('button',{name:'More options'}));expect(openDialog()).toBeTruthy();
 audio.active=false;audio.state({playing:false,src:null,elapsed:0,duration:0});audio.error('The recording range is unavailable.');
 const notice=await screen.findByText('The recording range is unavailable.');expect(openDialog().contains(notice)).toBe(true);
});

it('C4: a refusal raised while the Passages sheet is open is shown in the sheet, not behind it',async()=>{
 const refusal='This passage is not available yet. Your current passage stays open.';refused.set('eng.MRK-1-14-20',refusal);
 const pack=await start('eng.MRK-1-21-28');await menu('Passages');await openPassage('Mark 1:14–20');
 await waitFor(()=>expect(within(openDialog()).getByText(refusal)).toBeTruthy());
 expect([...document.querySelectorAll('main [role="status"]')].map(n=>n.textContent)).not.toContain(refusal);expect(heading()).toBe(pack.presentation.activities[0].prompt);
});

it('a notice the reading screen raised stays with that screen while a sheet is open over it',async()=>{
 await start('eng.MRK-1-21-28',1);await raiseScriptureNotice();await menu('Settings');
 expect(within(openDialog()).queryByText(scriptureNotice)).toBeNull();
 await fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));expect(notices()).toContain(scriptureNotice);
});

it('C5: "Tap Play…" from a browser autoplay block clears once Resume starts playback',async()=>{
 await beginNarration('eng.MRK-1-14-20');
 audio.state({playing:false,src:audio.src,elapsed:0,duration:2});audio.error('Tap Play to hear the narration. Your browser paused automatic audio.');
 await waitFor(()=>expect(notices()).toContain('Tap Play to hear the narration. Your browser paused automatic audio.'));
 await fireEvent.click(screen.getByRole('button',{name:'Resume',exact:true}));expect(audio.resume).toHaveBeenCalledTimes(1);
 await waitFor(()=>expect(notices()).not.toContain('Tap Play to hear the narration. Your browser paused automatic audio.'));
});

it('a passage opened from a verified offline copy keeps its own offline notice after another offline copy',async()=>{
 const offline='Using the last verified saved passage while offline.';
 await start('eng.MRK-1-21-28',0,{descriptor:{offlineSnapshot:'historical-verified'}});expect(notices()).toContain(offline);
 const next=load('eng.MRK-1-29-34');packs.set(next.descriptor.id,{...next,descriptor:{...next.descriptor,offlineSnapshot:'historical-verified'}});
 await menu('Passages');await openPassage('Mark 1:29–34');await waitFor(()=>expect(heading()).toBe(next.presentation.activities[0].prompt));
 await new Promise(r=>setTimeout(r,0));expect(notices()).toContain(offline);
});
