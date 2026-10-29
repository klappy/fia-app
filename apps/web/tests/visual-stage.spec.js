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
afterEach(()=>{delete document.modelContext;cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();localStorage.clear();});
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
