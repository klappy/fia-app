import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,fireEvent,screen,cleanup} from '@testing-library/svelte';
import {tick} from 'svelte';
import App from '../src/App.svelte';
import {libraryAdapter,bundledPack} from '../src/lib/library.js';
import {activities,assets} from '../src/lib/content.js';
import {createSession} from '../src/lib/engine.js';
const audio=vi.hoisted(()=>({play:vi.fn(),pause:vi.fn(),resume:vi.fn(),stop:vi.fn(),active:false,playing:false,end:null,state:null}));
vi.mock('../src/lib/audio.js',()=>({createAudioController:(state,end)=>{audio.state=state;audio.end=end;return audio;}}));
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
 audio.state({src:'blob:range',elapsed:5.5,duration:20,progressElapsed:2.5,progressDuration:5,playing:true});await settle();
 const circle=document.querySelector('.playback-arc'),circumference=Number(circle.getAttribute('stroke-dasharray'));
 expect(Number(circle.getAttribute('stroke-dashoffset'))/circumference).toBeCloseTo(0.5);
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

const bsb=assets['scripture-BereanStandardBible'];
function officialFixture(){
 const alignment={...structuredClone(bsb.alignment),schemaVersion:2,clockDomain:'delivery-media-seconds',duration:400,audioSha256:'b'.repeat(64)};
 alignment.verses=alignment.verses.map((v,i)=>({...v,start:100+i*10,end:109+i*10,highlightMode:'verse',reason:'Explicit test fallback',words:[]}));
 return {...descriptor,path:bsb.descriptionAudio,mime:'audio/ogg',sha256:'b'.repeat(64),playbackRange:{startSeconds:100,endSeconds:229},timing:{mapping:{scale:1,offsetSeconds:20}},scriptureAlignment:alignment,scriptureAlignmentSha256:'c'.repeat(64)};
}
async function mountScripture(){const session=createSession(activities);session.index=activities.findIndex(a=>a.id==='S01-U002-reading-1');localStorage.setItem('fia-v3-session@2',JSON.stringify({session,muted:true}));render(App);await settle();}
function currentVerse(){return [...document.querySelectorAll('.reading-verses > p')].findIndex(p=>p.getAttribute('aria-current')==='true');}
for(const offline of [false,true])it(`uses verified ${offline?'offline':'online'} Scripture overlay and output clock without inverse mapping`,async()=>{
 const file=officialFixture();
 if(offline){libraryAdapter.downloadStatus.mockResolvedValue({saved:true,active:{manifest:{presentationRevision:bundledPack.revision,files:[file]},files:[file]}});libraryAdapter.mediaStatus.mockResolvedValue({deliveryRevision:null,files:[]});}
 else{libraryAdapter.mediaStatus.mockResolvedValue({deliveryRevision:'d'.repeat(64),files:[file]});vi.spyOn(libraryAdapter,'playMedia').mockResolvedValue({...file,bytes:new Uint8Array(3)});}
 await mountScripture();await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();
 expect(audio.play).toHaveBeenCalledWith(expect.any(String),offline?file.path:'blob:range',1,file.playbackRange);
 audio.state({src:offline?file.path:'blob:range',elapsed:111,duration:400,progressElapsed:11,progressDuration:129,playing:false});await settle();
 const circle=document.querySelector('.playback-arc'),circumference=Number(circle.getAttribute('stroke-dasharray'));
 expect(Number(circle.getAttribute('stroke-dashoffset'))/circumference).toBeCloseTo(1-11/129);
 expect(currentVerse()).toBe(1);expect(document.querySelectorAll('[data-align-word]').length).toBe(0);
});
it('clears Scripture overlay on navigation before returning to the same recording',async()=>{
 const file=officialFixture();libraryAdapter.mediaStatus.mockResolvedValue({deliveryRevision:'d'.repeat(64),files:[file]});vi.spyOn(libraryAdapter,'playMedia').mockResolvedValue({...file,bytes:new Uint8Array(3)});
 await mountScripture();await fireEvent.click(screen.getByRole('button',{name:'Play',exact:true}));await settle();
 audio.state({src:'blob:range',elapsed:111,duration:400,playing:false});await settle();expect(currentVerse()).toBe(1);
 await fireEvent.click(screen.getByRole('button',{name:'Skip to next activity'}));await settle();
 await fireEvent.click(screen.getByRole('button',{name:'Previous activity'}));await settle();
 expect(document.querySelectorAll('[data-align-word]').length).toBeGreaterThan(0);
 audio.state({src:bsb.descriptionAudio,elapsed:bsb.alignment.verses[1].start,duration:400,playing:false});await settle();expect(currentVerse()).toBe(1);
});
it('rejects altered saved Scripture alignment even when the descriptor hash field is unchanged',async()=>{
 const file=officialFixture(),altered=structuredClone(file);altered.scriptureAlignment.verses[0].start=99;
 libraryAdapter.downloadStatus.mockResolvedValue({saved:true,active:{manifest:{presentationRevision:bundledPack.revision,files:[file]},files:[altered]}});
 await mountScripture();expect(document.querySelectorAll('[data-align-word]').length).toBeGreaterThan(0);expect(audio.play).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Play',exact:true})).toBeNull();
});
