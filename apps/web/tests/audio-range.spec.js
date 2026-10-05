import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,fireEvent,screen,cleanup} from '@testing-library/svelte';
import {tick} from 'svelte';
import App from '../src/App.svelte';
import {libraryAdapter,bundledPack} from '../src/lib/library.js';
import {activities} from '../src/lib/content.js';
import {createSession} from '../src/lib/engine.js';
const audio=vi.hoisted(()=>({play:vi.fn(),pause:vi.fn(),resume:vi.fn(),stop:vi.fn(),active:false,playing:false,end:null}));
vi.mock('../src/lib/audio.js',()=>({createAudioController:(_state,end)=>{audio.end=end;return audio;}}));
const range={startSeconds:3,endSeconds:8},timing={mapping:{scale:1,offsetSeconds:0}};
const path=activities[0].audioSrc,descriptor={path,sha256:'a'.repeat(64),bytes:3,mime:'audio/mpeg',playbackRange:range,timing};
const settle=async()=>{for(let i=0;i<5;i++){await tick();await Promise.resolve();}};
beforeEach(()=>{
 localStorage.clear();vi.clearAllMocks();audio.active=false;audio.playing=false;
 const session=createSession(activities);localStorage.setItem('fia-v3-session@2',JSON.stringify({session,muted:true}));
 vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});
 vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({deliveryRevision:'d'.repeat(64),files:[]});
 vi.stubGlobal('URL',class extends URL{static createObjectURL(){return 'blob:range';}static revokeObjectURL(){}});
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 HTMLMediaElement.prototype.pause=vi.fn();HTMLMediaElement.prototype.play=vi.fn(()=>Promise.resolve());Element.prototype.scrollTo=vi.fn();
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('forwards verified online range only after explicit manual Play and holds completion',async()=>{
 libraryAdapter.mediaStatus.mockResolvedValue({deliveryRevision:'d'.repeat(64),files:[descriptor]});
 const fetch=vi.spyOn(libraryAdapter,'playMedia').mockResolvedValue({bytes:new Uint8Array(3),mime:'audio/mpeg',timing,playbackRange:range});
 render(App);await settle();expect(audio.play).not.toHaveBeenCalled();await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();
 expect(fetch).toHaveBeenCalledTimes(1);expect(audio.play).toHaveBeenCalledWith(expect.any(String),'blob:range',1,range);
 audio.end();await settle();expect(audio.play).toHaveBeenCalledTimes(1);expect(screen.getByRole('button',{name:'Continue',exact:true})).toBeTruthy();
});
it('forwards selected verified offline descriptor rather than asynchronous savedMedia',async()=>{
 libraryAdapter.downloadStatus.mockResolvedValue({saved:true,active:{manifest:{presentationRevision:bundledPack.revision,files:[descriptor]},files:[descriptor]}});
 libraryAdapter.mediaStatus.mockResolvedValue({deliveryRevision:null,files:[],savedFiles:[{...descriptor,playbackRange:{startSeconds:12,endSeconds:15}}]});
 render(App);await settle();await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();expect(audio.play).toHaveBeenCalledWith(expect.any(String),path,1,range);
});
it('refuses an offline range not bound to the selected manifest descriptor',async()=>{
 libraryAdapter.downloadStatus.mockResolvedValue({saved:true,active:{manifest:{presentationRevision:bundledPack.revision,files:[descriptor]},files:[{...descriptor,playbackRange:{startSeconds:4,endSeconds:9}}]}});
 render(App);await settle();expect(screen.getByRole('button',{name:'Play',exact:true}).disabled).toBe(true);expect(audio.play).not.toHaveBeenCalled();
});
