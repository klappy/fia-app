import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/svelte';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
const audio=vi.hoisted(()=>({play:vi.fn(),pause:vi.fn(),resume:vi.fn(),stop:vi.fn(),active:false}));
vi.mock('../src/lib/audio.js',()=>({createAudioController:(state,end)=>{audio.state=state;audio.end=end;return audio;}}));
import App from '../src/App.svelte';import {libraryAdapter} from '../src/lib/library.js';
// F9 (SOURCE-TO-APP L87-L99, Q22): on the U008 journey the stage shows exactly the server-declared originals.
// The real transport runs over a fetch stub, so every POST the page sends is counted: one per deliberate
// action on a preparable step, none for a ready one, none on Back, and none offline.
const registry=JSON.parse(readFileSync('public/content/registry.json','utf8')),descriptor=registry.packs.find(p=>p.id==='eng.MRK-1-14-20'),base=JSON.parse(readFileSync('public'+descriptor.presentation.url,'utf8'));
const h=c=>c.repeat(64),rev=descriptor.revision,A=6,C=7;
const bytes={a1400:new TextEncoder().encode('a1400 original'),c4:new TextEncoder().encode('c4 original')};
let presentation,sha,posts,gets,answers,declared,tools;
const digest=async b=>Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
const path=id=>`/v1/original-visuals/${h('1')}/${h('2')}/${sha[id]}`;
const demand=(assetId,kind)=>({packId:descriptor.id,baseRevision:h('b'),sourceRevision:'c'.repeat(40),capability:'executable-presentation',visualDemand:{assetId,kind},expectedExecutionRevision:rev,expectedPublicationGeneration:h('6')});
const preparable=(id,kind)=>({assetId:id,kind,status:'preparable',preparationDemand:demand(id,kind)});
const ready=(id,kind)=>({assetId:id,kind,status:'ready',ready:{path:path(id),sha256:sha[id]}});
const record=visualResources=>({status:'ready',packId:descriptor.id,revision:rev,artifact:{sha256:rev,bytes:9,mime:'application/json'},execution:{schema:'fia-executable-catalog@1',visualResources}});
beforeEach(async()=>{
 sha={a1400:await digest(bytes.a1400),c4:await digest(bytes.c4)};posts=[];gets=[];
 presentation=structuredClone(base);presentation.execution={schema:'fia-executable-presentation@1',sourceRevision:'source-1',decisionEvidenceSha256:h('a'),recipeRevision:'recipe-1'};
 for(const a of presentation.activities)a.execution={narration:{action:'none'},focalAssetId:a.assetId??null,completion:{action:'manual-continue'}};
 presentation.activities[A].execution.focalAssetId='a1400';presentation.activities[C].execution.focalAssetId='c4';
 declared=[preparable('a1400','image'),preparable('c4','map')];
 answers={a1400:()=>record([ready('a1400','image'),preparable('c4','map')]),c4:()=>record([ready('a1400','image'),ready('c4','map')])};
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};HTMLMediaElement.prototype.pause=vi.fn();Element.prototype.scrollTo=vi.fn();
 vi.stubGlobal('crypto',webcrypto);localStorage.setItem('fia-v3-selected-pack',descriptor.id);tools=new Map();Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool:t=>tools.set(t.name,t)}});
 vi.stubGlobal('fetch',async(url,init={})=>{
  if(url==='/v1/presentation-preparations'&&init.method==='POST'){const d=JSON.parse(init.body);posts.push(d.visualDemand.assetId);const answer=answers[d.visualDemand.assetId]();return new Response(JSON.stringify({schema:'fia-presentation-preparation@1',status:'ready',jobId:h('3'),reason:null,record:answer}),{status:200});}
  const id=Object.keys(sha).find(k=>url===path(k));if(id){gets.push(id);return new Response(bytes[id],{status:200,headers:{'Content-Type':id==='c4'?'image/png':'image/jpeg'}});}
  throw Error('unexpected fetch '+url);
 });
 vi.spyOn(libraryAdapter,'select').mockImplementation(async()=>({descriptor:{...descriptor,visualResources:declared},presentation}));vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({files:[],savedFiles:[],deliveryRevision:null});
 let serial=0;URL.createObjectURL=vi.fn(()=>`blob:visual-${++serial}`);URL.revokeObjectURL=vi.fn();
});
// Every spec leaves the browser online, even when it fails mid-way (review 5699134354 N2): an offline spec never leaks into the next.
afterEach(()=>{delete navigator.onLine;window.dispatchEvent(new Event('online'));delete document.modelContext;cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();localStorage.clear();});
async function mount(){render(App);await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(presentation.activities[0].prompt));await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false));}
// The session's own read tool names the current activity; a visual step's heading may be the section's.
const current=async()=>(await tools.get('fia_read_session').execute()).activityId;
const step=i=>waitFor(async()=>expect(await current()).toBe(presentation.activities[i].id));
const shown=title=>waitFor(()=>expect(document.querySelector('.visual-viewport img')?.getAttribute('alt')).toBe(title));
const heading=()=>screen.getByRole('heading',{level:1}).textContent;
// Forward by the visible control until the step's prompt is the heading (a section transition may come between).
const next=()=>fireEvent.click(screen.getByRole('button',{name:'Skip to next activity'}));
// To the step before A (S01-U003), by the visible skip control; it sends no visual demand on the way.
async function toStart(){for(let i=0;i<12&&await current()!==presentation.activities[A-1].id;i++){await next();await new Promise(r=>setTimeout(r,10));}await step(A-1);}
const back=()=>fireEvent.click(screen.getByRole('button',{name:'Previous activity'}));

