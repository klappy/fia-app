import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/svelte';
import StepResources from '../src/components/StepResources.svelte';
afterEach(cleanup);
it('shows exact related resources without a menu and opens only on explicit selection',async()=>{
 const onopen=vi.fn();render(StepResources,{items:[{id:'m',kind:'map',title:'Map',availability:'unavailable'},{id:'s',kind:'scripture',title:'RV1909',availability:'available'}],onopen});
 expect(screen.getByRole('navigation',{name:'Resources for this step'})).toBeTruthy();expect(screen.getByText('Unavailable')).toBeTruthy();expect(onopen).not.toHaveBeenCalled();
 await fireEvent.click(screen.getByRole('button',{name:'Map: Map'}));expect(onopen).toHaveBeenCalledWith('m');expect(screen.getByRole('button',{name:'Scripture: RV1909'})).toBeTruthy();
});

it('scrolling a resource-row gap never turns the guide page',async()=>{
 const {swipeNavigation}=await import('../src/lib/swipe.js');
 const {container}=render(StepResources,{items:[{id:'m',kind:'map',title:'Map',availability:'unavailable'}]});
 const navigate=vi.fn(),action=swipeNavigation(container,()=>({identity:'held-step',next:true,back:true,navigate}));
 try{const row=screen.getByRole('navigation',{name:'Resources for this step'});
 await fireEvent.touchStart(row,{touches:[{clientX:200,clientY:200}]});await fireEvent.touchEnd(row,{changedTouches:[{clientX:100,clientY:200}],touches:[]});expect(navigate).not.toHaveBeenCalled();
 await fireEvent.touchStart(container,{touches:[{clientX:200,clientY:200}]});await fireEvent.touchEnd(container,{changedTouches:[{clientX:100,clientY:200}],touches:[]});expect(navigate).toHaveBeenCalledWith('next');
 }finally{action.destroy();}
});
