import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,fireEvent,screen,cleanup} from '@testing-library/svelte';
import {tick} from 'svelte';
import AlignedReading from '../src/components/AlignedReading.svelte';
import {assets} from '../src/lib/content.js';
// Reading tests verify target selection and manual control; frame interpolation is
// exercised independently in smooth-follow.test.js.
vi.mock('../src/lib/smooth-follow.js',()=>({createSmoothFollow:viewport=>({
 to:(top,reduced)=>viewport.scrollTo({top,behavior:reduced?'instant':'smooth'}),stop:()=>{}
})}));
const asset=assets['scripture-unfoldingWordSimplified'];
const time=asset.alignment.verses[4].words[12].start;
// A clip names the asset it voices (R2): reading follows that identity, never the URL it plays from.
const playback=(elapsed=time,playing=true,src=asset.descriptionAudio,assetId=asset.id)=>({src,assetId,elapsed,playing});
let scroll;
if(!Element.prototype.scrollTo)Element.prototype.scrollTo=function(){};
beforeEach(()=>{
 scroll=vi.spyOn(Element.prototype,'scrollTo').mockImplementation(function(options){this.scrollTop=options.top;});
 vi.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(){return this.classList?.contains('scripture-scroll')?{top:0,height:400,bottom:400}:{top:600,bottom:630,height:30};});
 vi.spyOn(Element.prototype,'scrollHeight','get').mockReturnValue(3000);
 vi.spyOn(Element.prototype,'clientHeight','get').mockReturnValue(400);
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('uses the current recording time to follow a line within a long verse',async()=>{
 render(AlignedReading,{asset,playback:playback()});await tick();
 expect(scroll).toHaveBeenCalledWith({top:415,behavior:'smooth'});
 expect(document.querySelector('p[aria-current=true]').textContent).toContain(asset.verses[4].text);
});
it('manual scrolling yields permanently until Follow reading is requested',async()=>{
 const view=render(AlignedReading,{asset,playback:playback()});await tick();scroll.mockClear();
 await fireEvent.wheel(screen.getByRole('region'));scroll.mockClear();await view.rerender({asset,playback:playback(time+1)});await tick();
 expect(scroll).not.toHaveBeenCalled();await fireEvent.click(screen.getByRole('button',{name:'Follow reading'}));expect(scroll).toHaveBeenCalled();
});
it('touch and keyboard scrolling yield without moving focus or changing playback',async()=>{
 const view=render(AlignedReading,{asset,playback:playback()});await tick();scroll.mockClear();
 const region=screen.getByRole('region');region.focus();await fireEvent.keyDown(region,{key:'PageDown'});scroll.mockClear();await view.rerender({asset,playback:playback(time+2)});expect(scroll).not.toHaveBeenCalled();expect(document.activeElement).toBe(region);
 await fireEvent.click(screen.getByRole('button',{name:'Follow reading'}));scroll.mockClear();await fireEvent.touchStart(region);scroll.mockClear();await view.rerender({asset,playback:playback(time+3)});expect(scroll).not.toHaveBeenCalled();
});
it('pause, unrelated audio and open sheets cannot move the reading viewport',async()=>{
 const view=render(AlignedReading,{asset,playback:playback(time,false)});await tick();expect(scroll).not.toHaveBeenCalled();
 await view.rerender({asset,playback:playback(time,true,'/audio/source/S01-U002.mp3','S01-U002')});expect(scroll).not.toHaveBeenCalled();expect(document.querySelector('[aria-current=true]')).toBeNull();
 await view.rerender({asset,playback:playback(),suspended:true});expect(scroll).not.toHaveBeenCalled();
 await view.rerender({asset,playback:playback(),suspended:false});expect(scroll).toHaveBeenCalled();
});
it('reduced motion uses instant positioning and absent alignment leaves ordinary text',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 const view=render(AlignedReading,{asset,playback:playback()});await tick();expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({behavior:'instant'}));scroll.mockClear();
 await view.rerender({asset:{...asset,alignment:undefined},playback:playback()});expect(scroll).not.toHaveBeenCalled();expect(screen.getByRole('region').textContent).toContain(asset.verses[0].text);expect(document.querySelector('[data-align-word]')).toBeNull();
});
it('content that fits requires neither scrolling nor a follow control',async()=>{
 vi.spyOn(Element.prototype,'scrollHeight','get').mockReturnValue(400);render(AlignedReading,{asset,playback:playback()});await tick();await fireEvent.wheel(screen.getByRole('region'));expect(scroll).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Follow reading'})).toBeNull();
});
it('untimed guide text scrolls slight overflow and yields to manual exploration',async()=>{
 vi.spyOn(Element.prototype,'scrollHeight','get').mockReturnValue(424);
 const guide={id:'guide-test',kind:'guide',text:'A long original guide paragraph.',descriptionAudio:'/guide.mp3'};
 const view=render(AlignedReading,{asset:guide,playback:{src:'/guide.mp3',assetId:guide.id,elapsed:50,duration:100,playing:true}});await tick();
 expect(scroll).toHaveBeenLastCalledWith({top:12,behavior:'smooth'});
 expect(screen.getByRole('region',{name:'Guide text'}).textContent.trim()).toBe(guide.text);
 await fireEvent.wheel(screen.getByRole('region'));scroll.mockClear();
 await view.rerender({asset:guide,playback:{src:'/guide.mp3',assetId:guide.id,elapsed:90,duration:100,playing:true}});expect(scroll).not.toHaveBeenCalled();
 await fireEvent.click(screen.getByRole('button',{name:'Follow reading'}));expect(scroll).toHaveBeenLastCalledWith({top:24,behavior:'smooth'});
});

