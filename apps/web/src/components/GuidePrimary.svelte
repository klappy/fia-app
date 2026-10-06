<script>
 import {Play,Pause,ChevronRight,X} from 'lucide-svelte';
 let {label,playing=false,continuing=false,canceling=false,playback=null,onclick}= $props();
 // Cookbook CountdownRing geometry: 96px outer ring, 3px stroke, 72px disc.
 const radius=45.5, circumference=2*Math.PI*radius;
 let progressElapsed=$derived(playback?.progressElapsed??playback?.elapsed);
 let progressDuration=$derived(playback?.progressDuration??playback?.duration);
 let progress=$derived(progressDuration>0?Math.max(0,Math.min(1,progressElapsed/progressDuration)):0);
</script>
<button class="guide-primary" aria-label={label} {onclick}>
 <span class="primary-orbit">
  <svg class="playback-ring" viewBox="0 0 96 96" aria-hidden="true">
   <circle cx="48" cy="48" r={radius} class="playback-track"/>
   <circle cx="48" cy="48" r={radius} class="playback-arc" class:advancing={playing} stroke-dasharray={circumference} stroke-dashoffset={circumference*(1-progress)} opacity={progress>0?1:0}/>
  </svg>
  <span class="primary-disc">{#if canceling}<X size={30} strokeWidth={2.4}/>{:else if playing}<Pause size={30} strokeWidth={2.4}/>{:else if continuing}<ChevronRight size={30} strokeWidth={2.4}/>{:else}<Play size={30} strokeWidth={2.4}/>{/if}</span>
 </span>
</button>
