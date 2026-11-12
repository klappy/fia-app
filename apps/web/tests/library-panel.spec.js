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

it('hides Download size while an offline status has no manifest and shows it again once the manifest returns',async()=>{
 vi.spyOn(libraryAdapter,'download').mockRejectedValue(new Error('Failed to fetch'));render(LibraryPanel,{view:'downloads'});await settle();
 await fireEvent.click(screen.getByRole('radio',{name:/Text and audio/}));expect(screen.getByText('Download size')).toBeTruthy();
 libraryAdapter.downloadStatus.mockResolvedValue({available:true,saved:false,manifest:null,choices:[]});
 await fireEvent.click(screen.getByRole('button',{name:'Download selection'}));await settle();await settle();
 expect(screen.getByRole('alert').textContent).toContain('Failed to fetch');expect(screen.queryByText('Download size')).toBeNull();expect(screen.queryByText('Choose sizes by media')).toBeNull();expect(screen.queryByRole('radio',{name:'Small',exact:true})).toBeNull();
 libraryAdapter.downloadStatus.mockResolvedValue(available);window.dispatchEvent(new Event('online'));await settle();await settle();
 expect(screen.getByText('Download size')).toBeTruthy();expect(screen.getByRole('radio',{name:/Text and audio/}).checked).toBe(true);expect(screen.getByRole('button',{name:'Download selection'}).disabled).toBe(false);
});
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
it('offers small, no-video and full packages with sizes computed from the manifest and sends no-video without video',async()=>{
 const sha=c=>c.repeat(64),src='https://example.org/';
 const media=(group,path,bytes,url,mime)=>({path,group,bytes,sha256:sha(group[0]==='a'?'a':group[0]==='i'?'b':'c'),mime,deliveryURL:url,sourceSha256:sha('d'),sourceBytes:bytes*4});
 const manifest={revision:'fixture',files:[{path:'/index.html',group:'core',bytes:1048576},media('audio','/a.opus',2097152,`https://transcode.klappy.dev/audio/preset=voice,q=medium,f=opus/${src}a.mp3`,'audio/ogg'),media('image','/i.webp',3145728,`https://transcode.klappy.dev/image/q=medium,f=webp/${src}i.jpg`,'image/webp'),media('video','/v.mp4',52428800,`https://transcode.klappy.dev/video/preset=fia,q=medium,f=mp4/${src}v.mp4`,'video/mp4')]};
 libraryAdapter.downloadStatus.mockResolvedValue({...available,manifest,choices:['core','audio','visual','all'].map(id=>({id}))});
 const download=vi.spyOn(libraryAdapter,'download').mockResolvedValue({saved:true});
 render(LibraryPanel,{view:'downloads'});await settle();
 // Each package radio keeps its plain name; package name, size and note are its description (fia-app#248 post-deploy).
 const small=screen.getByRole('radio',{name:'Text only',description:/^Small · default · /}),noVideo=screen.getByRole('radio',{name:'Text, audio, images and maps',description:/^No video · /}),full=screen.getByRole('radio',{name:'Text and all available resources',description:/^Full · /});expect(screen.getByRole('radio',{name:'Text and audio',description:/Adds recordings\./})).toBeTruthy();
 expect(small.checked).toBe(true);expect(small.closest('label').textContent).toContain('Small · default');
 expect(small.closest('label').textContent).toContain('1.0 MB');expect(noVideo.closest('label').textContent).toContain('6.0 MB');expect(full.closest('label').textContent).toContain('56.0 MB');
 await fireEvent.click(noVideo);await settle();await fireEvent.click(screen.getByRole('button',{name:'Download selection'}));
 expect(download).toHaveBeenCalledWith('visual',expect.any(Function),expect.anything(),expect.not.objectContaining({video:expect.anything()}));
});

it('withholds whole-book writes while retaining explicit per-passage saving and existing saved state',async()=>{
 const active={selection:'audio',bytes:2048,manifest:available.manifest};
 libraryAdapter.downloadStatus.mockResolvedValue({...available,saved:true,active});
 const download=vi.spyOn(libraryAdapter,'download').mockResolvedValue({saved:true});
 const passages=vi.spyOn(libraryAdapter,'passages');
 render(LibraryPanel,{view:'downloads'});await settle();
 expect(screen.getByText(/Whole-book saving is temporarily unavailable/)).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Download whole book'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Check book size'})).toBeNull();
 expect(passages).not.toHaveBeenCalled();expect(download).not.toHaveBeenCalled();
 expect(screen.getByText(/^Saved ·/)).toBeTruthy();
 await fireEvent.click(screen.getByRole('button',{name:'Save selection again',exact:true}));await settle();
 expect(download).toHaveBeenCalledOnce();expect(download.mock.calls[0][2].id).toBe('eng.MRK-1-1-13');
 expect(active.selection).toBe('audio');
});

