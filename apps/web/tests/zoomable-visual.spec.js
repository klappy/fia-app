import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,fireEvent,screen,cleanup} from '@testing-library/svelte';
import ZoomableVisual from '../src/components/ZoomableVisual.svelte';
const asset={id:'map',title:'Map',kind:'map',description:'Source map',src:'/map.png'};
beforeEach(()=>{
 vi.spyOn(Element.prototype,'getBoundingClientRect').mockReturnValue({width:400,height:400,top:0,left:0,bottom:400,right:400});
 Element.prototype.setPointerCapture=vi.fn();
 vi.stubGlobal('PointerEvent',class extends MouseEvent{constructor(type,options={}){super(type,options);this.pointerId=options.pointerId||1;}});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('zoom, drag, reset and keyboard pan work only in the expanded view',async()=>{
 render(ZoomableVisual,{asset,fullscreen:true});const region=screen.getByRole('region');const img=screen.getByRole('img');await fireEvent.keyDown(region,{key:'+'});await fireEvent.keyDown(region,{key:'+'});
 await fireEvent.pointerDown(region,{pointerId:1,clientX:200,clientY:200});await fireEvent.pointerMove(region,{pointerId:1,clientX:230,clientY:220});await fireEvent.pointerUp(region,{pointerId:1});expect(img.style.transform).toBe('translate(30px,20px) scale(2)');
 await fireEvent.keyDown(region,{key:'ArrowLeft'});expect(img.style.transform).toBe('translate(90px,20px) scale(2)');await fireEvent.keyDown(region,{key:'0'});expect(img.style.transform).toBe('translate(0px,0px) scale(1)');
});
it('two-finger pinch zooms at the gesture center and wheel zoom works in full screen',async()=>{
 render(ZoomableVisual,{asset,fullscreen:true});const region=screen.getByRole('region');const img=screen.getByRole('img');
 await fireEvent.pointerDown(region,{pointerId:1,clientX:100,clientY:200});await fireEvent.pointerDown(region,{pointerId:2,clientX:300,clientY:200});await fireEvent.pointerMove(region,{pointerId:2,clientX:400,clientY:200});expect(img.style.transform).toBe('translate(50px,0px) scale(1.5)');
 await fireEvent.pointerCancel(region,{pointerId:1});await fireEvent.pointerCancel(region,{pointerId:2});await fireEvent.wheel(region,{deltaY:-100,clientX:200,clientY:200});expect(img.style.transform).not.toContain('scale(1.5)');expect(screen.queryByRole('button',{name:'Open full screen'})).toBeNull();
});

it('opens by tapping the visual or keyboard activation without a zoom toolbar',async()=>{
 const onexpand=vi.fn();render(ZoomableVisual,{asset,onexpand});const visual=screen.getByRole('button',{name:'Open Map full screen'});
 expect(screen.getAllByRole('button')).toHaveLength(1);
 await fireEvent.click(visual);expect(onexpand).toHaveBeenCalledTimes(1);
 await fireEvent.keyDown(visual,{key:'Enter'});await fireEvent.keyDown(visual,{key:' '});expect(onexpand).toHaveBeenCalledTimes(3);
});

it.each(['pointer','wheel','keyboard'])('%s interaction respects inline intent without changing its fitted view',async(method)=>{
 const onexpand=vi.fn();render(ZoomableVisual,{asset,onexpand});const visual=screen.getByRole('button');
 if(method==='pointer'){
  await fireEvent.pointerDown(visual,{pointerId:1,clientX:100,clientY:100});
  await fireEvent.pointerDown(visual,{pointerId:2,clientX:200,clientY:100});
  await fireEvent.pointerMove(visual,{pointerId:2,clientX:300,clientY:150});
 }else if(method==='wheel')await fireEvent.wheel(visual,{deltaY:-100,clientX:200,clientY:200});
 else{await fireEvent.keyDown(visual,{key:'+'});await fireEvent.keyDown(visual,{key:'ArrowLeft'});}
 if(method==='pointer')expect(onexpand).not.toHaveBeenCalled();else expect(onexpand).toHaveBeenCalled();
 expect(screen.getByRole('img').style.transform).toBe('translate(0px,0px) scale(1)');
});
