import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/svelte';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import App from '../src/App.svelte';
import {libraryAdapter} from '../src/lib/library.js';
import {createSession} from '../src/lib/engine.js';
import {saveProgress} from '../src/lib/session-store.js';
const registry=JSON.parse(readFileSync('public/content/registry.json','utf8'));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
for(const id of ['eng.MRK-1-1-13','spa.MRK-1-1-13','eng.MRK-1-14-20','spa.MRK-1-14-20'])it(`loads ${id} silently in manual mode with explicit text continuation and no resource URL`,async()=>{
 localStorage.setItem('fia-v3-selected-pack',id);const requests=[];
 vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('fetch',async url=>{requests.push(url);return new Response(readFileSync('public'+url));});
 vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});
 const audio=vi.fn();vi.stubGlobal('Audio',audio);HTMLMediaElement.prototype.pause=vi.fn();Element.prototype.scrollTo=vi.fn();
 const descriptor=registry.packs.find(p=>p.id===id),pack=JSON.parse(readFileSync('public'+descriptor.presentation.url,'utf8'));
 saveProgress(localStorage,descriptor,pack.activities,{session:createSession(pack.activities),muted:true});render(App);
 await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(pack.activities[0].prompt));
 expect(audio).not.toHaveBeenCalled();expect(document.querySelectorAll('img[src],video[src],audio[src]')).toHaveLength(0);
 await fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));
 await waitFor(()=>expect(JSON.parse(localStorage.getItem('fia-v3-progress@1:'+id)).session.index).toBe(1));
 expect(audio).not.toHaveBeenCalled();expect(requests.every(url=>url==='/content/registry.json'||url===descriptor.presentation.url)).toBe(true);
});
it('late previous-pack download activation cannot expose media in the newly selected pack',async()=>{
 const descriptor=registry.packs.find(p=>p.id==='spa.MRK-1-1-13'),presentation=JSON.parse(readFileSync('public'+descriptor.presentation.url,'utf8'));
 presentation.assets.a112.src='/assets/stale-shared.png';presentation.activities[0].assetId='a112';
 localStorage.setItem('fia-v3-selected-pack',descriptor.id);let release;const held=new Promise(resolve=>release=resolve);
 vi.spyOn(libraryAdapter,'select').mockResolvedValue({descriptor,presentation});
 vi.spyOn(libraryAdapter,'downloadStatus').mockImplementation(async pack=>pack.id==='eng.MRK-1-1-13'?{saved:true,active:{manifest:{presentationRevision:pack.revision},files:[{path:'/assets/stale-shared.png'}]}}:{saved:false});
 vi.spyOn(libraryAdapter,'activate').mockImplementation(pack=>pack.id==='eng.MRK-1-1-13'?held:Promise.resolve({selected:true}));
 vi.stubGlobal('Audio',vi.fn());HTMLMediaElement.prototype.pause=vi.fn();Element.prototype.scrollTo=vi.fn();
 render(App);await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(presentation.activities[0].title));
 release({selected:true});await new Promise(resolve=>setTimeout(resolve,10));
 expect(document.querySelector('img[src="/assets/stale-shared.png"]')).toBeNull();expect(screen.getByText(/not available online yet/)).toBeTruthy();
});

it('remote-only resource says not prepared without offering a download action',async()=>{
 const descriptor=registry.packs.find(p=>p.id==='spa.MRK-1-1-13'),presentation=JSON.parse(readFileSync('public'+descriptor.presentation.url,'utf8'));
 presentation.activities[0].assetId='a112';delete presentation.assets.a112.src;
 localStorage.setItem('fia-v3-selected-pack',descriptor.id);vi.spyOn(libraryAdapter,'select').mockResolvedValue({descriptor,presentation});vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});
 vi.stubGlobal('Audio',vi.fn());HTMLMediaElement.prototype.pause=vi.fn();Element.prototype.scrollTo=vi.fn();render(App);
 await waitFor(()=>expect(screen.getByText(/not available online yet/)).toBeTruthy());expect(screen.queryByRole('button',{name:'Open Downloads'})).toBeNull();expect(document.querySelector('img[src]')).toBeNull();
});