it('names each passage card button by its passage so the sheet has no duplicate button names',async()=>{
 const registry=JSON.parse(readFileSync('public/content/registry.json','utf8'));
 const packs=['eng.MRK-1-1-13','eng.MRK-1-14-20','eng.MRK-1-21-28'].map(id=>registry.packs.find(p=>p.id===id));
 vi.spyOn(libraryAdapter,'languages').mockResolvedValue([{id:'eng',nativeName:'English'}]);
 vi.spyOn(libraryAdapter,'passages').mockResolvedValue(packs);
 render(LibraryPanel,{view:'passages',selectedPack:packs[0],completed:2,total:5});await settle();await settle();
 const buttons=screen.getAllByRole('button',{name:/^(Open|Resume) passage: /});
 const names=buttons.map(b=>b.getAttribute('aria-label'));
 expect(names).toEqual([`Resume passage: ${packs[0].title}`,`Open passage: ${packs[1].title}`,`Open passage: ${packs[2].title}`]);
 expect(new Set(names).size).toBe(packs.length);
 // Visible label is unchanged; the accessible name begins with it (label in name).
 expect(buttons.map(b=>b.textContent.trim())).toEqual(['Resume passage','Open passage','Open passage']);
 for(const b of buttons)expect(b.getAttribute('aria-label').startsWith(b.textContent.trim())).toBe(true);
});

for(const [selection,preference] of [['visual',null],['all',null],['all','small']])it(`verified original ${selection} selection with ${preference||'no'} preference reaches the real SW planner`,async()=>{
 const {default:vm}=await import('node:vm'),proxy=await import('../src/lib/proxy-request.js');localStorage.removeItem('fia-download-media-sizes');
 if(preference)localStorage.setItem('fia-download-media-sizes',JSON.stringify({image:preference}));
 const packId='spa.LUK-1-1-4',revision='a'.repeat(64),deliveryRevision='b'.repeat(64),sha='e'.repeat(64);
 const image={path:`/packs/${packId}/visuals/c211.png`,group:'image',mime:'image/png',sha256:sha,sourceSha256:sha,bytes:10,sourceBytes:10,deliveryRevision,deliveryURL:`/v1/verified-visuals/${packId}/${revision}/${deliveryRevision}/c211/${sha}`,visualPublication:{schema:'fia-verified-visual@1',packId,presentationRevision:revision,assetId:'c211',kind:'map',sourceEvidenceSha256:'c'.repeat(64),recipeSha256:'d'.repeat(64),pixelsSha256:'f'.repeat(64),width:1,height:1}};
 const manifest={packId,presentationRevision:revision,deliveryRevision,files:[{path:'/index.html',group:'core',bytes:1},image]};
 libraryAdapter.downloadStatus.mockResolvedValue({...available,manifest,choices:[{id:'core'},{id:'visual'},{id:'all'}]});
 const context=vm.createContext({self:{addEventListener(){}},URL,Response,Headers,AbortController,console,...proxy});vm.runInContext(readFileSync('public/sw.js','utf8'),context);context.manifest=manifest;
 const download=vi.spyOn(libraryAdapter,'download').mockImplementation(async(choice,progress,pack,sizes)=>{context.choice=choice;context.sizes=sizes;const planned=vm.runInContext('planVerifiedVisualDownload(manifest,choice,sizes)',context);expect(planned.files.find(f=>f.visualPublication).deliveryURL).toBe(image.deliveryURL);expect(planned.mediaSizes.image).toBe('prepared');return {saved:true};});
 render(LibraryPanel,{view:'downloads'});await settle();await fireEvent.click(screen.getByRole('radio',{name:selection==='visual'?/Text, audio, images and maps/:/Text and all available resources/}));const chooser=screen.getByRole('combobox',{name:'Images and maps download size'});expect([...chooser.options].find(o=>o.value==='small').disabled).toBe(true);if(preference){expect(screen.getByRole('button',{name:'Download selection',exact:true}).disabled).toBe(true);await fireEvent.change(chooser,{target:{value:'prepared'}});}expect(chooser.value).toBe('prepared');
 await fireEvent.click(screen.getByRole('button',{name:'Download selection',exact:true}));await settle();expect(download).toHaveBeenCalledOnce();expect(download.mock.calls[0][3]).toEqual({image:'prepared'});expect(screen.queryByRole('alert')).toBeNull();
 context.choice=selection;context.sizes={image:null};expect(vm.runInContext('planVerifiedVisualDownload(manifest,choice,sizes)',context).files.find(f=>f.visualPublication).sha256).toBe(sha);
 for(const size of ['small','medium','large',false,'invalid']){context.sizes={image:size};expect(()=>vm.runInContext('planVerifiedVisualDownload(manifest,choice,sizes)',context)).toThrow();}
});
