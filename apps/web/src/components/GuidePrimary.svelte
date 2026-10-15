<script>
 import {Play,Pause,ChevronRight,Loader} from 'lucide-svelte';
 // face: 'verifying' (no icon, no label, soft breathe), 'starting' (loading row), or 'action'.
 let {label,face='action',playing=false,continuing=false,playback=null,onclick,onpointerdown}= $props();
 // Cookbook CountdownRing geometry: 96px outer ring, 3px stroke, 72px disc.
 const radius=45.5, circumference=2*Math.PI*radius;
 let progressElapsed=$derived(playback?.progressElapsed??playback?.elapsed);
 let progressDuration=$derived(playback?.progressDuration??playback?.duration);
 let progress=$derived(face!=='verifying'&&progressDuration>0?Math.max(0,Math.min(1,progressElapsed/progressDuration)):0);
</script>
<button class="guide-primary" class:verifying={face==='verifying'} class:starting={face==='starting'} aria-label={label} aria-busy={face==='action'?undefined:'true'} aria-disabled={face==='starting'?'true':undefined} {onclick} {onpointerdown}>
 <span class="primary-orbit">
  <svg class="playback-ring" viewBox="0 0 96 96" aria-hidden="true">
   <circle cx="48" cy="48" r={radius} class="playback-track"/>
   <circle cx="48" cy="48" r={radius} class="playback-arc" class:advancing={playing} stroke-dasharray={circumference} stroke-dashoffset={circumference*(1-progress)} opacity={progress>0?1:0}/>
  </svg>
  <span class="primary-disc">{#if face==='verifying'}{:else if face==='starting'}<Loader size={30} strokeWidth={2.4}/>{:else if playing}<Pause size={30} strokeWidth={2.4}/>{:else if continuing}<ChevronRight size={30} strokeWidth={2.4}/>{:else}<Play size={30} strokeWidth={2.4}/>{/if}</span>
 </span>
</button>
