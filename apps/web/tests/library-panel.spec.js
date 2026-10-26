import {readFileSync} from 'node:fs';
import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/svelte';
import {tick} from 'svelte';
import LibraryPanel from '../src/components/LibraryPanel.svelte';
import {libraryAdapter} from '../src/lib/library.js';
const settle=async()=>{for(let i=0;i<5;i++){await Promise.resolve();await tick();}};
const available={available:true,saved:false,manifest:{revision:'fixture',files:[{path:'/index.html',group:'core',bytes:1024}]},choices:[{id:'core',bytes:1024},{id:'audio',bytes:2048},{id:'all',bytes:4096}]};
beforeEach(()=>{vi.spyOn(libraryAdapter,'downloadStatus').mockResolvedValue(available);vi.spyOn(libraryAdapter,'passages').mockResolvedValue([]);});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
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
 expect(screen.getAllByRole('status').some(n=>n.textContent.includes('Saved · Text and all available resources · Custom ·'))).toBe(true);
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

it('whole book: previews each package total, then saves only unsaved passages through the passage path',async()=>{
 const book=[{id:'eng.MRK-1-1-13',pericopeId:'MRK-1-1-13',language:'eng',title:'Mark 1:1–13'},{id:'eng.MRK-1-14-20',pericopeId:'MRK-1-14-20',language:'eng',title:'Mark 1:14–20'},{id:'eng.LUK-1-1-4',pericopeId:'LUK-1-1-4',language:'eng',title:'Luke 1:1–4'}];
 vi.spyOn(libraryAdapter,'passages').mockResolvedValue(book);
 libraryAdapter.downloadStatus.mockImplementation(async pack=>{return pack?.id==='eng.MRK-1-14-20'?{...available,saved:true,active:{selection:'core',bytes:1024,manifest:available.manifest}}:available;});
 const download=vi.spyOn(libraryAdapter,'download').mockResolvedValue({saved:true});
 render(LibraryPanel,{view:'downloads',selectedPack:book[0]});await settle();
 expect(screen.getAllByRole('radio',{name:'Text and audio',exact:true}).length).toBe(1);
 for(let i=0;i<12;i++)await settle();
 const sizes=screen.getByRole('list',{name:'Whole book size by package'});expect(sizes.textContent).toContain('Text only');expect(sizes.textContent).toContain('2 passages · 1 saved');
 expect(screen.getByText(/1\.0 KB|0\.0 MB to download · 1 of 2 passages/)).toBeTruthy();
 await fireEvent.click(screen.getByRole('button',{name:'Download whole book'}));await settle();await settle();await settle();
 expect(download).toHaveBeenCalledOnce();expect(download.mock.calls[0][0]).toBe('core');expect(download.mock.calls[0][2].id).toBe('eng.MRK-1-1-13');
});

it.each(['mixed','all','worker-mixed','worker-all'])('whole book: %s failed checks show an incomplete preview and retry recovers',async mode=>{
 const packs=[{id:'eng.MRK-1-1-13',pericopeId:'MRK-1-1-13',language:'eng',title:'Mark 1:1–13'},{id:'eng.MRK-1-14-20',pericopeId:'MRK-1-14-20',language:'eng',title:'Mark 1:14–20'}];
 let recover=false,initial=true;
 vi.spyOn(libraryAdapter,'passages').mockResolvedValue(packs);
 libraryAdapter.downloadStatus.mockImplementation(async pack=>{
  if(initial){initial=false;return {...available,choices:[{id:'core',bytes:1024}]};}
  if(pack&&!recover&&(mode.endsWith('all')||pack.id===packs[1].id)){if(mode.startsWith('worker'))return {ok:true,available:true,saved:false,active:null,pending:null,manifest:undefined,error:'Manifest lookup failed.',choices:[]};throw Error('Status connection failed.');}
  return {...available,choices:[{id:'core',bytes:1024}]};
 });
 const download=vi.spyOn(libraryAdapter,'download').mockResolvedValue({saved:true});
 render(LibraryPanel,{view:'downloads',selectedPack:packs[0]});await settle();
 for(let i=0;i<12;i++)await settle();
 expect(screen.getByText(/Book size is incomplete/)).toBeTruthy();
 expect(screen.queryByText('Nothing to save for this choice.')).toBeNull();
 expect(screen.getByRole('button',{name:'Download whole book'}).disabled).toBe(true);
 expect(download).not.toHaveBeenCalled();
 const retry=screen.getByRole('button',{name:'Retry book size check'});recover=true;await fireEvent.click(retry);await settle();await settle();
 expect(screen.queryByText(/Book size is incomplete/)).toBeNull();
 expect(screen.queryByRole('button',{name:'Retry book size check'})).toBeNull();
 expect(screen.getByRole('list',{name:'Whole book size by package'}).textContent).toContain('2 passages');
 expect(screen.getByRole('button',{name:'Download whole book'}).disabled).toBe(false);
});

