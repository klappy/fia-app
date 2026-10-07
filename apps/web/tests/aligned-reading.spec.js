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
const playback=(elapsed=time,playing=true,src=asset.descriptionAudio)=>({src,elapsed,playing});
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
 await view.rerender({asset,playback:playback(time,true,'/audio/source/S01-U002.mp3')});expect(scroll).not.toHaveBeenCalled();expect(document.querySelector('[aria-current=true]')).toBeNull();
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
 const view=render(AlignedReading,{asset:guide,playback:{src:'/guide.mp3',elapsed:50,duration:100,playing:true}});await tick();
 expect(scroll).toHaveBeenLastCalledWith({top:12,behavior:'smooth'});
 expect(screen.getByRole('region',{name:'Guide text'}).textContent.trim()).toBe(guide.text);
 await fireEvent.wheel(screen.getByRole('region'));scroll.mockClear();
 await view.rerender({asset:guide,playback:{src:'/guide.mp3',elapsed:90,duration:100,playing:true}});expect(scroll).not.toHaveBeenCalled();
 await fireEvent.click(screen.getByRole('button',{name:'Follow reading'}));expect(scroll).toHaveBeenLastCalledWith({top:24,behavior:'smooth'});
});

it('follows the current list item and preserves manual scrolling across recording changes',async()=>{
 const roster={id:'intro',kind:'guide',text:'Characters:',list:[{id:'one',text:'John'},{id:'two',text:'Jesus'}],activeItemId:'one',descriptionAudio:'/one.mp3'};
 const view=render(AlignedReading,{asset:roster,playback:playback(0,true,'/one.mp3')});await tick();
 expect(document.querySelector('li[aria-current=true]').textContent).toBe('John');
 expect(scroll).toHaveBeenCalled();await fireEvent.wheel(screen.getByRole('region'));scroll.mockClear();
 await view.rerender({asset:{...roster,activeItemId:'two',descriptionAudio:'/two.mp3'},playback:playback(0,true,'/two.mp3')});await tick();
 expect(document.querySelector('li[aria-current=true]').textContent).toBe('Jesus');expect(scroll).not.toHaveBeenCalled();
 await fireEvent.click(screen.getByRole('button',{name:'Follow reading'}));expect(scroll).toHaveBeenCalled();
});
