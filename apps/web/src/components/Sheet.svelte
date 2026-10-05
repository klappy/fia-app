<script>
 import { onMount } from 'svelte';
 import { X } from 'lucide-svelte';
 let {title,onclose,children,glass=false,opaqueHeader=false}=$props();let dialog=$state();
 onMount(()=>{dialog.showModal();const handler=e=>{if(e.key==='Escape'){e.preventDefault();onclose();}};dialog.addEventListener('keydown',handler);return()=>dialog.removeEventListener('keydown',handler);});
</script>
<dialog bind:this={dialog} class="sheet" class:glass-sheet={glass} class:opaque-sheet-header={opaqueHeader} onclick={e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onclose();}}} onclose={onclose}>
 <header class="sheet-header"><h2>{title}</h2><button class="icon-button" aria-label="Close" onclick={onclose}><X size={21}/></button></header>
 <div class="sheet-body">{@render children()}</div>
</dialog>
