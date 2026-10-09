import {readFileSync} from 'node:fs';
import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,within} from '@testing-library/svelte';
import {tick} from 'svelte';
import App from '../src/App.svelte';
import LibraryPanel from '../src/components/LibraryPanel.svelte';
import {libraryAdapter} from '../src/lib/library.js';
const registry=JSON.parse(readFileSync('public/content/registry.json','utf8'));
const pack=id=>registry.packs.find(p=>p.id===id);
const settle=async()=>{for(let i=0;i<4;i++){await Promise.resolve();await tick();}};
const refusal=(message,code)=>Object.assign(Error(message),{code});
const unavailable=()=>refusal('This passage is not available yet. Your current passage stays open.','passage-unavailable');
const sceneNotices=()=>[...document.querySelectorAll('.scene-notice')].map(n=>n.textContent.trim());
beforeEach(()=>{
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 vi.spyOn(libraryAdapter,'languages').mockResolvedValue([{id:'eng',name:'English',nativeName:'English',ready:68}]);
 vi.spyOn(libraryAdapter,'passages').mockResolvedValue([pack('eng.MRK-1-1-13'),pack('eng.MRK-1-14-20')]);
 vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});
 vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({files:[],savedFiles:[],deliveryRevision:null});
 vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});
 vi.stubGlobal('Audio',vi.fn());HTMLMediaElement.prototype.pause=vi.fn();Element.prototype.scrollTo=vi.fn();
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});

it('R1/A2: Open is busy while pending; a refusal shows next to that card and the card stops claiming recordings',async()=>{
 let reject;const onselect=vi.fn(()=>new Promise((_,r)=>reject=r));
 render(LibraryPanel,{view:'passages',onselect,onlanguage:()=>{},onview:()=>{},onreset:()=>{}});await settle();
 const card=screen.getByRole('heading',{name:'Mark 1:14–20'}).closest('article'),other=screen.getByRole('heading',{name:'Mark 1:1–13'}).closest('article');
 expect(within(card).getByText(/Some guide recordings available on request/)).toBeTruthy();
 const open=within(card).getByRole('button',{name:/Open passage|Resume passage/});await fireEvent.click(open);await settle();
 expect(onselect).toHaveBeenCalledWith('eng.MRK-1-14-20');expect(open.disabled).toBe(true);expect(open.getAttribute('aria-busy')).toBe('true');
 await fireEvent.click(open);expect(onselect).toHaveBeenCalledTimes(1);
 reject(unavailable());await settle();
 expect(within(card).getByRole('alert').textContent).toBe('This passage is not available yet. Your current passage stays open.');
 expect(within(other).queryByRole('alert')).toBeNull();expect(within(card).queryByText(/available on request/)).toBeNull();expect(within(card).getByText('Not available yet')).toBeTruthy();
 expect(open.disabled).toBe(false);expect(open.getAttribute('aria-busy')).toBeNull();
});

it('R1/A2: a refused switch keeps the sheet open with the truth in it, adds no reading-screen notice and keeps the current passage',async()=>{
 const select=vi.spyOn(libraryAdapter,'select').mockRejectedValue(unavailable());
 render(App);await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBeTruthy());const heading=screen.getByRole('heading',{level:1}).textContent;
 await fireEvent.click(screen.getByRole('button',{name:'Session progress: open section overview'}));await fireEvent.click(screen.getByRole('button',{name:/^Passages/}));
 const card=(await screen.findByRole('heading',{name:'Mark 1:14–20'})).closest('article');
 await fireEvent.click(within(card).getByRole('button',{name:/Open passage|Resume passage/}));await settle();
 expect(select).toHaveBeenCalledWith('eng.MRK-1-14-20',expect.objectContaining({explicit:true}));
 await waitFor(()=>expect(within(card).getByRole('alert').textContent).toMatch(/not available yet/));
 expect(document.querySelector('dialog.sheet')?.open).toBe(true);expect(sceneNotices()).toEqual([]);
 expect(screen.getByRole('heading',{level:1}).textContent).toBe(heading);expect(localStorage.getItem('fia-v3-selected-pack')).toBeNull();
});

it('R1/A3: a saved passage that cannot be restored falls back once, clears the key, and the next launch is quiet',async()=>{
 localStorage.setItem('fia-v3-selected-pack','eng.MRK-1-14-20');const select=vi.spyOn(libraryAdapter,'select').mockRejectedValue(unavailable());
 render(App);await waitFor(()=>expect(select).toHaveBeenCalledTimes(1));expect(select.mock.calls[0][1]).toMatchObject({explicit:false});
 await waitFor(()=>expect(sceneNotices()).toEqual(['Your last passage is not available yet, so Mark 1:1–13 is open.']));
 expect(localStorage.getItem('fia-v3-selected-pack')).toBeNull();
 cleanup();render(App);await settle();await settle();
 expect(select).toHaveBeenCalledTimes(1);expect(sceneNotices()).toEqual([]);
});

it('R1/A3: a restore that only lacked a connection keeps the saved passage for the next launch',async()=>{
 localStorage.setItem('fia-v3-selected-pack','eng.MRK-1-14-20');vi.spyOn(libraryAdapter,'select').mockRejectedValue(refusal('This passage could not be reached. Check your connection and try again. Your current passage stays open.','passage-transient'));
 render(App);await waitFor(()=>expect(sceneNotices()).toEqual(['Your last passage could not be reached, so Mark 1:1–13 is open.']));
 expect(localStorage.getItem('fia-v3-selected-pack')).toBe('eng.MRK-1-14-20');
});

it('R1/A3: a restore aborted by teardown is not a verdict about the passage, so its saved key is kept',async()=>{
 localStorage.setItem('fia-v3-selected-pack','eng.MRK-1-14-20');
 const select=vi.spyOn(libraryAdapter,'select').mockImplementation((_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('The operation was aborted.','AbortError')),{once:true})));
 render(App);await waitFor(()=>expect(select).toHaveBeenCalledTimes(1));
 cleanup();await settle();await settle();
 expect(localStorage.getItem('fia-v3-selected-pack')).toBe('eng.MRK-1-14-20');
});