it('Continue to a1400 asks once and shows the verified original; c4 follows; Back and forward send nothing more',async()=>{
 await mount();expect(posts).toEqual([]);
 await toStart();expect(posts).toEqual([]);await next();await step(A);await shown(presentation.assets.a1400.title);
 expect(posts).toEqual(['a1400']);expect(gets).toEqual(['a1400']);
 await next();await step(C);await shown(presentation.assets.c4.title);
 expect(posts).toEqual(['a1400','c4']);
 await back();await step(A);await shown(presentation.assets.a1400.title);
 await next();await step(C);await shown(presentation.assets.c4.title);
 expect(posts).toEqual(['a1400','c4'],'ready entries are read, never asked for again');
});

it('an unavailable declaration shows the existing not-available copy and sends nothing',async()=>{
 declared=[{assetId:'a1400',kind:'image',status:'unavailable',reason:'decoder-unavailable'},preparable('c4','map')];
 await mount();await toStart();expect(posts).toEqual([]);await next();await step(A);
 await waitFor(()=>expect(screen.getByText('This image is not available online yet. You can continue with the passage text.')).toBeTruthy());
 expect(posts).toEqual([]);expect(gets).toEqual([]);
});

it('a failed original shows the media-viewer wording with Try again; Try again asks once more',async()=>{
 answers.a1400=()=>record([preparable('a1400','image'),preparable('c4','map')]);
 await mount();await toStart();expect(posts).toEqual([]);await next();await step(A);
 await waitFor(()=>expect(screen.getByText('This image could not load.')).toBeTruthy());expect(posts).toEqual(['a1400']);
 answers.a1400=()=>record([ready('a1400','image'),preparable('c4','map')]);
 await fireEvent.click(screen.getByRole('button',{name:'Try again'}));await shown(presentation.assets.a1400.title);
 expect(posts).toEqual(['a1400','a1400']);
});

it('offline, a preparable step sends nothing and says it is not saved on this device',async()=>{
 await mount();Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'));
 await toStart();expect(posts).toEqual([]);await next();await step(A);
 await waitFor(()=>expect(screen.getByText('This image is not saved on this device. Connect to the internet to view it.')).toBeTruthy());
 expect(posts).toEqual([]);
 delete navigator.onLine;
});

it('restoring onto a preparable visual step sends nothing until a deliberate action asks',async()=>{
 answers.a1400=()=>record([preparable('a1400','image'),preparable('c4','map')]);
 await mount();await toStart();await next();await step(A);await waitFor(()=>expect(posts).toEqual(['a1400']));
 cleanup();posts.length=0;gets.length=0;
 render(App);await step(A);await new Promise(r=>setTimeout(r,100));
 expect(posts).toEqual([],'restore is not a deliberate action');
 answers.a1400=()=>record([ready('a1400','image'),preparable('c4','map')]);
 // The explicit Retry row: the existing not-loaded state offers Try again, and that one tap asks once.
 await fireEvent.click(await screen.findByRole('button',{name:'Try again'}));await shown(presentation.assets.a1400.title);
 expect(posts).toEqual(['a1400']);
});

