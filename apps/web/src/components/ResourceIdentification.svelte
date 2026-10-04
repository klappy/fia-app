<script>
 let {asset}=$props();
 const labels={scripture:'Scripture',term:'Key term',image:'Image',map:'Map',video:'Video'};
 let credit=$derived((asset.subtitle||asset.source||'').replace('Familiarization, Internalization, Articulation (FIA)','FIA'));
</script>
<div class="reading-identification" role="group" aria-label={`${labels[asset.kind]||'Resource'} source`}>
 <h2>{asset.title}</h2>
 {#if credit}<span>{credit}</span>{/if}
</div>