it('automatically checks whole-book sizes when Downloads opens without a check click',async()=>{
 const packs=[{id:'eng.MRK-1-1-13',pericopeId:'MRK-1-1-13',language:'eng',title:'Mark 1:1–13'}];
 libraryAdapter.passages.mockResolvedValue(packs);const download=vi.spyOn(libraryAdapter,'download'),prepare=vi.spyOn(libraryAdapter,'prepareRecording');
 render(LibraryPanel,{view:'downloads',selectedPack:packs[0]});for(let i=0;i<12;i++)await settle();
 expect(libraryAdapter.passages).toHaveBeenCalledOnce();expect(libraryAdapter.downloadStatus).toHaveBeenCalledTimes(2);
 expect(screen.queryByRole('button',{name:'Check book size',exact:true})).toBeNull();expect(screen.getByRole('button',{name:'Download whole book'}).disabled).toBe(false);
 expect(download).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();
});

it('automatic book checks retry only transient failures and recover without a click, preserving the tier',async()=>{
 vi.useFakeTimers();const packs=[{id:'eng.MRK-1-1-13',pericopeId:'MRK-1-1-13',language:'eng',title:'Mark 1:1–13'},{id:'eng.MRK-1-14-20',pericopeId:'MRK-1-14-20',language:'eng',title:'Mark 1:14–20'}];
 libraryAdapter.passages.mockResolvedValue(packs);let bad=0;libraryAdapter.downloadStatus.mockImplementation(async p=>p.id===packs[1].id&&++bad<2?{available:true,error:'Media status is temporarily unavailable.',choices:[]}:available);
 const download=vi.spyOn(libraryAdapter,'download'),prepare=vi.spyOn(libraryAdapter,'prepareRecording');render(LibraryPanel,{view:'downloads',selectedPack:packs[0]});await vi.advanceTimersByTimeAsync(0);for(let i=0;i<12;i++)await settle();
 expect(screen.getByText(/Checking again automatically/)).toBeTruthy();expect(screen.getByRole('button',{name:'Download whole book'}).disabled).toBe(true);expect(screen.queryByRole('button',{name:'Retry book size check'})).toBeNull();
 await fireEvent.click(screen.getByRole('radio',{name:'Text and audio',exact:true}));await vi.advanceTimersByTimeAsync(1000);for(let i=0;i<12;i++)await settle();
 expect(screen.queryByText(/Book size is incomplete/)).toBeNull();expect(screen.getByRole('radio',{name:'Text and audio',exact:true}).checked).toBe(true);expect(screen.getByRole('button',{name:'Download whole book'}).disabled).toBe(false);
 expect(libraryAdapter.passages).toHaveBeenCalledOnce();expect(libraryAdapter.downloadStatus.mock.calls.filter(([p])=>p.id===packs[1].id)).toHaveLength(2);expect(download).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();
});
it('automatic book checks stop after three transient attempts and close cancels backoff',async()=>{
 vi.useFakeTimers();const pack={id:'eng.MRK-1-1-13',pericopeId:'MRK-1-1-13',language:'eng',title:'Mark 1:1–13'};libraryAdapter.passages.mockResolvedValue([pack]);let first=true;libraryAdapter.downloadStatus.mockImplementation(async()=>{if(first){first=false;return available;}return {available:true,error:'Media status is temporarily unavailable.',choices:[]};});
 const view=render(LibraryPanel,{view:'downloads',selectedPack:pack});await vi.advanceTimersByTimeAsync(0);await vi.advanceTimersByTimeAsync(4000);for(let i=0;i<12;i++)await settle();
 expect(libraryAdapter.downloadStatus).toHaveBeenCalledTimes(4);expect(screen.getByRole('button',{name:'Retry book size check'})).toBeTruthy();expect(screen.getByRole('button',{name:'Download whole book'}).disabled).toBe(true);await vi.advanceTimersByTimeAsync(60000);expect(libraryAdapter.downloadStatus).toHaveBeenCalledTimes(4);
 await fireEvent.click(screen.getByRole('button',{name:'Retry book size check'}));for(let i=0;i<8;i++)await settle();const calls=libraryAdapter.downloadStatus.mock.calls.length;view.unmount();await vi.advanceTimersByTimeAsync(60000);expect(libraryAdapter.downloadStatus).toHaveBeenCalledTimes(calls);
});
it('closing and changing passage ignore active book replies, then a new sheet checks automatically',async()=>{
 const p1={id:'eng.MRK-1-1-13',pericopeId:'MRK-1-1-13',language:'eng',title:'Mark 1:1–13'},p2={id:'eng.LUK-1-1-4',pericopeId:'LUK-1-1-4',language:'eng',title:'Luke 1:1–4'};let release,first=true;libraryAdapter.passages.mockImplementation(async()=>[p1,p2]);libraryAdapter.downloadStatus.mockImplementation(async p=>{if(first){first=false;return available;}if(p.id===p1.id)return new Promise(r=>release=r);return available;});
 const view=render(LibraryPanel,{view:'downloads',selectedPack:p1});for(let i=0;i<12;i++)await settle();expect(release).toBeTypeOf('function');await view.rerender({view:'downloads',selectedPack:p2});for(let i=0;i<12;i++)await settle();release({available:true,error:'Media status is temporarily unavailable.',choices:[]});for(let i=0;i<12;i++)await settle();
 expect(screen.getByRole('heading',{name:'Save the whole book'})).toBeTruthy();expect(screen.queryByText(/Book size is incomplete/)).toBeNull();expect(screen.getByRole('button',{name:'Download whole book'}).disabled).toBe(false);view.unmount();
 render(LibraryPanel,{view:'downloads',selectedPack:p2});for(let i=0;i<12;i++)await settle();expect(screen.getByRole('button',{name:'Download whole book'}).disabled).toBe(false);
});

