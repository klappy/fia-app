<script>
  import {tick} from 'svelte';
  import ZoomableVisual from './ZoomableVisual.svelte';
  import AlignedReading from './AlignedReading.svelte';
  import ResourceIdentification from './ResourceIdentification.svelte';
  import { Pin, PinOff, Volume2, VolumeX, Play, X } from 'lucide-svelte';
  let { asset, playback, inlineVideo=null, immersive=false, matchingVideo=null, onvideo=()=>{}, descriptionsEnabled=false, ontoggledescription=()=>{}, suspended=false, toolsVisible=false, pinned=false, onpin=()=>{}, ondescribe=()=>{}, ontime=()=>{}, onplay=()=>{}, onpause=()=>{}, onend=()=>{}, onerror=()=>{}, ondownload=()=>{} } = $props();
  let frameReady=$state(false);
  let poster=$derived(inlineVideo?asset.src:asset.poster);
  function awaitFrame(node){
    frameReady=false;
    let alive=true;
    const ready=()=>{if(alive)frameReady=true;};
    const callback=node.requestVideoFrameCallback?.(ready);
    const fallback=()=>{if(!node.requestVideoFrameCallback)ready();};
    node.addEventListener("loadeddata",fallback);
    return {destroy(){alive=false;if(callback!==undefined)node.cancelVideoFrameCallback?.(callback);node.removeEventListener("loadeddata",fallback);}};
  }
  let expanded=$state(false), failed=$state(false), video=$state(), dialog=$state(), expandButton;
  function balanceCredit(node){
    const frame=node.parentElement;
    const measure=()=>frame.style.setProperty('--resource-credit-height',node.getBoundingClientRect().height+'px');
    measure();
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(measure):null;
    observer?.observe(node);
    return {destroy(){observer?.disconnect();frame.style.removeProperty('--resource-credit-height');}};
  }
  async function expand(){if(expanded)return;expandButton=document.activeElement;expanded=true;await tick();dialog?.showModal();}
  function close(){dialog?.close();expanded=false;tick().then(()=>expandButton?.focus());}
</script>

<div class:reading-stage={asset.kind==='scripture'||asset.kind==='term'} class:resource-visual={['image','map','video'].includes(asset.kind)} class="media-stage" data-kind={asset.kind}>
  {#if ['image','map','video'].includes(asset.kind)}<div class="visual-identification" use:balanceCredit><ResourceIdentification asset={inlineVideo&&frameReady?inlineVideo:asset}/></div>{/if}
  {#if asset.downloadRequired}<div class="media-error"><p>This resource has not been downloaded. You can continue with the passage text.</p><button class="quiet" onclick={ondownload}>Open Downloads</button></div>
  {:else if asset.kind==='scripture'}
    <AlignedReading {asset} {playback} {suspended}/>
  {:else if asset.kind==='term'}
    <AlignedReading {asset} {playback} {suspended}/>
  {:else if asset.kind==='video'||inlineVideo}
    <div class="video-well">
      <!-- svelte-ignore a11y_media_has_caption (Source videos lack captions; documented as an accessibility gap, not disguised with a placeholder track.) -->
      <video use:awaitFrame bind:this={video} src={(inlineVideo||asset).src} poster={poster} controls={toolsVisible} playsinline preload="none" ontimeupdate={ontime} onloadedmetadata={ontime} ondurationchange={ontime} onseeked={ontime} onplay={onplay} onpause={onpause} onended={onend} onerror={()=>{failed=true;onerror();}} aria-label={asset.title}>
        <!-- Source videos do not supply caption tracks. -->
      </video>
      {#if poster&&!frameReady}<img class="video-loading-poster" src={poster} alt="" aria-hidden="true"/>{/if}
      {#if failed}<div class="media-error">The video couldn’t load. Try again while connected, or continue without it.<button class="quiet" onclick={()=>{failed=false;video?.load();}}>Try again</button></div>{/if}
    </div>
  {:else}
    <ZoomableVisual {asset} fullscreen={immersive} onexpand={expand}/>
    {#if expanded}
     <dialog bind:this={dialog} class="visual-dialog" aria-label={`${asset.title} full screen`} oncancel={e=>{e.preventDefault();close();}} onclose={()=>expanded=false}>
      <div class="sr-only"><ResourceIdentification {asset}/></div>
      <ZoomableVisual {asset} fullscreen/>
      <button class="glass-icon visual-close" aria-label="Close full screen" title="Close full screen" onclick={close}><X size={24}/></button>
     </dialog>
    {/if}
  {/if}
  {#if toolsVisible}<div class="asset-caption"><div><strong>{asset.subtitle||asset.title}</strong><span>{asset.source}</span></div><div class="asset-actions"><button class="icon-button" aria-label={pinned?'Unpin visual':'Keep visual on stage'} title={pinned?'Unpin':'Keep visible'} onclick={onpin}>{#if pinned}<PinOff size={17}/>{:else}<Pin size={17}/>{/if}</button>{#if asset.kind!=='scripture'&&asset.kind!=='video'}<button class="icon-button" title="Hear description" aria-label="Hear description" onclick={ondescribe}><Volume2 size={18}/></button>{/if}</div></div>{/if}
</div>

<style>
 .video-well{position:relative;}
 .video-loading-poster{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;}
</style>
