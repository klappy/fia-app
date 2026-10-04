<script>
 import {sectionIcons as icons} from '../lib/progress-icons.js';
 let {section,index}=$props();
 let Icon=$derived(icons[index]||icons[0]);
</script>
<section class="section-transition" aria-label="New section" aria-live="polite">
 <Icon size={38} strokeWidth={1.5}/>
 <h1>{section.title}</h1>
 <div class="transition-sections" aria-label={`Section ${index+1} of 6`}>{#each icons as _,i}<span aria-hidden="true" class:past={i<index} class:current={i===index}></span>{/each}</div>
</section>
