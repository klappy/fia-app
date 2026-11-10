// Codex P2 (round 2) on #356: every surface that prints an asset or key-term title in a Spanish pack carries the
// '[ES needed]' marker the compiler recorded, not only the reading identification and the stage caption. The More ->
// Passage resources sheet is rendered for a Spanish pack and read back; the helper is checked on its own.
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,within} from '@testing-library/svelte';
import {readFileSync} from 'node:fs';
import App from '../src/App.svelte';
import {libraryAdapter} from '../src/lib/library.js';
import {MARKER,displayTitle,titleMarker} from '../src/lib/spanish-coverage.js';
const registry=JSON.parse(readFileSync('public/content/registry.json','utf8'));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
it('the Passage resources sheet prints [ES needed] beside every English-fallback title of a Spanish pack and nothing beside a Spanish one',async()=>{
 const id='spa.MRK-1-1-13';
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 const descriptor=registry.packs.find(p=>p.id===id),presentation=JSON.parse(readFileSync('public'+descriptor.presentation.url,'utf8'));
 localStorage.setItem('fia-v3-selected-pack',id);vi.spyOn(libraryAdapter,'select').mockResolvedValue({descriptor,presentation});
 vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue({saved:false});vi.spyOn(libraryAdapter,'mediaStatus').mockResolvedValue({files:[],savedFiles:[],deliveryRevision:null});vi.spyOn(libraryAdapter,'activate').mockResolvedValue({selected:true});
 vi.stubGlobal('Audio',vi.fn());HTMLMediaElement.prototype.pause=vi.fn();Element.prototype.scrollTo=vi.fn();render(App);
 await waitFor(()=>expect(screen.getByRole('heading',{level:1}).textContent).toBe(presentation.activities[0].prompt));
 await fireEvent.click(screen.getByRole('button',{name:'More options'}));await fireEvent.click(screen.getByRole('button',{name:'Passage resources',exact:true}));
 const assets=Object.values(presentation.assets),fallback=assets.filter(a=>a.spanishText&&a.spanishText!=='present'),present=assets.filter(a=>a.spanishText==='present');
 expect(fallback.map(a=>a.id)).toEqual(expect.arrayContaining(['term-spa-t92','term-spa-t145','c201']));expect(present.some(a=>a.kind==='term')).toBe(true);
 for(const [kind,label] of [['map','Maps'],['image','Images'],['video','Videos'],['term','Word meanings']]){
  const summary=screen.getByText(label,{selector:'summary'});await fireEvent.click(summary);
  const names=within(summary.parentElement).queryAllByRole('button').map(b=>b.textContent.trim());
  expect(names).toHaveLength(assets.filter(a=>a.kind===kind).length);
  for(const a of fallback.filter(a=>a.kind===kind))expect(names).toContain(a.title+' '+MARKER);
  for(const a of present.filter(a=>a.kind===kind)){expect(names).toContain(a.title);expect(names).not.toContain(a.title+' '+MARKER);}
  for(const name of names)expect(name).not.toBe('FIA Key Terms');
 }
});
it('displayTitle and titleMarker print the marker only when the pack records that English is shown',()=>{
 expect(displayTitle({title:'Ángel',spanishText:'present'})).toBe('Ángel');expect(titleMarker({title:'Ángel',spanishText:'present'})).toBe('');
 expect(displayTitle({title:'messiah',spanishText:'english-fallback'})).toBe('messiah '+MARKER);expect(displayTitle({title:'Nazareth and Judea',spanishText:'missing'})).toBe('Nazareth and Judea '+MARKER);
 expect(displayTitle({title:'Holy Spirit'})).toBe('Holy Spirit');expect(displayTitle({title:'',spanishText:'missing'})).toBe(MARKER);expect(displayTitle(null)).toBe('');
});
