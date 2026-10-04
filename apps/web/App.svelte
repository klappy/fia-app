<script>
  import {onMount} from 'svelte';
  import FiaMark from '../../packages/views/FiaMark.svelte';
  import {eligible,restore,transition,pageIndices,readPosition,savePosition} from '../../packages/views/session.js';
  import {validateBundle} from '../../packages/views/bundle-integrity.js';
  let bundle=$state(null), state=$state(null), loadError=$state(''), panel=$state(false), storageNotice=$state('');
  let audio=null;
  let current=$derived(bundle && state ? bundle.activities[state.index] : null);
  let page=$derived(bundle && state ? pageIndices(bundle,state.index).map(i=>bundle.activities[i]) : []);
  let related=$derived(current ? [...new Set(page.flatMap(a=>[...(a.relatedAssetIds||[]),...(a.assetId?[a.assetId]:[])]))] : []);
  const storage={getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)};
  function persist() {storageNotice=savePosition(bundle,state,storage);}
  function browse(view) {act({type:'open-view',view});}
  function returnToPassage() {act({type:'close-view'});}
  function openDialog(node) {node.showModal(); return {destroy(){node.close();}};}
  function stop() {if(audio){audio.pause();audio.removeAttribute('src');audio.load();audio=null;}}
  function act(action) {
    const before=state; state=transition(bundle,state,action); persist();
    if(state.token!==before.token){stop();if(state.playing)start();}
  }
  function start() {
    const token=state.token, item=bundle.activities[state.index];
    if(!eligible(item))return;
    const owned=new Audio(item.audio.src); audio=owned;
    owned.onended=()=>act({type:'ended',token});
    owned.onerror=()=>act({type:'failed',token});
    owned.play().catch(()=>act({type:'failed',token}));
  }
  onMount(()=>{
    let cancelled=false;
    fetch('./content/bundle.json').then(r=>{if(!r.ok)throw Error('Unavailable');return r.json();}).then(validateBundle).then(data=>{
      if(cancelled)return; bundle=data;
      const stored=readPosition(bundle,storage); storageNotice=stored.notice;
      state=restore(bundle,stored.saved);
    }).catch(()=>loadError='The bundled passage could not load. Please reload to try again.');
    return()=>{cancelled=true;stop();};
  });
</script>

