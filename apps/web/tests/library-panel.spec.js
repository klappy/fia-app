import {readFileSync} from 'node:fs';
import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/svelte';
import {tick} from 'svelte';
import LibraryPanel from '../src/components/LibraryPanel.svelte';
import {libraryAdapter} from '../src/lib/library.js';
const settle=async()=>{await Promise.resolve();await tick();};
const available={available:true,saved:false,manifest:{revision:'fixture',files:[{path:'/index.html',group:'core',bytes:1024}]},choices:[{id:'core',bytes:1024},{id:'audio',bytes:2048},{id:'all',bytes:4096}]};
beforeEach(()=>vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue(available));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('keeps development downloads unavailable instead of offering a simulated action',async()=>{libraryAdapter.downloadStatus.mockResolvedValue({available:false,reason:'Downloads work on the published Site.'});render(LibraryPanel,{view:'downloads'});await settle();expect(screen.getByText('Downloads work on the published Site.')).toBeTruthy();expect(screen.queryByRole('button',{name:'Download selection'})).toBeNull();});
it('sends the selected tier, displays real adapter progress and waits for completion',async()=>{let finish;vi.spyOn(libraryAdapter,'download').mockImplementation((selection,progress)=>{progress({received:512,bytes:1024,count:1,total:2});return new Promise(resolve=>finish=resolve);});render(LibraryPanel,{view:'downloads'});await settle();await fireEvent.click(screen.getByRole('radio',{name:/Text only/}));await fireEvent.click(screen.getByRole('button',{name:'Download selection'}));await settle();expect(libraryAdapter.download.mock.calls[0][0]).toBe('core');expect(screen.getByRole('progressbar',{name:'Download progress'}).value).toBe(512);expect(screen.getByRole('button',{name:'Pause download'})).toBeTruthy();expect(screen.queryByText(/^Saved ·/)).toBeNull();finish({saved:true});await settle();});
it('shows interrupted state and keeps removal separate from progress reset',async()=>{libraryAdapter.downloadStatus.mockResolvedValue({...available,pending:{selection:'audio',received:1024,bytes:2048,running:false}});vi.spyOn(libraryAdapter,'removeDownload').mockResolvedValue({saved:false});const reset=vi.fn();render(LibraryPanel,{view:'downloads',onreset:reset});await settle();expect(screen.getByRole('radio',{name:/Text only/}).checked).toBe(true);await fireEvent.click(screen.getByRole('radio',{name:/Text and audio/}));expect(screen.getByRole('button',{name:'Resume download'})).toBeTruthy();await fireEvent.click(screen.getByRole('button',{name:'Remove from device'}));expect(libraryAdapter.removeDownload).not.toHaveBeenCalled();await fireEvent.click(screen.getByRole('button',{name:'Remove download',exact:true}));await settle();expect(libraryAdapter.removeDownload).toHaveBeenCalledOnce();expect(reset).not.toHaveBeenCalled();});
it('retains an actionable error after a failed download',async()=>{vi.spyOn(libraryAdapter,'download').mockRejectedValue(new Error('Storage is full. Choose a smaller download.'));render(LibraryPanel,{view:'downloads'});await settle();await fireEvent.click(screen.getByRole('button',{name:'Download selection'}));await settle();expect(screen.getByRole('alert').textContent).toContain('Storage is full');expect(screen.getByRole('button',{name:'Download selection'})).toBeTruthy();});

