import {it,expect,vi,beforeEach,afterEach} from 'vitest';import {render,cleanup,waitFor} from '@testing-library/svelte';import {webcrypto} from 'node:crypto';
import App from '../src/App.svelte';import {libraryAdapter,bundledPack} from '../src/lib/library.js';import {activities} from '../src/lib/content.js';import {createSession} from '../src/lib/engine.js';import {bundledVisualHarness} from './helpers/bundled-visual.js';
// Node's Response streams yield native typed arrays; use the same realm for the real codec inside jsdom.
beforeEach(()=>{localStorage.clear();vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('Uint8Array',Object.getPrototypeOf(Buffer.prototype).constructor);vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});Element.prototype.scrollTo=vi.fn();HTMLMediaElement.prototype.pause=vi.fn();HTMLMediaElement.prototype.play=vi.fn().mockResolvedValue();});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
function open(){const session=createSession(activities);session.index=activities.findIndex(a=>a.assetId==='a112');session.status='waiting';localStorage.setItem('fia-v3-session@2',JSON.stringify({session}));render(App);}
it('qualified actual static manifest and worker bytes render online through the current authored App binding',async()=>{
 const h=bundledVisualHarness({defaultPack:true}),revision=h.pin.visualPublication.presentationRevision;expect(revision).toBe(bundledPack.revision);
 const checked=await h.message('MEDIA_STATUS',{revision});expect(checked.ok,JSON.stringify(checked)).toBe(true);vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});vi.spyOn(libraryAdapter,'mediaStatus').mockImplementation(()=>h.message('MEDIA_STATUS',{revision}));
 const play=vi.spyOn(libraryAdapter,'playMedia').mockImplementation(async(pack,path,deliveryRevision)=>h.message('MEDIA_PLAY',{revision,path,deliveryRevision,requestId:'app-view'}));
 vi.stubGlobal('URL',class extends URL{static createObjectURL(){return 'blob:qualified-bundled-static';}static revokeObjectURL(){}});
 open();await waitFor(()=>expect(document.querySelector('.visual-explorer img')?.getAttribute('src')).toBe('blob:qualified-bundled-static'),{timeout:10000});expect(play.mock.calls[0][1]).toBe(h.pin.path);
},20000);
it('cold offline App restores actual worker-saved qualified bundled binding without publisher or online playback',async()=>{
 const h=bundledVisualHarness({defaultPack:true}),revision=h.pin.visualPublication.presentationRevision;const saved=await h.message('DOWNLOAD_START',{selection:'all',sizes:{image:'prepared'}});expect(saved.ok,JSON.stringify(saved)).toBe(true);expect(saved.saved).toBe(true);h.offline(true);
 vi.spyOn(libraryAdapter,'downloadStatus').mockImplementation(()=>h.message('DOWNLOAD_STATUS'));vi.spyOn(libraryAdapter,'mediaStatus').mockRejectedValue(Object.assign(Error('offline'),{code:'media-status-transient'}));const play=vi.spyOn(libraryAdapter,'playMedia');
 open();await waitFor(()=>expect(document.querySelector('.visual-explorer img')?.getAttribute('src')).toBe(h.pin.path),{timeout:10000});expect(play).not.toHaveBeenCalled();expect(h.calls.every(u=>!u.includes('publisher')&&!u.includes('s3.amazonaws'))).toBe(true);
},20000);
