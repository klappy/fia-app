<script>
 import {getContext} from 'svelte';
 import {titleMarker} from '../lib/spanish-coverage.js';
 import {assetLang,INTERFACE_LANG} from '../lib/library.js';
 let {asset}=$props();
 const labels={scripture:'Scripture',term:'Key term',image:'Image',map:'Map',video:'Video'};
 // A Spanish pack records per resource and key term whether Spanish text is shown ('present') or the English fallback is
 // (compile.mjs, reportPack). Absence is never silent: the marker is plain text in the title position, no control, badge
 // or colour (captain, Nov 4 2026 3:08 PM ET: machine translation OFF shows '[ES needed]'). English packs carry no state.
 let marker=$derived(titleMarker(asset));
 // The group label is interface chrome; the title carries the language it is shown in; the credit keeps the passage language.
 const passageLang=getContext('fia-content-lang');
 // Show user-facing collection names in the existing caption format ("FIA Images · CC BY-SA 4.0"), never the
 // backend collection ids the generalized packs carry ("FIAImages · CC BY-SA 4.0 license"; design-lens HOLD R5, PR318).
 const collections={FIAImages:'FIA Images',FIAMaps:'FIA Maps'};
 let credit=$derived((asset.subtitle||asset.source||'').replace('Familiarization, Internalization, Articulation (FIA)','FIA').replace(/^(FIAImages|FIAMaps) · (.+?)(?: license)?$/,(_,id,licence)=>`${collections[id]} · ${licence}`));
</script>
<div class="reading-identification" role="group" lang={INTERFACE_LANG} aria-label={`${labels[asset.kind]||'Resource'} source`}>
 <h2 lang={assetLang(asset,passageLang?.())}>{asset.title}{#if marker}{asset.title?' ':''}{marker}{/if}</h2>
 {#if credit}<span lang={passageLang?.()}>{credit}</span>{/if}
</div>