it('defaults to text only even when all resources are available',async()=>{render(LibraryPanel,{view:'downloads'});await settle();expect(screen.getByRole('radio',{name:/Text only/}).checked).toBe(true);expect(screen.getByRole('radio',{name:/Text and all available resources/}).checked).toBe(false);});
it('shows actual mixed offline sizes without claiming unavailable presets or downloading on selection',async()=>{
 libraryAdapter.downloadStatus.mockResolvedValue({...available,manifest:{revision:'fixture',files:[{group:'audio',deliveryURL:'https://transcode.klappy.dev/audio/preset=voice,q=medium,f=opus/x'},{group:'image',deliveryURL:'https://transcode.klappy.dev/image/q=medium,f=webp/x'},{group:'video',deliveryURL:'https://transcode.klappy.dev/video/preset=fia,q=medium,f=mp4/x'}]}});
 const download=vi.spyOn(libraryAdapter,'download');render(LibraryPanel,{view:'downloads'});await settle();expect(screen.queryByText('Download size')).toBeNull();
 await fireEvent.click(screen.getByRole('radio',{name:/Text and all available resources/}));expect(screen.getByText(/Custom sizes ·/)).toBeTruthy();
 expect(screen.getByRole('combobox',{name:'Video download size'}).value).toBe('large');expect(screen.getByRole('combobox',{name:'Audio download size'}).value).toBe('medium');
 expect(screen.getByRole('option',{name:'Small · 320p — not available yet'}).disabled).toBe(true);expect(download).not.toHaveBeenCalled();
 await fireEvent.click(screen.getByRole('radio',{name:/Text and audio/}));expect(screen.getByRole('radio',{name:'Medium',exact:true}).checked).toBe(true);expect(screen.getByRole('combobox',{name:'Video download size'}).disabled).toBe(true);expect(download).not.toHaveBeenCalled();
});
it('one preset sets all included sizes and a custom change sends the exact tuple only on Download',async()=>{
 localStorage.removeItem('fia-download-media-sizes');const levels=['small','medium','large'];
 const files=[{path:'/index.html',group:'core',bytes:10},...['audio','image','video'].map((group,g)=>({path:'/'+group,group,bytes:5,deliveryURL:`https://transcode.klappy.dev/${group}/q=medium/f`,variants:Object.fromEntries(levels.map((size,i)=>[size,{path:'/'+group,group,bytes:10*g+i+1,...(group==='video'?{deliveryURL:`https://transcode.klappy.dev/video/preset=fia,q=medium,f=mp4,size=${{small:'xsmall',medium:'medium',large:'xlarge'}[size]}/https://source.test/video.mp4`}:{})}])) ,defaultSize:'medium'}))];
 libraryAdapter.downloadStatus.mockResolvedValue({...available,manifest:{revision:'fixture',files}});const download=vi.spyOn(libraryAdapter,'download').mockResolvedValue({saved:true});render(LibraryPanel,{view:'downloads'});await settle();
 await fireEvent.click(screen.getByRole('radio',{name:/Text and all available resources/}));await fireEvent.click(screen.getByRole('radio',{name:'Small',exact:true}));expect(screen.getByRole('combobox',{name:'Video download size'}).value).toBe('small');
 await fireEvent.change(screen.getByRole('combobox',{name:'Audio download size'}),{target:{value:'large'}});expect(screen.getByText(/Custom sizes/)).toBeTruthy();expect(download).not.toHaveBeenCalled();
 await fireEvent.click(screen.getByRole('button',{name:'Download selection',exact:true}));expect(download.mock.calls[0][3]).toEqual({image:'small',audio:'large',video:'small'});
});

it('labels the saved tuple independently of current size preferences and omits stale include totals',async()=>{
 localStorage.setItem('fia-download-media-sizes',JSON.stringify({audio:'large',image:'large',video:'large'}));
 const manifest={revision:'saved',mediaSizes:{audio:'small',image:'medium',video:'large'},files:[{group:'audio',deliveryURL:'https://transcode.klappy.dev/audio/q=low/f'},{group:'image',deliveryURL:'https://transcode.klappy.dev/image/q=medium/f'},{group:'video',deliveryURL:'https://transcode.klappy.dev/video/q=medium/f'}]};
 libraryAdapter.downloadStatus.mockResolvedValue({...available,saved:true,active:{selection:'all',bytes:4096,manifest}});render(LibraryPanel,{view:'downloads'});await settle();
 expect(screen.getByRole('status').textContent).toContain('Saved · Text and all available resources · Custom ·');
 expect(screen.queryByText(/total$/)).toBeNull();localStorage.removeItem('fia-download-media-sizes');
});

it('requests a source-bound missing quality with unknown total only after Download',async()=>{
 localStorage.removeItem('fia-download-media-sizes');const f={path:'/map.webp',group:'image',bytes:100,sha256:'a'.repeat(64),sourceSha256:'b'.repeat(64),sourceBytes:1000,mime:'image/webp',defaultSize:'medium',deliveryURL:'https://transcode.klappy.dev/image/q=medium,f=webp/https://source.test/map.jpg'};f.variants={medium:{...f}};
 libraryAdapter.downloadStatus.mockResolvedValue({...available,manifest:{revision:'dynamic',files:[f]}});const download=vi.spyOn(libraryAdapter,'download').mockResolvedValue({saved:true});render(LibraryPanel,{view:'downloads'});await settle();await fireEvent.click(screen.getByRole('radio',{name:/Text and all available resources/}));await fireEvent.click(screen.getByRole('radio',{name:'Small',exact:true}));expect(screen.getByText('Size determined during download.')).toBeTruthy();expect(download).not.toHaveBeenCalled();await fireEvent.click(screen.getByRole('button',{name:'Download selection',exact:true}));expect(download.mock.calls[0][3]).toEqual({image:'small'});
});

