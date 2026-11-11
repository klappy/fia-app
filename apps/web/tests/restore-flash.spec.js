import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,cleanup,waitFor,fireEvent} from '@testing-library/svelte';
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
afterEach(()=>{delete document.modelContext;cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
it('a reload onto saved Mark 1:14–20 S02-U008 never renders Mark 1:1–13 before the saved passage',async()=>{
 const descriptor=registry.packs.find(p=>p.id==='eng.MRK-1-14-20'),presentation=JSON.parse(readFileSync('public'+descriptor.presentation.url,'utf8'));
 const session=createSession(presentation.activities);session.index=presentation.activities.findIndex(a=>a.id==='S02-U008');session.status='waiting';
 expect(session.index).toBeGreaterThan(0);
 saveProgress(localStorage,descriptor,presentation.activities,{session,muted:true});localStorage.setItem('fia-v3-selected-pack',descriptor.id);
 // The bundled passage's own stored place keeps a pinned resource: it must not show beside the restoring state either.
 const bundled=registry.packs.find(p=>p.id==='eng.MRK-1-1-13'),bundledPresentation=JSON.parse(readFileSync('public'+bundled.presentation.url,'utf8'));
 const bundledSession=createSession(bundledPresentation.activities),focal=bundledPresentation.activities[0].assetId;
 bundledSession.pinned=Object.entries(bundledPresentation.assets).find(([id,a])=>id!==focal&&a.src&&a.kind==='image')[0];
 saveProgress(localStorage,bundled,bundledPresentation.activities,{session:bundledSession,muted:true});
 // WebMCP tools answer truthfully while restoring: no false success on the hidden bundled passage.
 const tools=new globalThis.Map();document.modelContext={registerTool:tool=>{tools.set(tool.name,tool);}};
 let answer;vi.spyOn(libraryAdapter,'select').mockImplementation(()=>new Promise(resolve=>answer=resolve));
 vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});
 vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({files:[],savedFiles:[],deliveryRevision:null});
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
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
 // No control acts on the hidden bundled passage while restoring: nothing navigates, nothing persists its progress.
 const bundledProgress=()=>Object.keys(localStorage).filter(k=>k.startsWith('fia-v3-progress@1:')&&!k.endsWith(descriptor.id)).map(k=>localStorage.getItem(k));
 const before=bundledProgress(),savedBefore=localStorage.getItem('fia-v3-progress@1:'+descriptor.id);
 const nav=document.querySelector('nav.scene-controls');
 const others=[...nav.querySelectorAll('button')].filter(b=>!b.classList.contains('guide-primary'));expect(others.length).toBeGreaterThanOrEqual(4);
 for(const b of others){expect({label:b.getAttribute('aria-label'),disabled:b.disabled}).toEqual({label:b.getAttribute('aria-label'),disabled:true});await fireEvent.click(b);}
 // The primary only queues its tap while verifying; it never acts on the bundled passage.
 await fireEvent.click(nav.querySelector('.guide-primary'));
 for(let i=0;i<4;i++){await Promise.resolve();await tick();}
 expect(document.querySelector('main.scene [data-kind="restoring"]')).toBeTruthy();expect(document.querySelector('dialog[open]')).toBeNull();
 expect(bundledProgress()).toEqual(before);expect(localStorage.getItem('fia-v3-progress@1:'+descriptor.id)).toBe(savedBefore);
 expect(document.querySelector('.kept-content')).toBeNull();
 const asset=Object.keys(presentation.assets)[0];
 // fia_read_session must not report the hidden bundled passage's activity or stage (Codex review 4542189818 on #385).
 for(const [name,input] of [['fia_read_session',{}],['fia_present_resource',{assetId:asset}],['fia_return_to_guide',{}],['fia_complete_activity',{activityId:'S02-U008'}]])
  await expect((async()=>tools.get(name).execute(input))(),name).rejects.toThrow('The saved passage is still opening. Try again.');
 expect(localStorage.getItem('fia-v3-progress@1:'+descriptor.id)).toBe(savedBefore);
 answer({descriptor,presentation});
 await waitFor(()=>expect(document.querySelector('main.scene [data-kind="restoring"]')).toBeNull());
 const saved=presentation.activities[session.index];expect([saved.title,saved.prompt]).toContain(screen.getByRole('heading',{level:1}).textContent);
 expect(tools.get('fia_read_session').execute({}).activityId).toBe('S02-U008');
 observer.disconnect();
 expect(seen).toEqual([]);
});