<svelte:head><title>FIA · Mark 1:1–13</title></svelte:head>
<div class="aurora" aria-hidden="true"></div>
{#if current}
  <div class="shell">
    <header>
      <span class="identity">FIA <span>·</span> {bundle.title}</span><span class="language">English</span>
      <p class="preview">Bundled preview · Full passage text</p>
      <div class="track" aria-hidden="true"><span style:width={`${(state.index+1)/bundle.activities.length*100}%`}></span></div>
      <nav class="steps" aria-label="Passage sections">
        {#each bundle.sections as section,i}
          <button class:active={section.id===current.sectionId} aria-current={section.id===current.sectionId?'step':undefined} aria-label={`${i+1}. ${section.title}`} onclick={()=>act({type:'jump',index:bundle.activities.findIndex(a=>a.sectionId===section.id)})}>{['♡','◉','▤','◇','✧','◎'][i]}</button>
        {/each}
      </nav>
    </header>
    <main id="passage" tabindex="-1">
      <p class="eyebrow">{current.kind==='discussion'?'Discuss together':current.label}</p>
      <h1>{current.title}</h1>
      <div class:scripture={current.kind==='scripture'} class="reading">
        {#each page as part}{#each part.text.split('\n') as paragraph}<p>{paragraph}</p>{/each}{/each}
      </div>
      <p class="attribution">{current.attribution}</p>
      {#if current.completion==='confirm'}<p class="hold">Take your time. Continue when your group is ready.</p>{/if}
      <p class="availability">{current.audio.reason || (current.audio.suppliedEvidence?.recordingSource==='generated'?'Prepared generated narration':'Prepared narration')}</p>
      {#if state.reachedEnd}<p class="hold">You have reached the end of the bundled text sequence. Take the time your group needs for this final activity.</p>{/if}
      <div class="supplementary">
        <button onclick={()=>browse({type:'source'})}>Source details</button>
        {#each related as id}<button onclick={()=>browse({type:'resource',id})}>{bundle.resources[id]?.title || 'Resource unavailable'}</button>{/each}
        {#if current.sectionId==='S04'}<button onclick={()=>browse({type:'examples'})}>Optional drama example</button>{/if}
      </div>
    </main>
    <div class="notice" role="status" aria-live="polite">{state.notice || storageNotice}</div>
    <footer>
      <div class="transport">
        <button aria-label="Back" disabled={state.index===0} onclick={()=>act({type:'back'})}>‹</button>
        <button class="easy" aria-label={current.kind==='discussion'?'Continue discussion':'Continue'} disabled={state.reachedEnd} onclick={()=>act({type:'next'})}>›</button>
        <button aria-label={state.playing?'Pause':'Play'} title={eligible(current)?'Play':'Audio unavailable'} onclick={()=>act({type:state.playing?'pause':'play'})}>{state.playing?'Ⅱ':'▷'}</button>
      </div>
      <div class="bottom"><button class="brand" aria-label="Open library and settings" onclick={()=>{act({type:'pause'});panel=true;}}><FiaMark/></button><span>{state.index+1} / {bundle.activities.length}</span><button aria-label="Replay" onclick={()=>act({type:'play'})}>↻</button></div>
    </footer>
  </div>
  {#if state.view}
    <dialog class="panel details" use:openDialog aria-label="Passage details" oncancel={returnToPassage}>
      <button class="close" aria-label="Return to passage" onclick={returnToPassage}>×</button>
      {#if state.view.type==='resource'}
        {@const resource=bundle.resources[state.view.id]}
        {#if resource}
          <h2>{resource.title}</h2><p class="muted">{resource.source}</p>
          {#if ['image','map','video'].includes(resource.kind)}<p class="hold">This {resource.kind} is unavailable. The supplied description below is not the media itself.</p>{/if}
          {#each (resource.text || resource.description || '').split('\n') as text}<p>{text}</p>{/each}
          {#if resource.verses}{#each resource.verses as verse}<p>{verse.number}. {verse.text}</p>{/each}{/if}
          {#if !resource.text && !resource.description && !resource.verses}<p>Resource text is unavailable.</p>{/if}
          <details><summary>Source and rights</summary><pre>{JSON.stringify(resource.sourceEvidence || {source:resource.source},null,2)}</pre></details>
        {:else}<h2>Resource unavailable</h2><p>The required resource association is missing.</p>{/if}
      {:else if state.view.type==='examples'}
        <h2>Optional drama example</h2>
        {#each bundle.sourceUnits.filter(u=>u.disposition==='optional-example') as unit}<p>{unit.text}</p>{/each}
      {:else}
        <h2>Source details</h2><p class="muted">{current.attribution}</p>
        {#each bundle.sourceUnits.filter(u=>page.some(a=>u.activityIds.includes(a.id) || u.associatedActivityId===a.id)) as unit}
          <h3>{unit.id}{unit.disposition==='production-request'?' · Source production request (not fulfilled)':''}</h3><p>{unit.text}</p>
          <details><summary>Source identity</summary><pre>{JSON.stringify({sourceSha256:unit.sourceSha256,textSha256:unit.textSha256,disposition:unit.disposition},null,2)}</pre></details>
        {/each}
        {#each page.filter(a=>a.scriptureSource) as part}<details><summary>{part.label} · Edition and rights</summary><pre>{JSON.stringify(part.scriptureSource,null,2)}</pre></details>{/each}
        <details><summary>Guide provenance and rights</summary><pre>{JSON.stringify(bundle.source.upstream,null,2)}</pre></details>
      {/if}
      <button onclick={returnToPassage}>Return to unchanged passage</button>
    </dialog>
  {/if}
  {#if panel}
    <dialog class="panel" use:openDialog aria-label="Library and settings" oncancel={()=>panel=false}>
      <button class="close" aria-label="Close library and settings" onclick={()=>panel=false}>×</button>
      <p><a href="/build-status">Build status</a></p>
      <h2>Your passage</h2><p>Mark 1:1–13 · English</p><p class="muted">Full supplied passage text. Other passages and downloads are unavailable; no online library is connected.</p>
      <div class="languages"><button onclick={()=>act({type:'language',language:'en'})}>English · Active</button><button onclick={()=>act({type:'language',language:'es'})}>Español · Unavailable</button></div>
      <p role="status">{state.notice}</p><h2>Listening</h2>
      <label><input type="checkbox" checked={state.automatic} onchange={e=>act({type:'automatic',value:e.currentTarget.checked})}/> Play available narration on Continue</label>
      <p class="muted">Explicit Play works independently of this setting. Restoring your position is always silent. Audio is currently unavailable pending applicability review.</p>
      <p class="muted">Position and settings stay in this browser.</p>
      <details><summary>Supplied resource texts</summary><div class="languages">{#each Object.values(bundle.resources) as resource}<button onclick={()=>{panel=false;browse({type:'resource',id:resource.id});}}>{resource.title}</button>{/each}</div></details>
      <button onclick={()=>panel=false}>Return to passage</button>
    </dialog>
  {/if}
{:else}<main class="loading" role="status">{loadError||'Opening the bundled passage…'}</main>{/if}
