<script>
 import {contentIcons as icons,sectionIcons,guideIcon} from '../lib/progress-icons.js';
 let {groups,onopen=()=>{},onselect=()=>{},overview=false}=$props();
 // Every mini-map item carries a visible word (cookbook overview-sheet.md § Blocks, Mini-map): the kind word in user words (§ Copy rules).
 const kindWords={guide:'listen',scripture:'Scripture',discussion:'discuss',term:'key term',image:'picture',map:'map',video:'video'};
 let active=$derived(groups.find(g=>g.active)||groups[0]);
 let activeIndex=$derived(Math.max(0,groups.findIndex(g=>g.active)));
 // Design-book words (progress-rail § Copy rules): `<name> · Step n`, then `unit n of m` with `more ahead` or `last unit`; `complete` once the session is done.
 let stageWords=$derived(active.current<0?`${active.title} · Step ${activeIndex+1} · complete`:`${active.title} · Step ${activeIndex+1} · unit ${active.current+1} of ${active.screens.length} · ${active.current<active.screens.length-1?'more ahead':'last unit'}`);
</script>
{#if overview}
 <div class="progress-overview" aria-label="Session sections">
  {#each groups as group,i}{@const SectionIcon=sectionIcons[i]||sectionIcons[0]}
   <div class="progress-map-section">
    <h3 class="progress-map-heading"><button class="progress-section-choice" aria-label={group.title} aria-current={group.active?'step':undefined} onclick={()=>onselect(group.screens[0].activityId,true)}><SectionIcon size={28}/><span>{group.title}</span></button></h3>
    <div class="progress-map-items" aria-label={group.title}>
     {#each group.screens as screen,j}{@const Icon=icons[screen.kind]||guideIcon}
      <button class="progress-map-item" class:complete={screen.complete} aria-current={screen.current?'step':undefined} aria-label={`${group.title}, ${j+1}: ${screen.label}`} onclick={()=>onselect(screen.activityId,false)}>
       {#if screen.thumbnail}<img src={screen.thumbnail} alt=""/>{:else}<Icon size={20}/>{/if}<small class="progress-map-word" aria-hidden="true">{kindWords[screen.kind]||kindWords.guide}</small>
      </button>
     {/each}
    </div>
   </div>
  {/each}
 </div>
{:else}
 <!-- One bar, six stage icons (cookbook design/alpha-system/components/progress-rail.md § One bar, adopted 2026-10-08).
      The per-screen bead row is gone from the bar; within-stage position lives in the overview and in the spoken words. -->
 <!-- The words live outside the button so assistive tech hears them: a button's aria-label overrides its children. -->
 <span id="session-progress-words" class="sr-only session-progress-words" role="progressbar" aria-label="Session progress" aria-valuemin="1" aria-valuemax={groups.length} aria-valuenow={activeIndex+1} aria-valuetext={stageWords}>{stageWords}</span>
 <button class="session-progress" aria-label="Session progress: open section overview" aria-describedby="session-progress-words" onclick={onopen}>
  <span class="stage-bar" aria-hidden="true">
   <span class="stage-bar-fill" style:width={`calc(${groups.length>1?activeIndex/(groups.length-1):0} * (100% - 32px))`}></span>
   {#each groups as group,i}{@const StageIcon=sectionIcons[i]||sectionIcons[0]}
    <span class="stage-cell" class:complete={i<activeIndex||group.ratio===1} class:current={group.active}><StageIcon size={20}/></span>
   {/each}
  </span>
  <span class="stage-words" aria-hidden="true"><b>{active.title}</b> · Step {activeIndex+1}</span>
 </button>
{/if}
<style>
 .progress-map-items{grid-template-columns:repeat(auto-fill,minmax(64px,1fr))}
 .progress-map-item{flex-direction:column;gap:2px;min-width:48px;min-height:48px;padding:4px 2px}
 .progress-map-word{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.6875rem;line-height:1.2}
</style>