it('catalog transport failure recovers automatically; unknown catalog failure is an honest terminal state',async()=>{
 vi.useFakeTimers();const pack={id:'eng.MRK-1-1-13',pericopeId:'MRK-1-1-13',language:'eng',title:'Mark 1:1–13'};libraryAdapter.passages.mockRejectedValueOnce(TypeError('Failed to fetch')).mockResolvedValue([pack]);
 const view=render(LibraryPanel,{view:'downloads',selectedPack:pack});await vi.advanceTimersByTimeAsync(0);expect(screen.queryByText('Nothing to save for this choice.')).toBeNull();await vi.advanceTimersByTimeAsync(1000);for(let i=0;i<12;i++)await settle();expect(screen.getByRole('button',{name:'Download whole book'}).disabled).toBe(false);view.unmount();
 libraryAdapter.passages.mockRejectedValue(Error('The passage catalog is unavailable. Your current passage stays open.'));render(LibraryPanel,{view:'downloads',selectedPack:pack});await vi.advanceTimersByTimeAsync(0);for(let i=0;i<12;i++)await settle();expect(screen.getByText('Book sizes could not be checked. You can try again.')).toBeTruthy();expect(screen.getByRole('button',{name:'Retry book size check'})).toBeTruthy();expect(screen.queryByText('Nothing to save for this choice.')).toBeNull();expect(screen.queryByRole('button',{name:'Download whole book'})).toBeNull();
});

it('a transient initial passage-status rejection does not suppress automatic book checking',async()=>{
 const pack={id:'eng.MRK-1-1-13',pericopeId:'MRK-1-1-13',language:'eng',title:'Mark 1:1–13'};libraryAdapter.passages.mockResolvedValue([pack]);libraryAdapter.downloadStatus.mockRejectedValueOnce(TypeError('Failed to fetch')).mockResolvedValue(available);render(LibraryPanel,{view:'downloads',selectedPack:pack});for(let i=0;i<16;i++)await settle();
 expect(screen.queryByText('Failed to fetch')).toBeNull();expect(screen.getByRole('button',{name:'Download whole book'}).disabled).toBe(false);expect(libraryAdapter.downloadStatus).toHaveBeenCalledTimes(2);
});

