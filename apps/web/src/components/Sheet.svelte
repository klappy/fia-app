<script>
 import { onMount } from 'svelte';
 import { X } from 'lucide-svelte';
 let {title,label,onclose,children,glass=false,opaqueHeader=false,notice=null}=$props();let dialog=$state();
 // The heading names the dialog; an empty header (the FIA menu) names it with `label` instead.
 const uid=$props.id();const headingId=uid+'-title';
 // Focus returns to whatever opened the sheet: removing a modal dialog otherwise drops focus to <body>.
 // The sheet stays mounted while its content changes (menu → Downloads), so this is the opener of the whole stack.
 onMount(()=>{const opener=document.activeElement;dialog.showModal();const handler=e=>{if(e.key==='Escape'){e.preventDefault();onclose();}};dialog.addEventListener('keydown',handler);
  return()=>{dialog.removeEventListener('keydown',handler);const active=document.activeElement;const lost=!active||active===document.body||dialog.contains(active);if(dialog.open)dialog.close();if(lost&&opener instanceof HTMLElement&&opener!==document.body&&opener.isConnected)opener.focus();};});
</script>
<dialog bind:this={dialog} aria-label={label} aria-labelledby={label?undefined:headingId} class="sheet" class:glass-sheet={glass} class:opaque-sheet-header={opaqueHeader} onclick={e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onclose();}}} onclose={onclose}>
 <header class="sheet-header"><h2 id={headingId}>{title}</h2><button class="icon-button" aria-label="Close" onclick={onclose}><X size={21}/></button>{#if notice}{@render notice()}{/if}</header>
 <div class="sheet-body">{@render children()}</div>
</dialog>
