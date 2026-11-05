<script>
 import {onMount, untrack} from 'svelte';
 import ResourceIdentification from './ResourceIdentification.svelte';
 import {createSmoothFollow} from '../lib/smooth-follow.js';
 import {SCRIPTURE_WORD_HIGHLIGHT} from '../lib/scripture-passage.js';
 import {leadingPosition, wordPair, alignedSegments, followScrollTop, durationScrollTop, readingEdgeSpace, clearReadingRect} from '../lib/alignment.js';
 let {asset, playback={src:null,elapsed:0,playing:false}, suspended=false,identification=null}=$props();
 let viewport=$state(), following=$state(true), reducedMotion=$state(false), revision=$state(0), ready=$state(false), edgeSpace=$state({leading:0,trailing:0});
 let lastScrollTarget=null,scroller;
 let resourceId=$derived(asset.id);
 // R2: the clip names the reading it voices; a URL comparison misses server passages that play from a blob.
 let active=$derived(!!playback.assetId&&playback.assetId===asset.id);
 let blocks=$derived(asset.verses||[{text:asset.text||asset.description||''}]);
 // A together-list voices one item at a time: the alignment is the one for the item being read.
 let alignment=$derived(asset.list?asset.alignments?.[asset.activeItemId]:asset.alignment);
 let position=$derived(active?leadingPosition(alignment,playback.elapsed):null);
 // The two words the gel covers: the spoken word and its partner (n and n+1, sliding one word at a time).
 let pair=$derived(position&&position.wordIndex>=0?wordPair(position.wordIndex,alignment.verses[position.verseIndex].words.length):null);
 const scrollKeys=new Set(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' ']);
 function explore(){scroller?.stop();if(viewport?.scrollHeight>viewport?.clientHeight){if(following&&active)viewport.scrollTo({top:viewport.scrollTop,behavior:'instant'});lastScrollTarget=null;following=false;}}
 function clearViewport(){
  const rect=viewport.getBoundingClientRect(),scene=viewport.closest('.scene');
  const top=scene?.querySelector('.scene-glass-top')?.getBoundingClientRect().bottom;
  const bottom=scene?.querySelector('.scene-glass-bottom')?.getBoundingClientRect().top;
  return clearReadingRect(rect,top??rect.top,bottom??rect.bottom);
 }
 // The clear area as the band leaves it without a raised notice; a dismissible notice must not open a reading-centre void.
 function bandViewport(){
  const rect=viewport.getBoundingClientRect(),scene=viewport.closest('.scene'),glass=scene?.querySelector('.scene-glass-top');
  const band=glass?parseFloat(getComputedStyle(glass).scrollMarginTop):NaN;
  if(!glass||!Number.isFinite(band)||band<=0)return clearViewport();
  const bottom=scene.querySelector('.scene-glass-bottom')?.getBoundingClientRect().top;
  return clearReadingRect(rect,glass.getBoundingClientRect().top+band,bottom??rect.bottom);
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
  if(!alignment){
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
 // Gel highlight (cookbook PR #276, S29): an aria-hidden overlay positioned from the active word's Range rect. The text is never touched.
 let gel,gelLayer,gelY=null;
 function wordRect(word){
  const range=typeof document.createRange==='function'?document.createRange():null;
  if(range){range.selectNodeContents(word);const rect=range.getClientRects?.()[0];if(rect)return rect;}
  return word.getBoundingClientRect();
 }
 function placeGel(){
  if(!gel||!gelLayer)return;
  const at=i=>viewport?.querySelector(`[data-align-word="${position.verseIndex}-${i}"]`);
  const word=SCRIPTURE_WORD_HIGHLIGHT&&active&&position&&position.wordIndex>=0&&pair?at(position.wordIndex):null;
  if(!word){gel.hidden=true;gelY=null;return;}
  // Two words wide, sliding one word at a time; a pair that wraps keeps the gel on the line of the word being spoken.
  const one=wordRect(word),a=wordRect(at(pair.first)||word),z=wordRect(at(pair.last)||word);
  const r=Math.abs(a.top-z.top)<=2?{left:a.left,top:a.top,width:z.right-a.left,height:a.height}:{left:one.left,top:one.top,width:one.width,height:one.height};
  const b=gelLayer.getBoundingClientRect(),x=r.left-b.left-4,y=r.top-b.top-1,w=r.width+8,h=r.height+2;
  const put=(left,width)=>{gel.style.left=`${left}px`;gel.style.top=`${y}px`;gel.style.width=`${width}px`;gel.style.height=`${h}px`;};
  const jump=gel.hidden||gelY===null||Math.abs(y-gelY)>2;
  if(jump){
   // First word or a line change: collapse and re-grow from the line start, no vertical slide through the text.
   gel.classList.add('freeze');gel.hidden=false;put(x,0);void gel.offsetWidth;gel.classList.remove('freeze');
   gel.classList.toggle('cut-l',gelY!==null);
  }else gel.classList.remove('cut-l');
  put(x,w);gelY=y;
 }
 $effect(()=>{position;pair;revision;ready;active;if(ready)untrack(placeGel);});
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
    edgeSpace=readingEdgeSpace(bandViewport().height||viewport.clientHeight,body.scrollHeight,lineHeight,headingHeight);
   }
   lastScrollTarget=null;revision++;
  };
  measure();document.fonts?.ready?.then(()=>revision++);
  const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(measure):null;
  if(viewport)observer?.observe(viewport);if(body)observer?.observe(body);
  viewport.closest('.scene')?.querySelectorAll('.scene-glass').forEach(frame=>observer?.observe(frame));
  return()=>{scroller.stop();media?.removeEventListener('change',update);observer?.disconnect();};
 });
