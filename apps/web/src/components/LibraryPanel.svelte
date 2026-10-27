<script>
 import {onMount} from 'svelte';
 import {Check,ChevronRight,Download,RotateCcw,Trash2,Pause} from 'lucide-svelte';
 import {libraryAdapter,bundledPack,formatBytes} from '../lib/library.js';
 import {guideRecordingAvailability} from '../lib/recording-availability.js';
 import {progressSummary} from '../lib/session-store.js';
 import {planProxyDownload,downloadSelectionIncludes,downloadTransferBytes} from '../lib/proxy-request.js';
 import {preparedDownloadSizes} from '../lib/media-options.js';
 import {bookPassages,bookStatuses,bookTotals,downloadBook} from '../lib/book-download.js';
 let {view,selectedPack=bundledPack,language='eng',onlanguage,onselect,onreset,onview,completed=0,total=0,onstatus=()=>{}}=$props();
 let languages=$state([]),passages=$state([]),loading=$state(true),error=$state(''),download=$state(null),selection=$state('core'),busy=$state(false),transfer=$state(null),confirmRemove=$state(false),confirmRestart=$state(null),downloadFinished=$state(false);
 let sizes=$derived(preparedDownloadSizes(download?.manifest,selection));
 function storedSizes(){try{return JSON.parse(localStorage.getItem('fia-download-media-sizes')||'{}');}catch{return {};}}
 let mediaSizes=$state(storedSizes());
 let effectiveSizes=$derived(Object.fromEntries(Object.entries(sizes.groups).filter(([,g])=>g.included&&g.count).map(([k,g])=>[k,mediaSizes[k]||(k==='video'&&g.prepared?'prepared':g.size)])));
 let preset=$derived(new Set(Object.values(effectiveSizes)).size===1?Object.values(effectiveSizes)[0]:'custom');
 let availablePresets=$derived(['small','medium','large'].filter(size=>Object.values(sizes.groups).filter(g=>g.included&&g.count).every(g=>g.requestable||g.available.includes(size))));
 let ready=$derived(Object.entries(effectiveSizes).every(([k,v])=>v==='prepared'?sizes.groups[k].prepared:sizes.groups[k].requestable||sizes.groups[k].available.includes(v)));
 let requestSizes=$derived(Object.fromEntries(Object.entries(effectiveSizes).filter(([group])=>download?.manifest?.files.some(f=>f.group===group&&f.deliveryURL))));
 let resumeMatches=$derived(download?.pending?.selection===selection&&['audio','image','video'].every(g=>(download.pending.manifest?.mediaSizes?.[g]||null)===(requestSizes[g]||null)));
 // Each package's total is the real proxied output it would transfer: declared output bytes (verified against the live proxy, see the unit's RESULTS) for the sizes it would request, each shared clip counted once; null while any output is still undeclared.
 function packageTotal(choice){
  const manifest=download?.manifest;if(!manifest)return null;const prepared=preparedDownloadSizes(manifest,choice);
  const chosen=Object.fromEntries(Object.entries(prepared.groups).filter(([,g])=>g.included&&g.count).map(([k,g])=>[k,mediaSizes[k]||(k==='video'&&g.prepared?'prepared':g.size)]));
  if(!Object.entries(chosen).every(([k,v])=>v==='prepared'?prepared.groups[k].prepared:prepared.groups[k].requestable||prepared.groups[k].available.includes(v)))return null;
  const request=Object.fromEntries(Object.entries(chosen).filter(([group])=>manifest.files.some(f=>f.group===group&&f.deliveryURL)));
  try{const m=planProxyDownload(manifest,choice,request),files=m.files.filter(f=>downloadSelectionIncludes(choice,f.group));return downloadTransferBytes(files);}catch{return null;}
 }
 let choiceTotals=$derived(Object.fromEntries((download?.choices||[]).map(c=>[c.id,packageTotal(c.id)])));
 let selectedTotal=$derived(ready?choiceTotals[selection]??packageTotal(selection):null);
 function chooseSizes(next){mediaSizes={...mediaSizes,...next};localStorage.setItem('fia-download-media-sizes',JSON.stringify(mediaSizes));}
 function choosePreset(size){chooseSizes(Object.fromEntries(Object.keys(effectiveSizes).map(k=>[k,size])));}

 let savedSizes=$derived.by(()=>{const active=download?.active;if(!active||active.selection==='core')return '';const prepared=preparedDownloadSizes(active.manifest,active.selection);const values=Object.entries(prepared.groups).filter(([,g])=>g.included&&g.count).map(([key,g])=>active.manifest?.mediaSizes?.[key]||g.size);if(!values.length||values.some(v=>!prepared.labels[v]))return 'Saved sizes unavailable';return new Set(values).size===1?prepared.labels[values[0]]:'Custom';});
 let alive=true;
 async function refresh(){
  loading=true;error='';
  try{
   if(view==='downloads'){download=await libraryAdapter.downloadStatus(selectedPack);onstatus(download.saved);if(!download.choices?.some(c=>c.id===selection))selection=download.choices?.[0]?.id||'core';}
   else {languages=await libraryAdapter.languages();passages=await libraryAdapter.passages(language);}
  }catch(e){if(alive)error=e.message;}finally{if(alive)loading=false;}
 }
 onMount(()=>{refresh();return()=>alive=false;});
 const labels={core:'Text only',audio:'Text and audio',visual:'Text, audio, images and maps',all:'Text and all available resources'};
 const packageNames={core:'Small · default',visual:'No video',all:'Full'};
 const packageNotes={core:'Scripture, guide and app.',audio:'Adds recordings.',visual:'Leaves out video, which uses the most space.',all:'Everything, including video.'};
 async function chooseLanguage(id){onlanguage(id);passages=await libraryAdapter.passages(id);}
 // Opening a passage reports in its own card: busy while pending, then the server's
 // answer if it refused. A newer Open supersedes an older one.
 let opening=$state(null),openFailure=$state(null);let openToken=0;
 async function selectPack(id){if(opening===id)return;const token=++openToken;opening=id;openFailure=null;try{await onselect(id);}catch(e){if(token===openToken)openFailure={id,message:e?.message||'This passage could not be opened. Your current passage stays open.',code:e?.code};}finally{if(token===openToken)opening=null;}}
 const refusedLabel={'passage-unavailable':'Not available yet','passage-refused':'Cannot be opened'};
 async function save(){busy=true;error='';transfer=null;try{const result=await libraryAdapter.download(selection,value=>transfer=value,selectedPack,requestSizes);downloadFinished=result.saved!==false;if(result.timingPending)error='Files received. Recording timing is pending before offline playback.';}catch(e){error=e.message;}finally{busy=false;const failure=error;await refresh();error=failure||error;}}
 async function pause(){try{await libraryAdapter.pauseDownload(selectedPack);}catch(e){error=e.message;}}
 // Whole book: the same tier as the passage choice above, run passage by passage through the worker.
 let bookPacks=$state([]),bookStatusList=$state(null),bookChecking=$state(false),bookBusy=$state(false),bookProgress=$state(null),bookResult=$state(null);let bookStop=false;
 let bookName=$derived(String(selectedPack.title||'').replace(/\s+\d[\s\S]*$/,'')||'this book');
 let bookTotalsByTier=$derived(bookStatusList?bookTotals(bookStatusList):null);
 async function checkBook(){bookChecking=true;bookResult=null;try{bookPacks=bookPassages(await libraryAdapter.passages(selectedPack.language||language),selectedPack);bookStatusList=await bookStatuses(bookPacks,libraryAdapter);}catch(e){error=e.message;}finally{bookChecking=false;}}
 async function saveBook(){bookBusy=true;bookStop=false;bookResult=null;error='';try{bookResult=await downloadBook(bookPacks,selection,libraryAdapter,{onprogress:value=>bookProgress=value,shouldStop:()=>bookStop});}catch(e){error=e.message;}finally{bookBusy=false;bookProgress=null;await refresh();await checkBook();}}
 async function pauseBook(){bookStop=true;const pack=bookProgress?.pack;if(pack)try{await libraryAdapter.pauseDownload(pack);}catch(e){error=e.message;}}
 function bookLine(t){if(!t?.count)return 'Not offered in this book';return `${formatBytes(t.bytes)}${t.unknown?` + ${t.unknown} set during download`:''} · ${t.count} passages${t.saved?` · ${t.saved} saved`:''}`;}
 async function remove(){try{await libraryAdapter.removeDownload(selectedPack);confirmRemove=false;await refresh();}catch(e){error=e.message;}}
