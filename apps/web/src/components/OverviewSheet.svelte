<script>
 // The navigation home, opened by tapping the session bar. Composition: cookbook design/alpha-system/components/overview-sheet.md
 // § Proposed composition — clarity (nodded 2026-10-09 21:01 ET, defaults O1–O4 stand), mock design/alpha-v2-screens/28-overview-clarity.
 // One hierarchy, each level smaller than the one above: where am I (here-card) → intro slot (O2, absent without content)
 // → the six stages (SessionProgress's overview branch: the spine) → three quiet rows (What the icons mean · Language · Passages) → Close.
 // Language and Passages reuse LibraryPanel's views inline.
 import {Globe,Bookmark,ChevronRight,ChevronDown,CircleHelp,Play,MessageCircle,Check} from 'lucide-svelte';
 import {contentIcons,sectionIcons,guideIcon,kindWords} from '../lib/progress-icons.js';
 import SessionProgress from './SessionProgress.svelte';
 import LibraryPanel from './LibraryPanel.svelte';
 let {groups,selectedPack,language,completed=0,total=0,intro=null,onlanguage,onopenpack,onreset,onnavigate,onclose}=$props();
 // The key, behind one disclosure: Content (kinds in user words, overview-sheet § Copy rules) and the big button's four faces (#244).
 const contentWords=Object.entries(kindWords);
 const faces=[[Play,'Play'],[ChevronRight,'Continue'],[MessageCircle,'Discuss, then continue'],[Check,'Finish']];
 let picker=$state(null);
 const languageName=$derived(language==='eng'?'English':'Español');
 function toggle(view){picker=picker===view?null:view;}
 // Here-card: the current stage, the item within it, and what comes next.
 const activeIndex=$derived(Math.max(0,groups.findIndex(g=>g.active)));
 const here=$derived(groups[activeIndex]);
 const HereIcon=$derived(sectionIcons[activeIndex]||sectionIcons[0]);
 const nowScreen=$derived(here&&here.current>=0?here.screens[here.current]:null);
 const nextScreen=$derived(nowScreen?(here.screens[here.current+1]||groups[activeIndex+1]?.screens[0]||null):null);
 const NowIcon=$derived(nowScreen?contentIcons[nowScreen.kind]||guideIcon:null);
 const NextIcon=$derived(nextScreen?contentIcons[nextScreen.kind]||guideIcon:null);
 const word=screen=>kindWords[screen.kind]||kindWords.guide;
