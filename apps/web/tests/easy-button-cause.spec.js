// fia-easy-button-policy@1 cause invariant (captain k0006), as far as this lane proves it:
// on load the primary is verifying, then its first verified action (post-R6: decide() emits verifying and starting),
// an identical state never flips it, and the changes this lane can drive have a classified cause.
// Observables only: the primary's aria-label (GuidePrimary.svelte:10). The runtime EB guard and its window stay with #216.
import {libraryAdapter,bundledPack} from '../src/lib/library.js';
import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,fireEvent,screen,cleanup} from '@testing-library/svelte';
import {tick} from 'svelte';
import App from '../src/App.svelte';
import {createSession} from '../src/lib/engine.js';
import {activities,assets} from '../src/lib/content.js';
import {policyInputFrom} from '../src/lib/easy-button-input.js';
import {PRIMARY_LABELS} from '../src/lib/primary-labels.js';
import {causeOf,decide} from '../../../packages/contracts/easy-button-policy/index.mjs';

class FakeAudio {
 constructor(src){this.src=src;this.paused=true;this.currentTime=0;this.duration=12;}
 play(){this.paused=false;return Promise.resolve();} pause(){this.paused=true;} load(){} removeAttribute(){}
}
const settle=async()=>{await Promise.resolve();await tick();};
const VERIFIED=new Set(Object.values(PRIMARY_LABELS).filter(Boolean));
const primaryLabel=()=>document.querySelector('.guide-primary')?.getAttribute('aria-label');
let seen=[],loadSeen=[],observer=null;
function watchPrimary(){
 seen=[];
 const record=()=>{const label=primaryLabel();if(label!==undefined&&label!==null&&label!==seen.at(-1))seen.push(label);};
 observer=new MutationObserver(record);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-label']});
 return record;
}
async function startAt(id,status='ready',prefs={}){
 const session=createSession(activities);session.index=activities.findIndex(a=>a.id===id);session.status=status;Object.assign(session.preferences,prefs);
 localStorage.setItem('fia-v3-session@2',JSON.stringify({session}));
 const record=watchPrimary();render(App);record();await settle();await settle();await settle();record();
 loadSeen=seen;seen=[primaryLabel()]; // later assertions watch only post-load changes
}
async function setting(name){
 await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Settings',exact:true}));
 await fireEvent.click(screen.getByRole('checkbox',{name:new RegExp(name)}));await fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));await settle();
}
const baseInput=(over={})=>policyInputFrom({presentationId:'fia-mark-authentic@1',activity:activities[0],focal:assets[activities[0].assetId],session:{status:'ready',detour:null,preferences:{readScripture:true,describeImages:true,autoplayVideo:false}},muted:false,introduced:new Set(),...over});

beforeEach(()=>{
 const paths=[...activities.map(a=>a.audioSrc),...Object.values(assets).flatMap(a=>[a.src,a.poster,a.descriptionAudio])].filter(Boolean).map(path=>({path}));
 vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:true,active:{manifest:{presentationRevision:bundledPack.revision,files:paths},files:paths}});
 vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});
 localStorage.clear();vi.stubGlobal('Audio',FakeAudio);
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
 HTMLMediaElement.prototype.pause=vi.fn();HTMLMediaElement.prototype.play=vi.fn(()=>Promise.resolve());Element.prototype.scrollTo=vi.fn();
});
afterEach(()=>{observer?.disconnect();observer=null;cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});

const LOADS=[['S01-U001','ready','Begin'],['S02-U005','waiting','Play video'],['S01-U002-reading-1','ready','Play']];
// Post-R6 (#193 R5 E1): on load the primary is verifying (decide() emits verifying while phase is loading), then
// changes once, to its first verified action. No interim verified-looking label.
it('(1) R5 E1: on load the primary goes from Checking availability to its first verified action only',async()=>{
 for(const [id,status,settled] of LOADS){
  await startAt(id,status);
  expect(loadSeen.every(label=>label==='Checking availability'||VERIFIED.has(label))).toBe(true);
  expect(loadSeen).not.toContain('');
  expect(loadSeen.filter(label=>label!=='Checking availability')).toEqual([settled]);
  expect(loadSeen.at(-1)).toBe(settled);
  observer.disconnect();cleanup();
 }
});

it('(2) an identical state never changes the label: a sheet round trip and a remount with the same stored state',async()=>{
 await startAt('S01-U001');const first=primaryLabel();
 await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Close',exact:true}));await settle();
 expect(primaryLabel()).toBe(first);expect(seen).toEqual([first]);
 observer.disconnect();const stored=localStorage.getItem('fia-v3-session@2');cleanup();localStorage.setItem('fia-v3-session@2',stored);
 const record=watchPrimary();render(App);record();await settle();await settle();await settle();record();
 expect(seen.at(-1)).toBe(first); // the remount settles on the same verified action (after verifying, see 1)
 const input=baseInput();expect(causeOf(input,structuredClone(input))).toBeNull();expect(decide(input)).toEqual(decide(structuredClone(input)));
});

it('(3) the settings toggles are gesture causes: guide narration changes the label, video playback changes only autoplay',async()=>{
 await startAt('S01-U001');expect(primaryLabel()).toBe('Begin');
 await setting('Automatic guide narration');expect(primaryLabel()).toBe('Continue');
 await setting('Automatic guide narration');expect(primaryLabel()).toBe('Begin');
 expect(seen).toEqual(['Begin','Continue','Begin']);
 await setting('Automatic video playback');expect(primaryLabel()).toBe('Begin'); // no label-chain branch reads autoplayVideo
 expect(seen).toEqual(['Begin','Continue','Begin']);
 const on=baseInput(),muted=baseInput({muted:true});
 expect(causeOf(on,muted)).toMatchObject({class:'gesture',provisional:false,paths:['settings.guideNarration']});
 const video=structuredClone(on);video.settings.autoplayVideo=true;
 expect(causeOf(on,video)).toMatchObject({class:'gesture',provisional:false,paths:['settings.autoplayVideo']});
});

it('(4) a preparation status publish (preparation-intent.js:11 emit) classifies as status',()=>{
 const available=baseInput({preparationAvailable:true}),preparing=baseInput({preparationAvailable:true,preparationBusy:true});
 expect(causeOf(available,preparing)).toMatchObject({class:'status',provisional:false,paths:['facts.preparation']});
 const ready=baseInput({preparationStatus:'ready'});
 expect(causeOf(baseInput(),ready)).toMatchObject({class:'status',paths:['facts.preparation']});
 expect(decide(available).primary.action).toBe('begin');
});
