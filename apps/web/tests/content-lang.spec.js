// Passage content carries its passage language's tag so a screen reader reads Spanish text with Spanish rules, while the
// interface chrome keeps the page's own language (fia-app-cookbook work/active/2026-11-11-fia-content-lang-attribute).
// Same-reference English and Spanish packs from the shipped registry; the tag comes from the catalog's language list.
import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,screen,cleanup,waitFor} from '@testing-library/svelte';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
const audio=vi.hoisted(()=>({play:vi.fn(),pause:vi.fn(),resume:vi.fn(),stop:vi.fn(),active:false}));
vi.mock('../src/lib/audio.js',()=>({createAudioController:(state,end)=>{audio.state=state;audio.end=end;return audio;}}));
import App from '../src/App.svelte';import ResourceIdentification from '../src/components/ResourceIdentification.svelte';import {libraryAdapter,contentLang,passageLanguages,assetLang} from '../src/lib/library.js';import {MARKER} from '../src/lib/spanish-coverage.js';
const registry=JSON.parse(readFileSync('public/content/registry.json','utf8')),h='a'.repeat(64);
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
it('the catalog language list names a BCP 47 tag for every passage language, and nothing for an unknown one',()=>{
 expect(contentLang('eng')).toBe('en');expect(contentLang('spa')).toBe('es');expect(contentLang('xyz')).toBeUndefined();
 for(const p of registry.packs)expect(passageLanguages.map(l=>l.id)).toContain(p.language);
});
it.each([['eng.MRK-1-14-20','en'],['spa.MRK-1-14-20','es']])('%s: passage content carries lang="%s", interface chrome keeps the page language',async(id,tag)=>{
 load(id);render(App);
 await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(presentation.activities[0].prompt));
 const content=document.querySelector('.reading-verses');expect(content).toBeTruthy();
 expect(content.getAttribute('lang')).toBe(tag);
 expect(screen.getByRole('heading',{level:1}).getAttribute('lang')).toBe(tag);
 // Chrome: the reading region's own label, the session controls and the document stay outside the passage language.
 expect(document.querySelector('.scripture-scroll').hasAttribute('lang')).toBe(false);
 expect(document.querySelector('nav.scene-controls').closest('[lang]')).toBeNull();
 expect(document.documentElement.lang).not.toBe('es');
});
it('inside a Spanish passage, the chrome group label and an English-fallback title with its [ES needed] marker carry lang="en"; a Spanish title keeps "es"',()=>{
 const pack=JSON.parse(readFileSync('public'+registry.packs.find(p=>p.id==='spa.MRK-1-1-13').presentation.url,'utf8'));
 const assets=Object.values(pack.assets),fallback=assets.find(a=>a.kind==='term'&&a.spanishText==='english-fallback'),present=assets.find(a=>a.kind==='term'&&a.spanishText==='present');
 expect(fallback?.titleProvenance?.fallback).toBe('eng');expect(present).toBeTruthy();
 expect(assetLang(fallback,'es')).toBe('en');expect(assetLang(present,'es')).toBe('es');expect(assetLang(present,undefined)).toBeUndefined();
 const context=new Map([['fia-content-lang',()=>'es']]);
 const {container}=render(ResourceIdentification,{props:{asset:fallback},context});
 const group=container.querySelector('.reading-identification'),title=group.querySelector('h2');
 expect(group.getAttribute('aria-label')).toBe('Key term source');expect(group.getAttribute('lang')).toBe('en');
 expect(title.textContent).toContain(MARKER);expect(title.getAttribute('lang')).toBe('en');
 cleanup();const spanish=render(ResourceIdentification,{props:{asset:present},context}).container.querySelector('h2');
 expect(spanish.textContent).not.toContain(MARKER);expect(spanish.getAttribute('lang')).toBe('es');
});
