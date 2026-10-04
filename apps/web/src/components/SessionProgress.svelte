<script>
 import {MoreHorizontal} from 'lucide-svelte';
 import {contentIcons as icons,sectionIcons,guideIcon} from '../lib/progress-icons.js';
 import {visibleProgress} from '../lib/progress.js';
 let {groups,onopen=()=>{},onselect=()=>{},overview=false}=$props();
 let active=$derived(groups.find(g=>g.active)||groups[0]);
 let ActiveIcon=$derived(sectionIcons[groups.findIndex(g=>g.active)]||guideIcon);
 let windowed=$derived(visibleProgress(active.screens,active.current,5));
</script>
{#if overview}
 <div class="progress-overview" aria-label="Session sections">
  {#each groups as group,i}{@const SectionIcon=sectionIcons[i]||sectionIcons[0]}
   <div class="progress-map-section">
    <h3 class="progress-map-heading"><button class="progress-section-choice" aria-label={group.title} aria-current={group.active?'step':undefined} onclick={()=>onselect(group.screens[0].activityId,true)}><SectionIcon size={28}/><span>{group.title}</span></button></h3>
    <div class="progress-map-items" aria-label={group.title}>
     {#each group.screens as screen,j}{@const Icon=icons[screen.kind]||guideIcon}
      <button class="progress-map-item" class:complete={screen.complete} aria-current={screen.current?'step':undefined} aria-label={`${group.title}, ${j+1}: ${screen.label}`} onclick={()=>onselect(screen.activityId,false)}>
       {#if screen.thumbnail}<img src={screen.thumbnail} alt=""/>{:else}<Icon size={20}/>{/if}
      </button>
     {/each}
    </div>
   </div>
  {/each}
 </div>
{:else}
 <button class="session-progress" aria-label="Session progress: open section overview" onclick={onopen}>
  <span class="section-progress-line">
   {#each groups as group}
    <span class="section-progress-segment" class:active={group.active} style:--position={group.positionRatio*100+'%'} aria-hidden="true"><span style:width={group.positionRatio*100+'%'}></span></span>
   {/each}
   <span class="sr-only">{active.title}</span>
  </span>
  <span class="content-progress-line">
   <span class="current-section-icon" aria-hidden="true"><ActiveIcon size={23}/></span>
   {#if windowed.before}<MoreHorizontal size={14} aria-hidden="true"/>{/if}
   {#each windowed.screens as screen}{@const Icon=icons[screen.kind]||guideIcon}
    <span class="content-progress-bead" class:complete={screen.complete} class:current={screen.current} aria-hidden="true">
     <Icon size={18}/>
    </span>
   {/each}
   {#if windowed.after}<MoreHorizontal size={14} aria-hidden="true"/>{/if}
   <span class="sr-only">{Math.max(0,active.current)+1} of {active.screens.length} screens</span>
  </span>
 </button>
{/if}