// PR305 review B1: offline, a step declared unavailable keeps its honest copy; connecting would not help.
it('offline, an unavailable declaration still says not available, never "not saved on this device"',async()=>{
 declared=[{assetId:'a1400',kind:'image',status:'unavailable',reason:'decoder-unavailable'},preparable('c4','map')];
 await mount();await toStart();Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'));
 await next();await step(A);
 await waitFor(()=>expect(screen.getByText('This image is not available online yet. You can continue with the passage text.')).toBeTruthy());
 expect(screen.queryByText('This image is not saved on this device. Connect to the internet to view it.')).toBeNull();
 expect(posts).toEqual([]);delete navigator.onLine;
});

// PR305 review (SOURCE-TO-APP L126): automatic progression is read-only. Narration that advances by itself onto a
// preparable visual step sends no demand; the step offers Try again, and that tap asks once.
it('an automatic advance onto a preparable step sends no visual demand',async()=>{
 const ref={id:'server-authoritative-reference',sha256:h('a')};
 presentation.activities[A-1].execution={narration:{action:'play-bound-audio',artifact:ref},focalAssetId:null,completion:{action:'advance-after-narration'}};
 vi.spyOn(libraryAdapter,'playBoundAudio').mockResolvedValue({bytes:new Uint8Array([1,2]),mime:'audio/wav',playback:'whole-file-native-ended'});
 audio.play.mockImplementation((text,src)=>{audio.active=true;audio.src=src;audio.state({playing:true,src,elapsed:0,duration:2});});
 audio.stop.mockImplementation(()=>{audio.active=false;audio.state?.({playing:false,src:null,elapsed:0,duration:0});});
 await mount();await toStart();expect(posts).toEqual([]);
 // Arriving by the forward control starts the step's narration; its end advances by itself.
 await waitFor(()=>expect(audio.play).toHaveBeenCalled());
 audio.active=false;audio.state({playing:false,src:null,elapsed:0,duration:0});audio.end();
 await step(A);await new Promise(r=>setTimeout(r,100));
 expect(posts).toEqual([],'the automatic advance is not a deliberate action');
 await fireEvent.click(await screen.findByRole('button',{name:'Try again'}));await waitFor(()=>expect(posts).toEqual(['a1400']));
});

// PR305 review 5699134354 N1 (SOURCE-TO-APP L126): a detour video's natural end returns to the guide on its own; that return is
// automatic, so it never authorizes a visual demand. The held step is preparable and its first ask has failed; only Try again asks.
it('a detour video ending returns to a preparable step without a visual demand',async()=>{
 answers.a1400=()=>record([preparable('a1400','image'),preparable('c4','map')]);
 presentation.assets.a19={...presentation.assets.a19,src:'/media/a19.mp4'};
 // The detour video is a Saved file, so the stage renders it (no delivery needed).
 const video19={path:'/media/a19.mp4',group:'video',bytes:3,sha256:h('d'),mime:'video/mp4'};
 libraryAdapter.downloadStatus.mockResolvedValue({saved:true,active:{selection:'all',manifest:{presentationRevision:rev,files:[video19]},files:[video19]}});
 await mount();await toStart();await next();await step(A);await waitFor(()=>expect(posts).toEqual(['a1400']));
 await tools.get('fia_present_resource').execute({assetId:'a19'});
 const video=await waitFor(()=>{const v=document.querySelector('video');expect(v).toBeTruthy();return v;});
 await fireEvent.ended(video);await step(A);await waitFor(async()=>expect((await tools.get('fia_read_session').execute()).detour??null).toBeNull());
 await new Promise(r=>setTimeout(r,100));
 expect(posts).toEqual(['a1400'],'the automatic return is not a deliberate action');
 await fireEvent.click(await screen.findByRole('button',{name:'Try again'}));await waitFor(()=>expect(posts).toEqual(['a1400','a1400']));
});

// PR305 review 5699134354 N2: a swipe forward asks exactly once, as Continue, Back and Try again do.
const touch=(target,type,x,y)=>{const e=new Event(type,{bubbles:true});Object.defineProperties(e,{touches:{value:type==='touchend'?[]:[{clientX:x,clientY:y}]},changedTouches:{value:[{clientX:x,clientY:y}]}});target.dispatchEvent(e);};
it('a swipe forward onto a preparable step asks exactly once',async()=>{
 await mount();await toStart();expect(posts).toEqual([]);
 const scene=document.querySelector('.scene');touch(scene,'touchstart',700,350);touch(scene,'touchmove',500,350);touch(scene,'touchend',500,350);
 await step(A);await shown(presentation.assets.a1400.title);await new Promise(r=>setTimeout(r,50));
 expect(posts).toEqual(['a1400']);
});
