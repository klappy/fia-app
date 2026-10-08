<script>
 import {contentIcons as icons,sectionIcons,guideIcon} from '../lib/progress-icons.js';
 let {groups,onopen=()=>{},onselect=()=>{},overview=false}=$props();
 let active=$derived(groups.find(g=>g.active)||groups[0]);
 let activeIndex=$derived(Math.max(0,groups.findIndex(g=>g.active)));
 let stageWords=$derived(`${active.title} · Step ${activeIndex+1} · screen ${Math.max(0,active.current)+1} of ${active.screens.length}${active.current<active.screens.length-1?' · more ahead':''}`);
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
 <!-- One bar, six stage icons (cookbook design/alpha-system/components/progress-rail.md § One bar, adopted 2026-10-08).
      The per-screen bead row is gone from the bar; within-stage position lives in the overview and in the spoken words. -->
 <button class="session-progress" aria-label="Session progress: open section overview" onclick={onopen}>
  <span class="stage-bar" role="progressbar" aria-label="Session progress" aria-valuemin="1" aria-valuemax={groups.length} aria-valuenow={activeIndex+1} aria-valuetext={stageWords}>
   <span class="stage-bar-fill" aria-hidden="true" style:width={`calc(${groups.length>1?activeIndex/(groups.length-1)*100:0}% - 16px)`}></span>
   {#each groups as group,i}{@const StageIcon=sectionIcons[i]||sectionIcons[0]}
    <span class="stage-cell" class:complete={i<activeIndex||group.ratio===1} class:current={group.active} aria-hidden="true"><StageIcon size={20}/></span>
   {/each}
  </span>
  <span class="stage-words" aria-hidden="true"><b>{active.title}</b> · Step {activeIndex+1}</span>
 </button>
{/if}
