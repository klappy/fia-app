<script>
 import {Check} from 'lucide-svelte';
 import {contentIcons as icons,sectionIcons,guideIcon,kindWords} from '../lib/progress-icons.js';
 let {groups,onopen=()=>{},onselect=()=>{},overview=false}=$props();
 // Overview spine: the current stage starts open; tapping another stage's row opens its items in place.
 let toggled=$state(new Set());
 const isOpen=i=>toggled.has(i)!==(i===activeIndex);
 function toggle(i){const next=new Set(toggled);next.has(i)?next.delete(i):next.add(i);toggled=next;}
 // One caption line carries the visible word (O1): `7 done · discuss now · 3 to go`.
 function caption(group){
  const done=group.screens.filter(s=>s.complete).length,at=group.screens.findIndex(s=>s.current);
  if(at<0)return `${done} done · ${group.screens.length-done} to go`;
  const ahead=group.screens.slice(at+1).length;
  return `${done} done · ${kindWords[group.screens[at].kind]||kindWords.guide} now · ${ahead} to go`;
 }
 let active=$derived(groups.find(g=>g.active)||groups[0]);
 let activeIndex=$derived(Math.max(0,groups.findIndex(g=>g.active)));
 // Design-book words (progress-rail § Copy rules): `<name> · Step n`, then `unit n of m` with `more ahead` or `last unit`; `complete` once the session is done.
 let stageWords=$derived(active.current<0?`${active.title} · Step ${activeIndex+1} · complete`:`${active.title} · Step ${activeIndex+1} · unit ${active.current+1} of ${active.screens.length} · ${active.current<active.screens.length-1?'more ahead':'last unit'}`);
</script>
{#if overview}
 <!-- The spine (cookbook overview-sheet.md § Proposed composition — clarity, nodded 2026-10-09 21:01 ET; mock 28):
      six stage rows, icon + name, item count at the end. Only the current stage shows its items by default; any other
      stage's items appear in place when its row is tapped. Each item is a ≥ 48 px circle with its kind word sr-only;
      the visible word is the one caption line. Tapping an item navigates; jumping never marks skipped items complete. -->
 <ol class="progress-overview ov-spine" aria-label="Session sections">
  {#each groups as group,i}{@const SectionIcon=sectionIcons[i]||sectionIcons[0]}{@const open=isOpen(i)}
   <li class="ov-stage" class:current={group.active} class:done={!group.active&&(i<activeIndex||group.ratio===1)} class:ahead={!group.active&&i>activeIndex&&group.ratio<1}>
    <button class="ov-stage-row" aria-expanded={open} aria-current={group.active?'step':undefined} aria-controls={`ov-items-${i}`} onclick={()=>toggle(i)}>
     <SectionIcon size={22} aria-hidden="true"/><span class="ov-stage-name">{group.title}</span>
     {#if !group.active&&(i<activeIndex||group.ratio===1)}<Check size={16} aria-hidden="true" class="ov-stage-check"/><span class="sr-only">done</span>{/if}
     <span class="ov-stage-count"><span class="sr-only">, items: </span>{group.screens.length}</span>
    </button>
    {#if open}
     <div class="ov-items" id={`ov-items-${i}`}>
      <div class="ov-circles" role="group" aria-label={`${group.title} items`}>
       {#each group.screens as screen,j}{@const Icon=icons[screen.kind]||guideIcon}{@const word=kindWords[screen.kind]||kindWords.guide}
        <button class="ov-item" class:complete={screen.complete} class:current={screen.current} class:stop={screen.kind==='discussion'&&!screen.complete&&!screen.current} aria-current={screen.current?'step':undefined} onclick={()=>onselect(screen.activityId,false)}>
         <span class="ov-dot" aria-hidden="true"><Icon size={15}/></span><span class="sr-only">{word}, {j+1} of {group.screens.length}{screen.complete?', done':''}{screen.label?`: ${screen.label}`:''}</span>
        </button>
       {/each}
      </div>
      <p class="ov-caption">{caption(group)}</p>
     </div>
    {/if}
   </li>
  {/each}
 </ol>
{:else}
 <!-- One bar, six stage icons (cookbook design/alpha-system/components/progress-rail.md § One bar, adopted 2026-10-08).
      The per-screen bead row is gone from the bar; within-stage position lives in the overview and in the spoken words. -->
 <!-- The words live outside the button so assistive tech hears them: a button's aria-label overrides its children. -->
 <span id="session-progress-words" class="sr-only session-progress-words" role="progressbar" aria-label="Session progress" aria-valuemin="1" aria-valuemax={groups.length} aria-valuenow={activeIndex+1} aria-valuetext={stageWords}>{stageWords}</span>
 <button class="session-progress" aria-label="Session progress: open section overview" aria-describedby="session-progress-words" onclick={onopen}>
  <!-- Top band (progress-rail § One bar, captain 2026-10-08 23:40–23:52 ET): no track; cells overlap 2 px and stack outward from the
       current cell; the current cell's 2 px ring is the within-stage progress arc (tick at the first screen, solid at the last). -->
  <span class="stage-bar" aria-hidden="true">
   {#each groups as group,i}{@const StageIcon=sectionIcons[i]||sectionIcons[0]}
    <span class="stage-cell" class:complete={i<activeIndex||group.ratio===1} class:current={group.active} style:z-index={groups.length-Math.abs(i-activeIndex)} style:--arc={group.active?`${Math.round(100*(group.current<0?1:(group.current+1)/Math.max(1,group.screens.length)))}%`:'0%'}><StageIcon size={20}/></span>
   {/each}
  </span>
  <span class="stage-words" aria-hidden="true"><b>{active.title}</b> · Step {activeIndex+1}</span>
 </button>
{/if}
<style>
 .ov-spine{list-style:none;margin:0;padding:0}
 .ov-stage-row{display:flex;align-items:center;justify-content:flex-start;gap:12px;width:100%;min-height:48px;padding:4px 10px;border-radius:12px;font-size:1rem;color:var(--ink-700);text-align:start}
 .ov-stage-name{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
 .ov-stage-count{margin-inline-start:auto;font-size:.8125rem;color:var(--ink-500)}
 .ov-stage.done .ov-stage-row,.ov-stage.ahead .ov-stage-row{color:var(--ink-500)}
 .ov-stage.current .ov-stage-row{font-weight:600;color:var(--ink-900);background:var(--paper-100)}
 .ov-items{padding:2px 0 6px;padding-inline-start:34px}
 .ov-circles{display:flex;flex-wrap:wrap}
 .ov-item{width:var(--fia-tap-min,48px);height:var(--fia-tap-min,48px);padding:0;border-radius:50%}
 .ov-dot{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;color:var(--ink-500);background:var(--paper-000);box-shadow:inset 0 0 0 1px var(--paper-300)}
 .ov-item.complete .ov-dot{background:var(--ink-700);color:var(--paper-000);box-shadow:none}
 .ov-item.current .ov-dot{color:var(--ink-900);box-shadow:0 0 0 2px var(--paper-050),0 0 0 4px var(--ink-900)}
 .ov-item.stop .ov-dot{box-shadow:inset 0 0 0 1.5px var(--ink-700);color:var(--ink-700)}
 .ov-caption{margin:2px 0 6px;padding-inline-start:4px;font-size:.8125rem;line-height:1.35;color:var(--ink-500)}
</style>
