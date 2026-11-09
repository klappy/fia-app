// E8 (plan § 6, captain's Summit order 2026-11-09): a pack whose catalog says no guide recording exists anywhere shows the
// narration-blocked notice on one screen per session at most; a pack with partial recordings keeps today's per-screen notice.
import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/svelte';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
const audio=vi.hoisted(()=>({play:vi.fn(),pause:vi.fn(),resume:vi.fn(),stop:vi.fn(),active:false}));
vi.mock('../src/lib/audio.js',()=>({createAudioController:(state,end)=>{audio.state=state;audio.end=end;return audio;}}));
import App from '../src/App.svelte';import {libraryAdapter} from '../src/lib/library.js';import {guideRecordingAvailability} from '../src/lib/recording-availability.js';
const registry=JSON.parse(readFileSync('public/content/registry.json','utf8')),h='a'.repeat(64);
const packs={none:'spa.LUK-1-1-4',partial:'eng.MRK-1-14-20'};
let descriptor,presentation;
function load(id){
 descriptor=registry.packs.find(p=>p.id===id);presentation=structuredClone(JSON.parse(readFileSync('public'+descriptor.presentation.url,'utf8')));
 presentation.execution={schema:'fia-executable-presentation@1',sourceRevision:'source-1',decisionEvidenceSha256:h,recipeRevision:'recipe-1'};
 for(const a of presentation.activities)a.execution={narration:{action:'blocked',status:'unavailable',reason:'server-unavailable-machine-code'},focalAssetId:a.assetId??null,completion:{action:'manual-continue'}};
 localStorage.setItem('fia-v3-selected-pack',descriptor.id);
 vi.spyOn(libraryAdapter,'select').mockImplementation(async()=>({descriptor,presentation}));
}
beforeEach(()=>{
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};HTMLMediaElement.prototype.pause=vi.fn();Element.prototype.scrollTo=vi.fn();
 vi.stubGlobal('crypto',webcrypto);
 audio.active=false;audio.stop.mockImplementation(()=>{audio.active=false;audio.state?.({playing:false,src:null,elapsed:0,duration:0});});
 vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({files:[],savedFiles:[],deliveryRevision:null});
 vi.spyOn(libraryAdapter,'playBoundAudio').mockResolvedValue(null);vi.spyOn(libraryAdapter,'prepareOriginal').mockResolvedValue(null);vi.spyOn(libraryAdapter,'prepareRecording').mockResolvedValue({status:'ready',value:{}});vi.spyOn(libraryAdapter,'preparationStatus').mockResolvedValue({status:'ready',value:{}});
 URL.createObjectURL=vi.fn(()=>'blob:execution');URL.revokeObjectURL=vi.fn();
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();localStorage.clear();});
const notice='This recording is unavailable. You can continue.';
const statusText=()=>screen.queryAllByRole('status').map(n=>n.textContent).join(' ');
async function mount(){render(App);await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(presentation.activities[0].prompt));await waitFor(()=>expect(document.querySelector('.guide-primary').hasAttribute('aria-busy')).toBe(false));}
async function next(){await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));}
it('a pack with no guide recordings at all raises the blocked notice once, then stays quiet on every later screen',async()=>{
 load(packs.none);expect(guideRecordingAvailability(descriptor)).toBe('Guide recordings unavailable');
 await mount();expect(statusText()).toContain(notice);
 const first=screen.getByRole('heading',{level:1}).textContent;
 await next();await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).not.toBe(first));
 expect(statusText()).not.toContain(notice);
 await next();await new Promise(r=>setTimeout(r,0));expect(statusText()).not.toContain(notice);
 await fireEvent.click(screen.getByRole('button',{name:'Previous activity'}));await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).not.toBe(first));
 expect(statusText()).not.toContain(notice);
 expect(screen.getByRole('button',{name:'Replay',exact:true}).disabled).toBe(true);
});
it('Restart passage starts a new session, so the once-per-session notice is raised again on its first screen (Codex P2 on #354)',async()=>{
 load(packs.none);vi.spyOn(libraryAdapter,'languages').mockResolvedValue([{id:'spa',nativeName:'Español',ready:1}]);vi.spyOn(libraryAdapter,'passages').mockResolvedValue([descriptor]);
 await mount();expect(statusText()).toContain(notice);
 const first=screen.getByRole('heading',{level:1}).textContent;
 await next();await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).not.toBe(first));
 expect(statusText()).not.toContain(notice);
 await fireEvent.click(screen.getByRole('button',{name:'Session progress: open section overview'}));await fireEvent.click(screen.getByRole('button',{name:/^Passages/}));
 await fireEvent.click(await screen.findByRole('button',{name:'Restart passage'}));await fireEvent.click(screen.getByRole('button',{name:'Start again'}));
 await fireEvent.click(screen.getAllByRole('button',{name:'Close'})[0]);
 await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(first));
 expect(statusText()).toContain(notice);
 await next();await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).not.toBe(first));
 expect(statusText()).not.toContain(notice);
});
it('a pack with partial recordings keeps the per-screen blocked notice',async()=>{
 load(packs.partial);expect(guideRecordingAvailability(descriptor)).toBe('Some guide recordings available on request');
 await mount();expect(statusText()).toContain(notice);
 const first=screen.getByRole('heading',{level:1}).textContent;
 await next();await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).not.toBe(first));
 await waitFor(()=>expect(statusText()).toContain(notice));
});