</script>
<div class="library-panel">
 {#if loading}<p role="status">Checking {view==='downloads'?'device storage':'available passages'}…</p>{/if}
 {#if error}<p class="library-message" role="alert">{error}</p>{/if}
 {#if view==='languages'}
  <p class="sheet-intro">Choose the language of your passage. Menus are currently in English.</p>
  <div class="library-list">{#each languages as item}<button class:chosen={language===item.id} aria-pressed={language===item.id} onclick={()=>chooseLanguage(item.id)}><span><strong>{item.nativeName}</strong><small>{item.ready?`${item.ready} passages with text available`:'No passage text available'}</small></span>{#if language===item.id}<Check size={20}/>{/if}</button>{/each}</div>
  <button class="secondary full" onclick={()=>onview('passages')}>Browse passages<ChevronRight size={18}/></button>
  <p class="fine-print">Recordings and resources are listed separately from passage text.</p>
 {:else if view==='passages'}
  <button class="quiet" onclick={()=>onview('languages')}>Language: {languages.find(l=>l.id===language)?.nativeName||language}</button>
  {#each passages as pack}
   {@const progress=pack.id===selectedPack.id?{completed,total}:progressSummary(localStorage,pack)}
   {@const failure=openFailure?.id===pack.id?openFailure:null}
   <article class="pack-card"><span class="library-eyebrow">{pack.language==='spa'?'Español':'English'} · Text available</span><h3>{pack.title}</h3>{#if refusedLabel[failure?.code]}<p>{refusedLabel[failure.code]}</p>{:else}<p>{guideRecordingAvailability(pack)} · Resources download manually</p>{/if}<p>{progress.completed}{progress.total?` of ${progress.total}`:''} activities completed · saved on this device</p>
    {#if progress.total}<progress aria-label="Saved passage progress" value={progress.completed} max={progress.total}></progress>{/if}
    <button class="secondary full" disabled={opening===pack.id} aria-busy={opening===pack.id?'true':undefined} onclick={()=>selectPack(pack.id)}>{progress.completed?'Resume passage':'Open passage'}<ChevronRight size={18}/></button>
    {#if failure}<p class="library-message" role="alert">{failure.message}</p>{/if}
    {#if confirmRestart===pack.id}<p>Start this passage again? Its saved progress will be cleared.</p><div class="library-actions"><button class="secondary" onclick={()=>{onreset(pack.id);confirmRestart=null;passages=[...passages];}}>Start again</button><button class="quiet" onclick={()=>confirmRestart=null}>Keep my place</button></div>{:else}<button class="quiet full" onclick={()=>confirmRestart=pack.id}><RotateCcw size={16}/>Restart passage</button>{/if}
   </article>
  {:else}{#if !loading}<p class="library-message">No passages in this language are included yet. Your current passage stays open.</p><button class="secondary full" onclick={()=>{chooseLanguage('eng');}}>Show English passages</button>{/if}{/each}
  <p class="fine-print">Selecting a language shows its existing source text; it does not translate a passage.</p>
 {:else if view==='downloads'}
  <article class="pack-card"><span class="library-eyebrow">{selectedPack.language==='spa'?'Español':'English'} · {selectedPack.title}</span><h3>Save this passage</h3>
   {#if download?.available}
    <p class="library-message" role="status">{download.saved?`Saved · ${labels[download.active.selection]}${savedSizes?` · ${savedSizes}`:''} · ${formatBytes(download.active.bytes)}`:download.active?'Download incomplete or cleared by the device. Download again to repair it.':'Not saved on this device'}</p>
    {#if downloadFinished}<p>The download is verified. Reload to use the saved version. Your place is kept.</p><button class="secondary full" onclick={()=>window.location.reload()}>Reload saved version</button>{/if}
    {#if download.updateAvailable}<p>A newer download is available. Your saved copy stays usable until the update finishes.</p>{/if}
    {#if download.pending&&!busy}<p>{download.pending.running?'A download is running in another window.':download.pending.status==='timing-pending'?'Files received · timing pending':'Interrupted download'} · {formatBytes(download.pending.received)} of {(download.pending.bytes===null?'total determined during download':formatBytes(download.pending.bytes))} verified. {download.pending.running?'Refresh to check its progress.':'Resume checks and reuses saved files.'}</p>{/if}
    <fieldset disabled={busy||bookBusy||download.pending?.running}><legend>Include in download</legend>{#each download.choices as choice}<label class="download-choice"><input type="radio" name="download-selection" value={choice.id} bind:group={selection} aria-labelledby={`download-choice-${choice.id}-name`} aria-describedby={`download-choice-${choice.id}-detail`}/><span><strong id={`download-choice-${choice.id}-name`}>{labels[choice.id]}</strong><small id={`download-choice-${choice.id}-detail`}>{packageNames[choice.id]?packageNames[choice.id]+' · ':''}{choiceTotals[choice.id]==null?'Size set during download':formatBytes(choiceTotals[choice.id])} · {packageNotes[choice.id]}</small></span></label>{/each}</fieldset>
    {#if selection!=='core'}<fieldset disabled={busy||bookBusy||download.pending?.running}><legend>Download size</legend><p class="fine-print">Smaller files use less storage. Requested files are prepared when needed.</p>{#each ['small','medium','large'] as size}<label class="download-choice"><input type="radio" name="download-size" value={size} checked={preset===size} disabled={!availablePresets.includes(size)} onchange={()=>choosePreset(size)}/><span>{sizes.labels[size]}{!availablePresets.includes(size)?' — not available for this selection':''}</span></label>{/each}{#if preset==='custom'||!preset}<p>{Object.values(effectiveSizes).includes('prepared')?'Custom sizes · Prepared version keeps the verified video as published; choose a size to request another version.':'Custom sizes · the prepared files use different sizes.'}</p>{/if}
    <details><summary>Choose sizes by media</summary>{#each [{id:'image',label:'Images and maps'},{id:'audio',label:'Audio'},{id:'video',label:'Video'}] as category}{@const group=sizes.groups[category.id]}<label class="select-row">{category.label}<select aria-label={category.label+' download size'} value={effectiveSizes[category.id]||group.size||''} onchange={e=>chooseSizes({[category.id]:e.currentTarget.value})} disabled={!group.included||!group.count}>{#if category.id==='video'&&group.prepared}<option value="prepared">Prepared version</option>{/if}{#if !group.size}<option value="">{!group.included?'Not included':'No prepared size'}</option>{/if}{#each ['small','medium','large'] as size}<option value={size} disabled={!group.requestable&&!group.available.includes(size)}>{sizes.labels[size]}{category.id==='video'?({small:' · 320p',medium:' · 540p',large:' · 912p'}[size]):''}{!group.requestable&&!group.available.includes(size)?' — not available yet':''}</option>{/each}</select></label>{#if !group.included}<p class="fine-print">Not included</p>{/if}{/each}</details></fieldset>{/if}
    <p class="fine-print">Text includes the app, Scripture and guide. Audio adds recordings; no video adds images and maps; full also adds videos. Download for offline use.</p>
    {#if transfer}<progress aria-label="Download progress" value={transfer.received} max={transfer.bytes||1}></progress><p role="status">{formatBytes(transfer.received)} of {(transfer.bytes===null?'total determined during download':formatBytes(transfer.bytes))} verified · {transfer.count} / {transfer.total} files</p>{/if}
    <p>{selectedTotal===null?'Size determined during download.':formatBytes(selectedTotal)+' to download'}</p>
    {#if busy}<button class="secondary full" onclick={pause}><Pause size={18}/>Pause download</button>{:else}<button class="secondary full" disabled={bookBusy||!download.manifest||download.pending?.running||!ready} onclick={save}><Download size={18}/>{download.pending&&resumeMatches?'Resume download':download.updateAvailable?'Update download':download.saved?'Save selection again':'Download selection'}</button>{/if}
    {#if download.active||download.pending}
     {#if confirmRemove}<p>Remove downloaded files? Your passage progress and settings will stay.</p><div class="library-actions"><button class="secondary" disabled={busy||download.pending?.running} onclick={remove}>Remove download</button><button class="quiet" onclick={()=>confirmRemove=false}>Keep download</button></div>{:else}<button class="quiet full" disabled={busy||download.pending?.running} onclick={()=>confirmRemove=true}><Trash2 size={16}/>Remove from device</button>{/if}
    {/if}
    <button class="quiet full" disabled={busy} onclick={refresh}>Check for updates and saved files</button>
    {#if download.error}<p class="fine-print">{download.error} {download.manifest?'Showing the last saved file list.':''}</p>{/if}
   {:else if download}<p class="library-message">{download.reason}</p>{/if}
  </article>
  {#if download?.available}
   <article class="pack-card book-card" aria-labelledby="book-download-title"><span class="library-eyebrow">{selectedPack.language==='spa'?'Español':'English'} · {bookName}</span><h3 id="book-download-title">Save the whole book</h3>
    <p class="fine-print">Saves every passage of {bookName} with the choice above ({labels[selection]}). Passages already saved are kept; an interrupted passage resumes from its verified files.</p>
    {#if !bookStatusList}<button class="secondary full" disabled={bookChecking||busy} aria-busy={bookChecking?'true':undefined} onclick={checkBook}>{bookChecking?'Checking book size…':'Check book size'}</button>
    {:else}
     <ul class="book-sizes" aria-label="Whole book size by package">{#each download.choices as choice}<li class:chosen={selection===choice.id}><strong>{labels[choice.id]}</strong><small>{bookLine(bookTotalsByTier[choice.id])}</small></li>{/each}</ul>
     {@const chosen=bookTotalsByTier[selection]}
     <p>{chosen.count?`${formatBytes(chosen.remaining)}${chosen.unknown?` + ${chosen.unknown} passages sized during download`:''} to download · ${chosen.count-chosen.saved} of ${chosen.count} passages`:'Nothing to save for this choice.'}</p>
     {#if bookProgress}<progress aria-label="Book download progress" value={bookProgress.index} max={bookProgress.total||1}></progress><p role="status">Passage {Math.min(bookProgress.index+1,bookProgress.total)} of {bookProgress.total}{bookProgress.pack?` · ${bookProgress.pack.title}`:''}{bookProgress.transfer?` · ${formatBytes(bookProgress.transfer.received)} verified`:''}</p>{/if}
     {#if bookResult}<p role="status">{bookResult.stopped?'Book download paused. Saved passages are kept; Download whole book resumes.':'Book download finished.'} {bookResult.saved} saved · {bookResult.skipped} already saved{bookResult.failed.length?` · ${bookResult.failed.length} not saved`:''}.</p>{/if}
     {#if bookBusy}<button class="secondary full" onclick={pauseBook}><Pause size={18}/>Pause book download</button>{:else}<button class="secondary full" disabled={busy||!chosen.count||chosen.saved===chosen.count||download.pending?.running} onclick={saveBook}><Download size={18}/>Download whole book</button>{/if}
    {/if}
   </article>
  {/if}
  <p class="fine-print">Sizes are file bytes, not browser storage overhead. Your device may clear downloaded files. Your place in the guide is saved separately. An update keeps the prior usable copy until the replacement is verified.</p>
 {/if}
</div>
<style>
 .book-sizes{list-style:none;padding:0;margin:16px 0}
 .book-sizes li{padding:10px 0;border-top:1px solid var(--line)}
 .book-sizes li:first-child{border-top:0}
 .book-sizes strong{display:block;font-size:1rem;font-weight:550}
 .book-sizes small{display:block;font-size:.875rem;color:var(--ink-500);margin-top:5px}
 .book-sizes li.chosen strong::after{content:' · chosen';font-weight:400;color:var(--ink-500)}
</style>
