<script>
 import {onMount} from 'svelte';
 import {Check,ChevronRight,Download,RotateCcw,Trash2,Pause} from 'lucide-svelte';
 import {libraryAdapter,bundledPack,formatBytes} from '../lib/library.js';
 import {progressSummary} from '../lib/session-store.js';
 let {view,selectedPack=bundledPack,language='eng',onlanguage,onselect,onreset,onview,completed=0,total=0,onstatus=()=>{}}=$props();
 let languages=$state([]),passages=$state([]),loading=$state(true),error=$state(''),download=$state(null),selection=$state('core'),busy=$state(false),transfer=$state(null),confirmRemove=$state(false),confirmRestart=$state(null),downloadFinished=$state(false);
 let alive=true;
 async function refresh(){
  loading=true;error='';
  try{
   if(view==='downloads'){download=await libraryAdapter.downloadStatus(selectedPack);onstatus(download.saved);if(!download.choices?.some(c=>c.id===selection))selection=download.choices?.[0]?.id||'core';}
   else {languages=await libraryAdapter.languages();passages=await libraryAdapter.passages(language);}
  }catch(e){if(alive)error=e.message;}finally{if(alive)loading=false;}
 }
 onMount(()=>{refresh();return()=>alive=false;});
 const labels={core:'Text only',audio:'Text and audio',all:'Text and all available resources'};
 async function chooseLanguage(id){onlanguage(id);passages=await libraryAdapter.passages(id);}
 async function selectPack(id){try{busy=true;await onselect(id);}catch(e){error=e.message;}finally{busy=false;}}
 async function save(){busy=true;error='';transfer=null;try{await libraryAdapter.download(selection,value=>transfer=value,selectedPack);downloadFinished=true;}catch(e){error=e.message;}finally{busy=false;const failure=error;await refresh();error=failure||error;}}
 async function pause(){try{await libraryAdapter.pauseDownload(selectedPack);}catch(e){error=e.message;}}
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
   <article class="pack-card"><span class="library-eyebrow">{pack.language==='spa'?'Español':'English'} · Text available</span><h3>{pack.title}</h3><p>{pack.capabilities.guideNarration.count?'Guide recordings available':'Guide recordings unavailable'} · Resources download manually</p><p>{progress.completed}{progress.total?` of ${progress.total}`:''} activities completed · saved on this device</p>
    {#if progress.total}<progress aria-label="Saved passage progress" value={progress.completed} max={progress.total}></progress>{/if}
    <button class="secondary full" onclick={()=>selectPack(pack.id)}>{progress.completed?'Resume passage':'Open passage'}<ChevronRight size={18}/></button>
    {#if confirmRestart===pack.id}<p>Start this passage again? Its saved progress will be cleared.</p><div class="library-actions"><button class="secondary" onclick={()=>{onreset(pack.id);confirmRestart=null;passages=[...passages];}}>Start again</button><button class="quiet" onclick={()=>confirmRestart=null}>Keep my place</button></div>{:else}<button class="quiet full" onclick={()=>confirmRestart=pack.id}><RotateCcw size={16}/>Restart passage</button>{/if}
   </article>
  {:else}{#if !loading}<p class="library-message">No passages in this language are included yet. Your current passage stays open.</p><button class="secondary full" onclick={()=>{chooseLanguage('eng');}}>Show English passages</button>{/if}{/each}
  <p class="fine-print">Selecting a language shows its existing source text; it does not translate a passage.</p>
 {:else if view==='downloads'}
  <article class="pack-card"><span class="library-eyebrow">{selectedPack.language==='spa'?'Español':'English'} · {selectedPack.title}</span><h3>Keep this passage on your device</h3>
   {#if download?.available}
    <p class="library-message" role="status">{download.saved?`Saved · ${labels[download.active.selection]} · ${formatBytes(download.active.bytes)}`:download.active?'Download incomplete or cleared by the device. Download again to repair it.':'Not saved for offline use'}</p>
    {#if downloadFinished}<p>The download is verified. Reload to use the saved version. Your place is kept.</p><button class="secondary full" onclick={()=>window.location.reload()}>Reload saved version</button>{/if}
    {#if download.updateAvailable}<p>A newer download is available. Your saved copy stays usable until the update finishes.</p>{/if}
    {#if download.pending&&!busy}<p>{download.pending.running?'A download is running in another window.':'Interrupted download'} · {formatBytes(download.pending.received)} of {formatBytes(download.pending.bytes)} verified. {download.pending.running?'Refresh to check its progress.':'Resume checks and reuses saved files.'}</p>{/if}
    <fieldset disabled={busy||download.pending?.running}><legend>Include in download</legend>{#each download.choices as choice}<label class="download-choice"><input type="radio" name="download-selection" value={choice.id} bind:group={selection}/><span><strong>{labels[choice.id]}</strong><small>{formatBytes(choice.bytes)} total</small></span></label>{/each}</fieldset>
    <p class="fine-print">Text only includes the app, Scripture and guide. Audio adds recordings. All available resources adds the packaged images and videos. Resources stay unavailable until you explicitly download them. Sizes are file bytes, not browser storage overhead.</p>
    {#if transfer}<progress aria-label="Download progress" value={transfer.received} max={transfer.bytes||1}></progress><p role="status">{formatBytes(transfer.received)} of {formatBytes(transfer.bytes)} verified · {transfer.count} / {transfer.total} files</p>{/if}
    {#if busy}<button class="secondary full" onclick={pause}><Pause size={18}/>Pause download</button>{:else}<button class="secondary full" disabled={!download.manifest||download.pending?.running} onclick={save}><Download size={18}/>{download.pending&&selection===download.pending.selection?'Resume download':download.updateAvailable?'Update download':download.saved?'Save selection again':'Download selection'}</button>{/if}
    {#if download.active||download.pending}
     {#if confirmRemove}<p>Remove downloaded files? Your passage progress and settings will stay.</p><div class="library-actions"><button class="secondary" disabled={busy||download.pending?.running} onclick={remove}>Remove download</button><button class="quiet" onclick={()=>confirmRemove=false}>Keep download</button></div>{:else}<button class="quiet full" disabled={busy||download.pending?.running} onclick={()=>confirmRemove=true}><Trash2 size={16}/>Remove from device</button>{/if}
    {/if}
    <button class="quiet full" disabled={busy} onclick={refresh}>Check for updates and saved files</button>
    {#if download.error}<p class="fine-print">{download.error} {download.manifest?'Showing the last saved file list.':''}</p>{/if}
   {:else if download}<p class="library-message">{download.reason}</p>{/if}
  </article>
  <p class="fine-print">An update may temporarily keep a previous copy for open windows. Remove from device clears this passage’s copies. Browser storage can be cleared by your device. Your other downloaded passages and saved progress stay on this device.</p>
 {/if}
</div>