it('a hanging status read has a bounded checking state and a late response cannot resurrect it',async()=>{
 vi.useFakeTimers();const pack={id:'eng.MRK-1-1-13',pericopeId:'MRK-1-1-13',language:'eng',title:'Mark 1:1–13'};libraryAdapter.passages.mockResolvedValue([pack]);let release;libraryAdapter.downloadStatus.mockResolvedValueOnce(available).mockImplementation(()=>new Promise(r=>release=r));render(LibraryPanel,{view:'downloads',selectedPack:pack});await vi.advanceTimersByTimeAsync(0);expect(screen.getByText('Checking book sizes…')).toBeTruthy();await vi.advanceTimersByTimeAsync(60000);expect(screen.getByText('Book sizes could not be checked. You can try again.')).toBeTruthy();expect(screen.getByRole('button',{name:'Retry book size check'}).disabled).toBe(false);release(available);for(let i=0;i<12;i++)await settle();expect(screen.getByText('Book sizes could not be checked. You can try again.')).toBeTruthy();expect(screen.queryByRole('button',{name:'Download whole book'})).toBeNull();
});

it('late initial passage refresh cannot overwrite the new passage or notify its saved status',async()=>{
 const a={id:'eng.MRK-1-1-13',pericopeId:'MRK-1-1-13',language:'eng',title:'Mark 1:1–13'},b={id:'eng.LUK-1-1-4',pericopeId:'LUK-1-1-4',language:'eng',title:'Luke 1:1–4'};let old;const status=vi.fn();libraryAdapter.passages.mockResolvedValue([a,b]);const saved={...available,saved:true,active:{selection:'core',bytes:1024,manifest:available.manifest}};libraryAdapter.downloadStatus.mockImplementation(p=>p.id===a.id?new Promise(r=>old=r):Promise.resolve(saved));
 const view=render(LibraryPanel,{view:'downloads',selectedPack:a,onstatus:status});for(let i=0;i<8;i++)await settle();await view.rerender({view:'downloads',selectedPack:b,onstatus:status});for(let i=0;i<12;i++)await settle();expect(status).toHaveBeenLastCalledWith(true);old(available);for(let i=0;i<12;i++)await settle();expect(status).toHaveBeenCalledTimes(1);expect(status).toHaveBeenLastCalledWith(true);expect(screen.queryByText('Not saved on this device')).toBeNull();
});
it('a hanging initial passage refresh cannot leave device checking or prevent bounded automatic book progress',async()=>{
 vi.useFakeTimers();const pack={id:'eng.MRK-1-1-13',pericopeId:'MRK-1-1-13',language:'eng',title:'Mark 1:1–13'};libraryAdapter.passages.mockResolvedValue([pack]);let first=true;libraryAdapter.downloadStatus.mockImplementation(()=>{if(first){first=false;return new Promise(()=>{});}return Promise.resolve(available);});render(LibraryPanel,{view:'downloads',selectedPack:pack});await vi.advanceTimersByTimeAsync(75000);for(let i=0;i<12;i++)await settle();expect(screen.queryByText('Checking device storage…')).toBeNull();expect(screen.getByRole('button',{name:'Download whole book'}).disabled).toBe(false);
});

it('a timed-out refresh preserves verified saved status instead of inventing unavailable tiers',async()=>{
 vi.useFakeTimers();const pack={id:'eng.MRK-1-1-13',pericopeId:'MRK-1-1-13',language:'eng',title:'Mark 1:1–13'},saved={...available,saved:true,active:{selection:'core',bytes:1024,manifest:available.manifest}};libraryAdapter.passages.mockResolvedValue([pack]);libraryAdapter.downloadStatus.mockResolvedValue(saved);render(LibraryPanel,{view:'downloads',selectedPack:pack});await vi.advanceTimersByTimeAsync(0);await settle();libraryAdapter.downloadStatus.mockImplementation(()=>new Promise(()=>{}));await fireEvent.click(screen.getByRole('button',{name:'Check for updates and saved files'}));await vi.advanceTimersByTimeAsync(15000);await settle();expect(screen.getAllByRole('status').some(n=>n.textContent.includes('Saved · Text only'))).toBe(true);expect(screen.getByRole('alert').textContent).toContain('Download status could not be checked');expect(screen.getByRole('radio',{name:'Text only',exact:true})).toBeTruthy();expect(screen.queryByText('Not saved on this device')).toBeNull();
});