it('follows the current list item and preserves manual scrolling across recording changes',async()=>{
 const roster={id:'intro',kind:'guide',text:'Characters:',list:[{id:'one',text:'John'},{id:'two',text:'Jesus'}],activeItemId:'one',descriptionAudio:'/one.mp3'};
 const view=render(AlignedReading,{asset:roster,playback:playback(0,true,'/one.mp3',roster.id)});await tick();
 expect(document.querySelector('li[aria-current=true]').textContent).toBe('John');
 expect(scroll).toHaveBeenCalled();await fireEvent.wheel(screen.getByRole('region'));scroll.mockClear();
 await view.rerender({asset:{...roster,activeItemId:'two',descriptionAudio:'/two.mp3'},playback:playback(0,true,'/two.mp3',roster.id)});await tick();
 expect(document.querySelector('li[aria-current=true]').textContent).toBe('Jesus');expect(scroll).not.toHaveBeenCalled();
 await fireEvent.click(screen.getByRole('button',{name:'Follow reading'}));expect(scroll).toHaveBeenCalled();
});

it('untimed guide text follows the clip being spoken, not the shared recording file',async()=>{
 // Mark 1:1-13 S02-U010: 304.51-403.61 s of one 498.77 s recording.
 const guide={id:'guide-clip',kind:'guide',text:'A long original guide paragraph.',descriptionAudio:'/guide.mp3'};
 const clip=seconds=>({src:'/guide.mp3',assetId:guide.id,playing:true,elapsed:304.51+seconds,duration:498.77,progressElapsed:seconds,progressDuration:99.1});
 const view=render(AlignedReading,{asset:guide,playback:clip(0)});await tick();
 expect(scroll).not.toHaveBeenCalled();
 await view.rerender({asset:guide,playback:clip(49.55)});await tick();expect(scroll).toHaveBeenLastCalledWith({top:1300,behavior:'smooth'});
 await view.rerender({asset:guide,playback:clip(89.19)});await tick();expect(scroll).toHaveBeenLastCalledWith({top:2600,behavior:'smooth'});
});
it('passage-only Scripture without word timing follows its excerpt',async()=>{
 const passage={...asset,alignment:undefined};
 const excerpt=seconds=>({src:asset.descriptionAudio,assetId:asset.id,playing:true,elapsed:96.8+seconds,duration:160,progressElapsed:seconds,progressDuration:47.575});
 const view=render(AlignedReading,{asset:passage,playback:excerpt(.3)});await tick();
 expect(scroll).not.toHaveBeenCalled();
 await view.rerender({asset:passage,playback:excerpt(47.575*.5)});await tick();expect(scroll).toHaveBeenLastCalledWith({top:1300,behavior:'smooth'});
});
// GAP-R2 (DEV proof of e78c1f7): a server passage plays its bound recording from a blob: URL and the
// served asset names no recording path, so a URL comparison never matched and the text never moved.
it('R2: a server passage playing from a blob URL follows its excerpt by asset identity',async()=>{
 // Mark 1:14–20 BSB as served: no recording path and no word timing on the asset; 96.8–144.375 s of the bound recording.
 const passage={...asset,alignment:undefined,descriptionAudio:undefined};
 const excerpt=seconds=>({src:'blob:https://dev.fiaguide.app/bound-recording',assetId:passage.id,playing:true,elapsed:96.8+seconds,duration:321,progressElapsed:seconds,progressDuration:47.575});
 const view=render(AlignedReading,{asset:passage,playback:excerpt(.3)});await tick();
 expect(scroll).not.toHaveBeenCalled();
 await view.rerender({asset:passage,playback:excerpt(47.575*.5)});await tick();expect(scroll).toHaveBeenLastCalledWith({top:1300,behavior:'smooth'});
 await fireEvent.wheel(screen.getByRole('region'));expect(screen.getByRole('button',{name:'Follow reading'})).toBeTruthy();
});
it('R2: a clip that voices another asset never moves this reading, even from the same URL',async()=>{
 const view=render(AlignedReading,{asset,playback:playback(time,true,asset.descriptionAudio,'scripture-BereanStandardBible')});await tick();
 expect(scroll).not.toHaveBeenCalled();expect(document.querySelector('[aria-current=true]')).toBeNull();
 await view.rerender({asset,playback:playback()});await tick();expect(scroll).toHaveBeenCalled();
});
it('word gaps hold the last spoken line and the verse stays marked between verses',async()=>{
 // Two-line verses: words 0-1 on the first line, word 2 on the second. The verse
 // paragraph centre sits between them, above the second line.
 const verses=[{number:1,text:'one two three'},{number:2,text:'four five six'}];
 const words=(start,text)=>{let at=0;return text.split(' ').map((w,i)=>{const from=text.indexOf(w,at);at=from+w.length;return {from,to:at,start:start+i,end:start+i+.6};});};
 const alignment={schemaVersion:2,duration:20,verses:[{start:1,end:3.6,highlightMode:'word',words:words(1,verses[0].text)},{start:5,end:7.6,highlightMode:'word',words:words(5,verses[1].text)}]};
 const timed={id:'gap-test',kind:'scripture',verses,alignment,descriptionAudio:'/gap.opus'};
 vi.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(){
  if(this.classList?.contains('scripture-scroll'))return {top:0,height:400,bottom:400};
  const top=this.closest('.scripture-scroll')?.scrollTop||0,word=this.dataset?.alignWord;
  if(word){const [v,w]=word.split('-').map(Number);const y=600+v*80+(w>=2?40:0)-top;return {top:y,bottom:y+30,height:30};}
  const v=[...(this.parentElement?.children||[])].filter(e=>e.tagName==='P').indexOf(this);const y=600+Math.max(0,v)*80-top;return {top:y,bottom:y+70,height:70};
 });
 const at=elapsed=>({src:'/gap.opus',assetId:timed.id,playing:true,elapsed});
 const view=render(AlignedReading,{asset:timed,playback:at(3.1)});await tick();
 const tops=()=>scroll.mock.calls.map(([o])=>o.top);
 for(const t of [3.3,3.7,4.2,4.9,5.1,5.4,5.7,6.2,7.1])await view.rerender({asset:timed,playback:at(t)});
 await tick();
 const seen=tops();expect(seen.length).toBeGreaterThan(1);
 seen.forEach((top,i)=>{if(i)expect(top).toBeGreaterThanOrEqual(seen[i-1]);});
 await view.rerender({asset:timed,playback:at(4.2)});await tick();
 expect(document.querySelector('p[aria-current=true]')?.textContent).toContain('one two three');
});