</script>
<div class="overview-sheet">
 {#if here}
  <section class="ov-here" aria-label="You are here">
   <p class="ov-overline">You are here · step {activeIndex+1} of {groups.length}</p>
   <p class="ov-stage-title"><HereIcon size={26} aria-hidden="true"/><span>{here.title}</span></p>
   <p class="ov-position">{nowScreen?`item ${here.current+1} of ${here.screens.length}`:'complete'}</p>
   {#if nowScreen}
    <p class="ov-next"><NowIcon size={18} aria-hidden="true"/><span>Now: <b>{word(nowScreen)}</b></span>{#if nextScreen}<span class="ov-then">· then <NextIcon size={16} aria-hidden="true"/> {word(nextScreen)}</span>{/if}</p>
   {/if}
  </section>
 {/if}
 {#if intro}<div class="ov-intro">{@render intro()}</div>{/if}
 <SessionProgress {groups} overview onselect={onnavigate}/>
 <div class="ov-quiet">
  <button class="ov-row ov-key-toggle" aria-expanded={picker==='key'} aria-controls="ov-key" onclick={()=>toggle('key')}><CircleHelp size={18} aria-hidden="true"/>What the icons mean<span class="chev">{#if picker==='key'}<ChevronDown size={18} aria-hidden="true"/>{:else}<ChevronRight size={18} aria-hidden="true"/>{/if}</span></button>
  {#if picker==='key'}
   <div class="ov-key" id="ov-key" role="group" aria-label="Key">
    <p class="kh">Content</p>
    {#each contentWords as [kind,label]}{@const Icon=contentIcons[kind]}<span><Icon size={18} aria-hidden="true"/>{label}</span>{/each}
    <p class="kh">The big button</p>
    {#each faces as [Icon,label]}<span><Icon size={18} aria-hidden="true"/>{label}</span>{/each}
   </div>
  {/if}
  <button class="ov-row" aria-expanded={picker==='languages'} onclick={()=>toggle('languages')}><Globe size={18} aria-hidden="true"/>Language<span class="val">{languageName}</span><span class="chev">{#if picker==='languages'}<ChevronDown size={18} aria-hidden="true"/>{:else}<ChevronRight size={18} aria-hidden="true"/>{/if}</span></button>
  {#if picker==='languages'}<div class="ov-picker"><LibraryPanel view="languages" {selectedPack} {language} {onlanguage} onview={view=>picker=view} {completed} {total} onselect={onopenpack} {onreset}/></div>{/if}
  <button class="ov-row" aria-expanded={picker==='passages'} onclick={()=>toggle('passages')}><Bookmark size={18} aria-hidden="true"/>Passages<span class="val">{selectedPack.title}</span><span class="chev">{#if picker==='passages'}<ChevronDown size={18} aria-hidden="true"/>{:else}<ChevronRight size={18} aria-hidden="true"/>{/if}</span></button>
  {#if picker==='passages'}<div class="ov-picker"><LibraryPanel view="passages" {selectedPack} {language} {onlanguage} onview={view=>picker=view} {completed} {total} onselect={onopenpack} {onreset}/></div>{/if}
 </div>
 <!-- Close is the sheet's one action: the primary button, in a padded footer band that stays in reach (overview-sheet.md § States large-print). -->
 <div class="ov-footer"><button class="primary full ov-close" onclick={onclose}>Close</button></div>
</div>
<style>
 /* Here-card: the largest thing on the sheet. --material-floating keeps it a step above the sheet in both themes (dark-theme note). */
 .ov-here{margin:4px 0 14px;padding:16px 18px;border-radius:18px;background:var(--material-floating);box-shadow:var(--shadow-rest);color:var(--ink-900)}
 .ov-here p{margin:0}
 .ov-overline{font-size:.6875rem;font-weight:600;line-height:1.3;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-500)}
 .ov-stage-title{display:flex;align-items:center;gap:12px;margin:6px 0 2px!important;font-size:1.5rem;font-weight:600;line-height:1.15;overflow-wrap:anywhere}
 .ov-position{font-size:.8125rem;color:var(--ink-500)}
 .ov-next{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-top:10px!important;padding-top:10px;border-top:1px solid var(--line);font-size:.9375rem;font-weight:500}
 .ov-next b{font-weight:600}
 .ov-then{display:inline-flex;align-items:center;gap:6px;color:var(--ink-500);font-weight:400}
 .ov-intro{margin:0 0 12px}
 .ov-quiet{margin-top:10px}
 .ov-row{display:flex;align-items:center;justify-content:flex-start;gap:10px;width:100%;min-height:48px;padding:4px 10px;font-size:.9375rem;color:var(--ink-700);border-top:1px solid var(--line);text-align:start}
 .ov-key-toggle{color:var(--ink-500)}
 .ov-row .val{margin-inline-start:auto;color:var(--ink-500);font-size:.875rem;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .ov-row .chev{display:inline-flex;color:var(--ink-500)}
 .ov-key-toggle .chev{margin-inline-start:auto}
 :global([dir=rtl]) .ov-row .chev{transform:scaleX(-1)}
 .ov-key{display:flex;flex-wrap:wrap;gap:2px 14px;padding:2px 10px 12px;padding-inline-start:38px}
 .ov-key .kh{width:100%;margin:8px 0 2px;font-size:.625rem;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-500)}
 .ov-key span{display:inline-flex;align-items:center;gap:6px;min-height:28px;font-size:.8125rem;color:var(--ink-700)}
 .ov-picker{padding:4px 0 12px}
 .ov-footer{--ov-pad:24px;position:sticky;bottom:0;z-index:1;margin:12px calc(-1 * var(--ov-pad)) calc(-1 * var(--ov-pad));padding:12px var(--ov-pad) calc(16px + env(safe-area-inset-bottom));background:var(--sheet-header-background,var(--paper-000))}
 @media(max-width:700px){.ov-footer{--ov-pad:22px}}
 .ov-close{margin-top:0;color:var(--text-on-inverse)}
</style>
