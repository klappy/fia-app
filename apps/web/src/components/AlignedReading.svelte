<script>
 import {onMount, untrack} from 'svelte';
 import ResourceIdentification from './ResourceIdentification.svelte';
 import {createSmoothFollow} from '../lib/smooth-follow.js';
 import {alignmentPosition, alignedSegments, followScrollTop, durationScrollTop, readingEdgeSpace, clearReadingRect} from '../lib/alignment.js';
 let {asset, playback={src:null,elapsed:0,playing:false}, suspended=false,identification=null}=$props();
 let viewport=$state(), following=$state(true), reducedMotion=$state(false), revision=$state(0), ready=$state(false), edgeSpace=$state({leading:0,trailing:0});
 let lastScrollTarget=null,scroller;
 let resourceId=$derived(asset.id);
 let active=$derived(!!asset.descriptionAudio && playback.src===asset.descriptionAudio);
 let blocks=$derived(asset.verses||[{text:asset.text||asset.description||''}]);
 let position=$derived(active?alignmentPosition(asset.alignment,playback.elapsed):null);
 const scrollKeys=new Set(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' ']);
 function explore(){scroller?.stop();if(viewport?.scrollHeight>viewport?.clientHeight){if(following&&active)viewport.scrollTo({top:viewport.scrollTop,behavior:'instant'});lastScrollTarget=null;following=false;}}
 function clearViewport(){
  const rect=viewport.getBoundingClientRect(),scene=viewport.closest('.scene');
  const top=scene?.querySelector('.scene-glass-top')?.getBoundingClientRect().bottom;
  const bottom=scene?.querySelector('.scene-glass-bottom')?.getBoundingClientRect().top;
  return clearReadingRect(rect,top??rect.top,bottom??rect.bottom);
 }
 function follow(){following=true;lastScrollTarget=null;scrollToReading();}
 function scrollToReading(){
  if(!viewport)return;
  if(asset.list){
   if(viewport.scrollHeight<=viewport.clientHeight)return;
   const target=viewport.querySelector('[data-reading-item][aria-current="true"]');
   if(target){const top=followScrollTop(clearViewport(),target.getBoundingClientRect(),viewport.scrollTop,viewport.scrollHeight);
    if(top!==null&&(lastScrollTarget===null||Math.abs(top-lastScrollTarget)>=1)){lastScrollTarget=top;scroller?.to(top,reducedMotion);}}
   return;
  }
  if(!asset.alignment){
   const top=durationScrollTop(playback,viewport.clientHeight,viewport.scrollHeight);
   if(top!==null&&Math.abs(top-viewport.scrollTop)>=1)scroller?.to(top,reducedMotion);
   return;
  }
  if(!position)return;
  const target=position.wordIndex<0?viewport.querySelectorAll('.reading-verses > p')[position.verseIndex]:viewport.querySelector(`[data-align-word="${position.verseIndex}-${position.wordIndex}"]`);
  if(!target)return;
  const top=followScrollTop(clearViewport(),target.getBoundingClientRect(),viewport.scrollTop,viewport.scrollHeight);
  if(top!==null&&(lastScrollTarget===null||Math.abs(top-lastScrollTarget)>=1)){lastScrollTarget=top;scroller?.to(top,reducedMotion);}
 }
 $effect(()=>{resourceId;scroller?.stop();lastScrollTarget=null;following=true;if(viewport)viewport.scrollTop=0;});
 $effect(()=>{
  // Recheck on clock ticks, layout/text-size changes and pause/resume. Reading progress
  // must not take the screen back after a person's scroll or while a sheet is open.
  position;asset.activeItemId;revision;reducedMotion;playback.elapsed;playback.duration;playback.progressElapsed;playback.progressDuration;
  if(ready&&active&&playback.playing&&following&&!suspended)untrack(scrollToReading);
  else {scroller?.stop();lastScrollTarget=null;}
 });
 onMount(()=>{
  scroller=createSmoothFollow(viewport);
  const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const update=()=>reducedMotion=!!media?.matches;update();ready=true;media?.addEventListener('change',update);
  const body=viewport?.querySelector('.reading-verses');
  const measure=()=>{
   if(viewport&&body){
    const paragraph=body.querySelector('p');
    const style=paragraph?getComputedStyle(paragraph):null;
    const lineHeight=parseFloat(style?.lineHeight)||((parseFloat(style?.fontSize)||24)*1.6);
    const headingHeight=paragraph?Math.max(0,paragraph.getBoundingClientRect().top-body.getBoundingClientRect().top):0;
    edgeSpace=readingEdgeSpace(clearViewport().height||viewport.clientHeight,body.scrollHeight,lineHeight,headingHeight);
   }
   lastScrollTarget=null;revision++;
  };
  measure();
  const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(measure):null;
  if(viewport)observer?.observe(viewport);if(body)observer?.observe(body);
  viewport.closest('.scene')?.querySelectorAll('.scene-glass').forEach(frame=>observer?.observe(frame));
  return()=>{scroller.stop();media?.removeEventListener('change',update);observer?.disconnect();};
 });
</script>
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (This focusable reading region listens for native scrolling intent; it does not intercept keys or act as a button.) -->
<div bind:this={viewport} class="scripture-scroll" style:padding-top={`calc(var(--chrome-top, 0px) + ${edgeSpace.leading}px)`} style:padding-bottom={`calc(var(--chrome-bottom, 0px) + ${edgeSpace.trailing}px)`} role="region" tabindex="0" aria-label={asset.kind==='scripture'?'Scripture passage':'Guide text'} onwheel={explore} onpointerdown={explore} ontouchstart={explore} onkeydown={e=>{if(scrollKeys.has(e.key))explore();}}>
 <div class="reading-verses">
 {#if identification||['scripture','term'].includes(asset.kind)}
  <ResourceIdentification asset={identification||asset}/>
 {/if}
 {#if asset.list}
 <p data-reading-item aria-current={asset.activeItemId===asset.id?'true':undefined}>{asset.text}</p>
 <ul class="reading-list">{#each asset.list as item}<li data-reading-item aria-current={asset.activeItemId===item.id?'true':undefined}>{item.text}</li>{/each}</ul>
 {:else}
 {#each blocks as verse,i}
  <p aria-current={position?.verseIndex===i?'true':undefined}>{#if verse.number}<sup>{verse.number}</sup>{/if}{#each alignedSegments(verse.text,asset.alignment?.verses[i]?.words) as segment}{#if segment.wordIndex!==undefined}<span data-align-word={`${i}-${segment.wordIndex}`}>{segment.text}</span>{:else}{segment.text}{/if}{/each}</p>
 {/each}
 {/if}
 </div>
</div>
{#if active&&!following}<button class="follow-reading" onclick={follow}>Follow reading</button>{/if}
