import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/svelte';
import StepResources from '../src/components/StepResources.svelte';
afterEach(cleanup);
it('shows all allowed resources without a menu and opens only on explicit selection',async()=>{
 const onopen=vi.fn(),assets={m:{id:'m',kind:'map',title:'Map'},s:{id:'s',kind:'scripture',title:'RV1909',text:'Existing source text'}};
 render(StepResources,{activity:{id:'a'},activities:[{availableAssetIds:['m','s']}],assets,onopen});
 expect(screen.getByRole('navigation',{name:'Passage resources for this step'})).toBeTruthy();expect(screen.getByText('Unavailable')).toBeTruthy();expect(onopen).not.toHaveBeenCalled();
 await fireEvent.click(screen.getByRole('button',{name:'Map: Map'}));expect(onopen).toHaveBeenCalledWith('m');expect(screen.getByRole('button',{name:'Scripture: RV1909'})).toBeTruthy();
});
