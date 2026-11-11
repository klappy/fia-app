import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,cleanup,waitFor} from '@testing-library/svelte';
import {readFileSync} from 'node:fs';
import {tick} from 'svelte';
import App from '../src/App.svelte';
import {libraryAdapter} from '../src/lib/library.js';
import {createSession} from '../src/lib/engine.js';
import {saveProgress} from '../src/lib/session-store.js';
// Restore flash (fia-app-cookbook work/active/2026-11-03-restore-flash-default-passage): a reload onto a saved
// non-default passage shows a neutral restoring state, then the saved passage, and never the bundled default's step.
// The flash's length varied (about 120 ms to 1.1 s), so this asserts absence, not a timing bound.
const registry=JSON.parse(readFileSync('public/content/registry.json','utf8'));
const defaultPassage=/Mark 1:1[–-]13/;
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
it('a reload onto saved Mark 1:14–20 S02-U008 never renders Mark 1:1–13 before the saved passage',async()=>{
 const descriptor=registry.packs.find(p=>p.id==='eng.MRK-1-14-20'),presentation=JSON.parse(readFileSync('public'+descriptor.presentation.url,'utf8'));
 const session=createSession(presentation.activities);session.index=presentation.activities.findIndex(a=>a.id==='S02-U008');session.status='waiting';
 expect(session.index).toBeGreaterThan(0);
 saveProgress(localStorage,descriptor,presentation.activities,{session,muted:true});localStorage.setItem('fia-v3-selected-pack',descriptor.id);
 let answer;vi.spyOn(libraryAdapter,'select').mockImplementation(()=>new Promise(resolve=>answer=resolve));
 vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});
 vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({files:[],savedFiles:[],deliveryRevision:null});
 vi.stubGlobal('Audio',vi.fn());HTMLMediaElement.prototype.pause=vi.fn();Element.prototype.scrollTo=vi.fn();
 // Every paint is watched from before the first one: any frame carrying the default passage is a flash.
 const seen=[];const observer=new MutationObserver(()=>{const text=document.body.textContent;if(defaultPassage.test(text))seen.push(text.slice(0,120));});
 observer.observe(document.body,{subtree:true,childList:true,characterData:true});
 render(App);
 if(defaultPassage.test(document.body.textContent))seen.push('first paint');
 await waitFor(()=>expect(answer).toBeTypeOf('function'));for(let i=0;i<4;i++){await Promise.resolve();await tick();}
 const restoring=document.querySelector('main.scene [data-kind="restoring"]');
 expect(restoring).toBeTruthy();expect(restoring.getAttribute('aria-busy')).toBe('true');
 expect(screen.getByRole('heading',{level:1}).textContent).toBe('Opening your last passage…');
 answer({descriptor,presentation});
 await waitFor(()=>expect(document.querySelector('main.scene [data-kind="restoring"]')).toBeNull());
 const saved=presentation.activities[session.index];expect([saved.title,saved.prompt]).toContain(screen.getByRole('heading',{level:1}).textContent);
 observer.disconnect();
 expect(seen).toEqual([]);
});
