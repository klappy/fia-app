<script>
 // The navigation home, opened by tapping the session bar (cookbook design/alpha-system/components/overview-sheet.md,
 // adopted 2026-10-08 as mocked in design/alpha-v2-screens/25-one-bar-overview.mock.html).
 // Fixed order: icon key → intro slot (absent without content) → Language → Passages → mini-map → Close.
 // Language and Passages reuse LibraryPanel's views inline; the mini-map is SessionProgress's overview branch.
 import {Globe,Bookmark,ChevronRight,ChevronDown} from 'lucide-svelte';
 import {contentIcons,sectionIcons,kindWords} from '../lib/progress-icons.js';
 import SessionProgress from './SessionProgress.svelte';
 import LibraryPanel from './LibraryPanel.svelte';
 let {groups,selectedPack,language,completed=0,total=0,intro=null,onlanguage,onopenpack,onreset,onnavigate,onclose}=$props();
 // Content kinds in user words (overview-sheet § Copy rules), in the key's reading order.
 const contentWords=Object.entries(kindWords);
 let picker=$state(null);
 const languageName=$derived(language==='eng'?'English':'Español');
 function toggle(view){picker=picker===view?null:view;}
</script>
<div class="overview-sheet">
 <div class="ov-key" role="group" aria-label="Key">
  <span class="kh">Key · the six stages</span>
  {#each groups as group,i}{@const StageIcon=sectionIcons[i]||sectionIcons[0]}<span><StageIcon size={18} aria-hidden="true"/>{group.title}</span>{/each}
  <span class="kh">What you’ll meet</span>
  {#each contentWords as [kind,word]}{@const Icon=contentIcons[kind]}<span><Icon size={18} aria-hidden="true"/>{word}</span>{/each}
 </div>
 {#if intro}<div class="ov-intro">{@render intro()}</div>{/if}
 <button class="ov-row" aria-expanded={picker==='languages'} onclick={()=>toggle('languages')}><Globe size={19}/>Language<span class="val">{languageName}</span>{#if picker==='languages'}<ChevronDown size={18}/>{:else}<ChevronRight size={18}/>{/if}</button>
 {#if picker==='languages'}<div class="ov-picker"><LibraryPanel view="languages" {selectedPack} {language} {onlanguage} onview={view=>picker=view} {completed} {total} onselect={onopenpack} {onreset}/></div>{/if}
 <button class="ov-row" aria-expanded={picker==='passages'} onclick={()=>toggle('passages')}><Bookmark size={19}/>Passages<span class="val">{selectedPack.title}</span>{#if picker==='passages'}<ChevronDown size={18}/>{:else}<ChevronRight size={18}/>{/if}</button>
 {#if picker==='passages'}<div class="ov-picker"><LibraryPanel view="passages" {selectedPack} {language} {onlanguage} onview={view=>picker=view} {completed} {total} onselect={onopenpack} {onreset}/></div>{/if}
 <SessionProgress {groups} overview onselect={onnavigate}/>
 <!-- Close is the sheet's one action: the primary button, in a padded footer band that stays in reach (overview-sheet.md § Blocks, § States large-print). -->
 <div class="ov-footer"><button class="primary full ov-close" onclick={onclose}>Close</button></div>
</div>
<style>
 .ov-key{display:flex;flex-wrap:wrap;gap:4px 14px;padding:0 0 12px;border-bottom:1px solid var(--line);margin-bottom:6px}
 .ov-key .kh{width:100%;font:var(--type-label);color:var(--ink-500);text-transform:uppercase;letter-spacing:.06em;font-size:.625rem;margin:6px 0 2px}
 .ov-key span{display:inline-flex;align-items:center;gap:6px;min-height:28px;font-size:.8125rem;color:var(--ink-700)}
 .ov-row{display:flex;align-items:center;gap:12px;width:100%;min-height:52px;padding:8px 6px;font-size:1rem;justify-content:flex-start;border-radius:11px;text-align:left}
 .ov-row .val{margin-left:auto;color:var(--ink-500);font-size:.875rem}
 .ov-picker{padding:4px 0 12px}
 .ov-footer{--ov-pad:24px;position:sticky;bottom:0;z-index:1;margin:12px calc(-1 * var(--ov-pad)) calc(-1 * var(--ov-pad));padding:12px var(--ov-pad) calc(16px + env(safe-area-inset-bottom));background:var(--sheet-header-background,var(--paper-000))}
 @media(max-width:700px){.ov-footer{--ov-pad:22px}}
 .ov-close{margin-top:0;color:var(--text-on-inverse)}
</style>