it('untouched qualified legacy video is Prepared version; explicit Large remains a separate912 request',async()=>{
 localStorage.removeItem('fia-download-media-sizes');
 const file={path:'/v.mp4',group:'video',bytes:3,sha256:'a'.repeat(64),sourceSha256:'b'.repeat(64),sourceBytes:5,mime:'video/mp4',deliveryURL:'https://transcode.klappy.dev/video/preset=fia,q=medium,f=mp4/https://source.test/720p.mp4',timing:{status:'not-applicable'}};
 const manifest={revision:'qualified',files:[{path:'/index.html',group:'core',bytes:10},{...file,defaultSize:'large',variants:{large:file}}]};
 libraryAdapter.downloadStatus.mockResolvedValue({...available,manifest});const download=vi.spyOn(libraryAdapter,'download').mockResolvedValue({saved:true});render(LibraryPanel,{view:'downloads'});await settle();await fireEvent.click(screen.getByRole('radio',{name:/Text and all available resources/}));
 expect(screen.getByRole('combobox',{name:'Video download size'}).value).toBe('prepared');expect(screen.getByRole('option',{name:'Prepared version'}).selected).toBe(true);expect(screen.getByRole('option',{name:'Large · 912p'}).selected).toBe(false);
 await fireEvent.click(screen.getByRole('button',{name:'Download selection',exact:true}));expect(download.mock.calls[0][3]).toEqual({video:'prepared'});await settle();
 await fireEvent.change(screen.getByRole('combobox',{name:'Video download size'}),{target:{value:'large'}});await fireEvent.click(screen.getByRole('button',{name:'Download selection',exact:true}));expect(download.mock.calls[1][3]).toEqual({video:'large'});
});
it('prepared default selection can resume without silently restoring an explicitphone size',async()=>{
 localStorage.removeItem('fia-download-media-sizes');const file={path:'/v.mp4',group:'video',bytes:3,sha256:'a'.repeat(64),sourceSha256:'b'.repeat(64),sourceBytes:5,mime:'video/mp4',deliveryURL:'https://transcode.klappy.dev/video/preset=fia,q=medium,f=mp4/https://source.test/720p.mp4'};
 const manifest={revision:'qualified',files:[file]};libraryAdapter.downloadStatus.mockResolvedValue({...available,manifest,pending:{selection:'all',received:1,bytes:3,running:false,manifest:{mediaSizes:{video:'prepared'}}}});
 const download=vi.spyOn(libraryAdapter,'download').mockResolvedValue({saved:true});render(LibraryPanel,{view:'downloads'});await settle();await fireEvent.click(screen.getByRole('radio',{name:/Text and all available resources/}));await fireEvent.click(screen.getByRole('button',{name:'Resume download'}));expect(download.mock.calls[0][3]).toEqual({video:'prepared'});
});

it('catalog shows exact admitted on-request recordings without requesting preparation or fetching every pack',async()=>{
 const registry=JSON.parse(readFileSync('public/content/registry.json','utf8'));
 const admitted=registry.packs.find(p=>p.id==='eng.MRK-1-14-20');
 const unsupported=registry.packs.find(p=>p.id!=='eng.MRK-1-14-20'&&p.capabilities.guideNarration.count===0);
 vi.spyOn(libraryAdapter,'languages').mockResolvedValue([{id:'eng',nativeName:'English'}]);
 vi.spyOn(libraryAdapter,'passages').mockResolvedValue([admitted,unsupported]);
 const prepare=vi.spyOn(libraryAdapter,'prepareRecording');const select=vi.spyOn(libraryAdapter,'select');
 render(LibraryPanel,{view:'passages'});await settle();await settle();
 expect(screen.getByText('Some guide recordings available on request · Resources download manually')).toBeTruthy();
 expect(screen.getByText('Guide recordings unavailable · Resources download manually')).toBeTruthy();
 expect(prepare).not.toHaveBeenCalled();expect(select).not.toHaveBeenCalled();
});
