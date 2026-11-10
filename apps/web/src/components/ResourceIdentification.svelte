<script>
 let {asset}=$props();
 const labels={scripture:'Scripture',term:'Key term',image:'Image',map:'Map',video:'Video'};
 // Show user-facing collection names in the existing caption format ("FIA Images · CC BY-SA 4.0"), never the
 // backend collection ids the generalized packs carry ("FIAImages · CC BY-SA 4.0 license"; design-lens HOLD R5, PR318).
 const collections={FIAImages:'FIA Images',FIAMaps:'FIA Maps'};
 let credit=$derived((asset.subtitle||asset.source||'').replace('Familiarization, Internalization, Articulation (FIA)','FIA').replace(/^(FIAImages|FIAMaps) · (.+?)(?: license)?$/,(_,id,licence)=>`${collections[id]} · ${licence}`));
</script>
<div class="reading-identification" role="group" aria-label={`${labels[asset.kind]||'Resource'} source`}>
 <h2>{asset.title}</h2>
 {#if credit}<span>{credit}</span>{/if}
</div>
