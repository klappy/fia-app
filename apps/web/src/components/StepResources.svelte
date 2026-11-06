<script>
 let {items=[],verifying=false,onopen=()=>{},onheight=()=>{}}=$props();
 function measure(node){const report=()=>{const height=node.getBoundingClientRect().height;if(height>0)onheight(height);};report();const observer=typeof ResizeObserver==='function'?new ResizeObserver(report):null;observer?.observe(node);return {destroy(){observer?.disconnect();}};}
 const names={scripture:'Scripture',term:'Word meaning',image:'Image',map:'Map',video:'Video'};
</script>
{#if items.length}
 <nav use:measure class="step-resources" aria-label="Resources for this step">
  {#each items as item (item.id)}
   <button data-resource-id={item.id} onclick={()=>onopen(item.id)} aria-label={`${names[item.kind]}: ${item.title}`}>
    <span>{names[item.kind]}</span><strong>{item.title}</strong>
    {#if item.availability==='checking'||(verifying&&item.availability==='unavailable')}<small>Checking…</small>{:else if item.availability==='unavailable'}<small>Unavailable</small>{:else if item.availability==='online'}<small>Online</small>{/if}
   </button>
  {/each}
 </nav>
{/if}
<style>
 .step-resources{position:fixed;z-index:11;left:50%;transform:translateX(-50%);bottom:calc(max(24px,env(safe-area-inset-bottom)) + 66px);width:min(780px,calc(100vw - 32px));display:flex;gap:8px;overflow-x:auto;padding:6px;scrollbar-width:thin;background:var(--material-floating);border-radius:14px;backdrop-filter:blur(12px)}
 button{flex:none;display:flex;flex-direction:column;align-items:flex-start;gap:1px;max-width:230px;min-height:44px;padding:5px 10px;border-radius:9px;text-align:left}
 button:focus-visible{outline-offset:-2px}span,small{font-size:11px;line-height:1.3}strong{font-size:13px;font-weight:500;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style>