</script>
{#snippet spoken(text)}{#each alignedSegments(text,alignment?.verses[0]?.words) as segment}{#if segment.wordIndex!==undefined}<span data-align-word={`0-${segment.wordIndex}`} data-active={SCRIPTURE_WORD_HIGHLIGHT&&pair&&position.verseIndex===0&&segment.wordIndex>=pair.first&&segment.wordIndex<=pair.last?'true':undefined}>{segment.text}</span>{:else}{segment.text}{/if}{/each}{/snippet}
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (This focusable reading region listens for native scrolling intent; it does not intercept keys or act as a button.) -->
<div bind:this={viewport} class="scripture-scroll" style:padding-top={`calc(var(--chrome-top, 0px) + ${edgeSpace.leading}px)`} style:padding-bottom={`calc(var(--chrome-bottom, 0px) + ${edgeSpace.trailing}px)`} role="region" tabindex="0" aria-label={asset.kind==='scripture'?'Scripture passage':'Guide text'} onwheel={explore} onpointerdown={explore} ontouchstart={explore} onkeydown={e=>{if(scrollKeys.has(e.key))explore();}}>
 <div class="reading-verses">
 {#if identification||['scripture','term'].includes(asset.kind)}
  <ResourceIdentification asset={identification||asset}/>
 {/if}
 {#if asset.list}
 <p data-reading-item aria-current={asset.activeItemId===asset.id?'true':undefined}>{#if asset.activeItemId===asset.id}{@render spoken(asset.text)}{:else}{asset.text}{/if}</p>
 <svelte:element this={asset.marker==='numbered'?'ol':'ul'} class="reading-list" class:numbered={asset.marker==='numbered'} class:bulleted={asset.marker==='bulleted'}>{#each asset.list as item}<li data-reading-item aria-current={asset.activeItemId===item.id?'true':undefined}>{#if asset.activeItemId===item.id}{@render spoken(item.text)}{:else}{item.text}{/if}</li>{/each}</svelte:element>
 {:else}
 {#each blocks as verse,i}
  <p aria-current={position?.verseIndex===i?'true':undefined}>{#if i===0&&asset.ordinal}<span class="list-ordinal">{asset.ordinal}.</span>{" "}{/if}{#if verse.number}<sup>{verse.number}</sup>{/if}{#each alignedSegments(verse.text,alignment?.verses[i]?.words) as segment}{#if segment.wordIndex!==undefined}<span data-align-word={`${i}-${segment.wordIndex}`} data-active={SCRIPTURE_WORD_HIGHLIGHT&&pair&&position.verseIndex===i&&segment.wordIndex>=pair.first&&segment.wordIndex<=pair.last?'true':undefined}>{segment.text}</span>{:else}{segment.text}{/if}{/each}</p>
 {/each}
 {/if}
 <div class="gel-layer" aria-hidden="true" bind:this={gelLayer}><div class="gel" bind:this={gel} hidden><i class="gel-tint"></i><i class="gel-chrome"></i></div></div>
 </div>
</div>
{#if active&&!following}<button class="follow-reading" onclick={follow}>Follow reading</button>{/if}
