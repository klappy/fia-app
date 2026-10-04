<script>
 import { onMount, tick } from 'svelte';
 import { MoreHorizontal, Speech, Play, Pause, ChevronRight, ChevronLeft, Send, Settings2, List, BookOpen, Image, Map, Film, Users, RotateCcw, ArrowLeft, PinOff, Info, Download, MessageCircle, X, CircleHelp, ExternalLink } from 'lucide-svelte';
 import {bundledPresentation,presentationContent} from './lib/content.js';
 import { createSession, reduceSession, currentActivity, presentStage } from './lib/engine.js';
 import { parseCommand } from './lib/commands.js';
 import { createAudioController } from './lib/audio.js';
 import MediaStage from './components/MediaStage.svelte';
 import AlignedReading from './components/AlignedReading.svelte';
 import Sheet from './components/Sheet.svelte';
 import SessionProgress from './components/SessionProgress.svelte';
 import SectionTransition from './components/SectionTransition.svelte';
 import {progressSections,progressState} from './lib/progress.js';
 import GuidePrimary from './components/GuidePrimary.svelte';
 import FiaMark from './components/FiaMark.svelte';
 import LibraryPanel from './components/LibraryPanel.svelte';
 import {bundledPack,libraryAdapter} from './lib/library.js';
 import {saveProgress,restoreProgress,resetProgress} from './lib/session-store.js';
 let selectedPack=$state(bundledPack),rawPresentation=$state.raw(bundledPresentation),downloadedPaths=$state(new Set());
 let content=$derived(presentationContent(mediaForDevice(rawPresentation,downloadedPaths),selectedPack));
 let activities=$derived(content.activities),assets=$derived(content.assets),sections=$derived(content.sections),examples=$derived(content.examples),readingGroups=$derived(content.readingGroups),contentContract=$derived(content.contentContract),defaultScriptureId=$derived(content.defaultScriptureId);
 let selectionGeneration=0;
 function mediaForDevice(pack,paths){return {...pack,activities:pack.activities.map(a=>({...a,audioSrc:paths.has(a.audioSrc)?a.audioSrc:null})),assets:Object.fromEntries(Object.entries(pack.assets).map(([id,a])=>[id,{...a,src:paths.has(a.src)?a.src:undefined,poster:paths.has(a.poster)?a.poster:undefined,descriptionAudio:paths.has(a.descriptionAudio)?a.descriptionAudio:undefined,downloadRequired:['image','map','video'].includes(a.kind)&&!paths.has(a.src)}]))};}
 async function updateDownloaded(){
  const generation=selectionGeneration,pack=selectedPack;
  try{
   const status=await libraryAdapter.downloadStatus(pack);if(generation!==selectionGeneration)return;
   const verified=!!status.saved&&status.active.manifest?.presentationRevision===pack.revision;
   if(verified){await libraryAdapter.activate(pack);if(generation!==selectionGeneration)return;}
   saved=verified;downloadedPaths=new Set(verified?status.active.files.map(f=>f.path):[]);
  }catch{if(generation===selectionGeneration){saved=false;downloadedPaths=new Set();}}
 }

 function applyStored(){const stored=restoreProgress(localStorage,selectedPack,activities,assets);if(stored?.resetRequired)notice='This passage changed. Your previous place could not be matched; starting at the beginning.';session=stored?.session||createSession(activities);if(stored){scale=[1,1.25,1.5].includes(stored.scale)?stored.scale:1;rate=[.85,1,1.15].includes(stored.rate)?stored.rate:1;muted=!!stored.muted;dark=!!stored.dark;termDefinition=stored.termDefinition===activities[session.index]?.id?stored.termDefinition:null;transitionSection=stored.transitionSection===activities[session.index]?.sectionId?stored.transitionSection:null;}started=session.index>0||session.status!=='ready';}
 async function selectPack(id){const generation=++selectionGeneration;const loaded=await libraryAdapter.select(id);if(generation!==selectionGeneration)return;persist();cancel();selectedPack=loaded.descriptor;rawPresentation=loaded.presentation;downloadedPaths=new Set();introduced=new Set();manualStarts=new Set();visualHeard=null;termDefinition=null;transitionSection=null;messages=[];language=selectedPack.language;session=createSession(loaded.presentation.activities);try{applyStored();localStorage.setItem('fia-v3-selected-pack',id);}catch{notice='Your saved place could not be read.';}sheet=null;await libraryAdapter.activate(selectedPack).catch(()=>{});if(generation!==selectionGeneration)return;await updateDownloaded();}
 function restartPack(id){resetProgress(localStorage,{id});if(id===selectedPack.id)reset();}
 let language=$state('eng');
 function selectLanguage(id){language=id;try{localStorage.setItem('fia-v3-library-language',id);}catch{notice='Language choice could not be saved on this device.';}}
 let automaticOff=$derived(activity?.kind==='scripture'?!session.preferences.readScripture:muted);
 let progressGroups=$derived(progressSections(sections,activities,assets));
 let dark=$state(false),transitionSection=$state(null),termDefinition=$state(null);
 let progress=$derived(progressState(progressGroups,session,activities));
 let inTransition=$derived(transitionSection===activity?.sectionId&&!session.detour&&session.status!=='complete');
 $effect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';});
 let session=$state(createSession(bundledPresentation.activities));
 let audioState=$state({playing:false,elapsed:0,duration:0}); let videoPlaying=$state(false); let videoState=$state({elapsed:0,duration:0}); let serviceWorkerError=''; let isPlaying=$derived(audioState.playing||videoPlaying);
 let sheet=$state(null), command=$state(''), messages=$state([]), notice=$state(''), online=$state(true), started=$state(false), scale=$state(1), rate=$state(1), muted=$state(false), saved=$state(false);
 let audio, timer; let audioContext=$state(null); let chatInput=$state(), chatLog=$state();
 let activity=$derived(currentActivity(session,activities));
 let stage=$derived(presentStage(session,activities));
 let focal=$derived(assets[stage.focal]);
 let termPrompt=$derived(!session.detour&&focal?.kind==='term'&&!!activity?.audioSrc&&termDefinition!==activity.id);
 let guideText=$derived({...readingGroups[activity?.readingGroupId],id:activity?.readingGroupId||activity?.id,kind:'guide',text:readingGroups[activity?.readingGroupId]?.text||activity?.narration||activity?.prompt||'',activeItemId:activity?.id,descriptionAudio:activity?.audioSrc});
 let finished=$derived(session.status==='complete'&&!session.detour);
 
 const iconFor={guide:Speech,scripture:BookOpen,discussion:Users,video:Film};
 
 let phoneLandscape=$state(false),landscapeDismissed=$state(false);
 let immersive=$derived(phoneLandscape&&!landscapeDismissed&&!sheet&&!inTransition&&!finished&&['image','map','video'].includes(focal?.kind));
 let inlineVideo=$state(null);
 let matchingVideo=$derived((focal?.relatedIds||[]).map(id=>assets[id]).find(a=>a?.kind==='video'&&a.src));
 let visualHeard=$state(null);
 let visual=$derived(['image','map'].includes(focal?.kind));
 let videoPending=$derived(visual&&!!matchingVideo&&visualHeard!==focal.id);
 let visualPending=$derived(visual&&!matchingVideo&&session.preferences.describeImages&&!muted&&!!focal.descriptionAudio&&visualHeard!==focal.id);
 let primaryLabel=$derived(finished?'Begin again':inTransition?'Continue':automaticOff&&!session.detour?'Continue':isPlaying?'Pause':inlineVideo?'Resume':audio?.active&&audioContext?'Resume':videoPending&&(!activity.audioSrc||session.status==='waiting'||session.detour)?'Play video':visualPending&&(!activity.audioSrc||session.status==='waiting'||session.detour)?'Play':session.detour?(visual?'Return':focal?.kind==='video'?'Play video':focal?.descriptionAudio?'Listen':'Return'):session.status==='waiting'||automaticOff||!activity?.audioSrc?'Continue':session.status==='paused'?'Resume':!started?'Begin':'Play');
 let manualStarts=new Set();let listeningHint=$state(false),hintShown=false;
 let manualAvailable=$derived(!!(matchingVideo||focal?.kind==='video'&&focal.src||focal?.descriptionAudio||activity?.audioSrc));
 let manualLabel=$derived(isPlaying?'Pause':inlineVideo||audioContext&&audio?.active?'Resume':'Play');
 function manualPlay(restart=false){
  if(!restart&&isPlaying){audio?.pause();document.querySelectorAll('video').forEach(v=>v.pause());dispatch({type:'PAUSE'});return;}
  if(!restart&&inlineVideo){playVideo();return;}
  if(!restart&&audioContext&&audio?.active){audio.resume();return;}
  manualStarts.add(activity.id);
  if(manualStarts.size>=3&&!hintShown){listeningHint=true;hintShown=true;}
  if(visual&&matchingVideo){openMatchingVideo();return;}
  if(focal?.kind==='video'){cancel();const v=document.querySelector('.media-stage video');if(v)v.currentTime=0;playVideo();return;}
  const src=focal?.descriptionAudio||activity.audioSrc;
  if(!src)return;
  cancel();started=true;
  if(focal?.kind==='term')termDefinition=activity.id;
  audioContext={type:'manual',id:activity.id};audio.play(focal?.description||activity.narration,src,rate);persist();
 }
 let introduced=$state(new Set());
 let mediaTools=$state(false); let noticeTimer;
 function persist(){try{saveProgress(localStorage,selectedPack,activities,{session,scale,rate,muted,dark,transitionSection,termDefinition});}catch{notice='Your browser could not save your place. This session still works.';}}
 function dispatch(event){
  const priorActivity=activities[session.index]?.id;
  const priorSection=activities[session.index]?.sectionId;
  const queued=session.queued;const descriptionsBefore=session.preferences.describeImages;
  session=reduceSession(session,event,activities);
  const nextSection=activities[session.index]?.sectionId;
  if(activities[session.index]?.id!==priorActivity||event.type==='RESET')termDefinition=null;
  if(nextSection!==priorSection&&event.type!=='RESET')transitionSection=nextSection;
  if(event.type==='RESET'||event.type==='SEEK_ACTIVITY'&&nextSection===priorSection)transitionSection=null;
  persist();
  if(event.type==='SET_PREFERENCE'&&event.key==='describeImages'&&descriptionsBefore!==session.preferences.describeImages&&['image','map'].includes(focal?.kind)){
   if(!session.preferences.describeImages&&audioContext?.type==='description'&&audioContext.id===focal.id)cancel();
   else if(session.preferences.describeImages&&!isPlaying&&(session.detour||session.status==='waiting'||!activity.audioSrc))describe(focal.id);
  }
  if(queued&&!session.queued&&session.detour===queued){timer=setTimeout(()=>{if(session.detour===queued&&!muted)describe(queued);},350);}
 }
 function resolveAsset(id){if(assets[id])return id;return (activity.relatedAssetIds||[]).find(key=>assets[key]?.kind===id)||(focal?.kind===id?focal.id:null)||(id==='scripture'?defaultScriptureId:Object.values(assets).find(a=>a.kind===id)?.id)||id;}
 function settleSilent(){if(!inTransition&&!session.detour&&!finished&&!activity.audioSrc){session={...session,status:'waiting'};persist();}}
 function cancel(){videoState={elapsed:0,duration:0};inlineVideo=null;videoPlaying=false;clearTimeout(timer);timer=null;audio?.stop();document.querySelectorAll('video').forEach(v=>v.pause());audioContext=null;}
 function message(text){messages=[...messages.slice(-11),{role:'assistant',text}];tick().then(()=>chatLog?.scrollTo({top:chatLog.scrollHeight,behavior:'smooth'}));}
 function finishAudio(){
  const context=audioContext;audioContext=null;if(!context)return;
  if(context.type==='description'){if(['image','map'].includes(assets[context.id]?.kind)){visualHeard=context.id;if(!session.detour)session={...session,status:'waiting'};}return;}
  if(context.type==='manual'){session={...session,status:'waiting'};persist();return;}
  if(context.type==='response')return;
  introduced=new Set([...introduced,context.id]);
  const before=session.index;dispatch({type:'NARRATION_END',activityId:context.id});
  if(session.index!==before){scheduleNext();}
  else if(!session.detour&&visual&&(session.preferences.describeImages&&focal?.descriptionAudio||session.preferences.autoplayVideo&&matchingVideo)){describe(focal.id);}
  else if(!session.detour&&activity?.kind==='video'&&session.preferences.autoplayVideo){timer=setTimeout(()=>{if(session.preferences.autoplayVideo)playVideo();},350);}
 }
 function scheduleNext(){
  if(session.status==='complete'||session.detour||inTransition)return;
  if(!activity.audioSrc){settleSilent();if(visual&&(session.preferences.autoplayVideo&&matchingVideo||session.preferences.describeImages&&focal?.descriptionAudio)||focal?.kind==='term'&&!muted&&focal.descriptionAudio)describe(focal.id);return;}
  if(automaticOff&&visual&&(session.preferences.autoplayVideo&&matchingVideo||session.preferences.describeImages&&focal?.descriptionAudio)){describe(focal.id);return;}
  const id=activity.id,generation=selectionGeneration;
  if(activity.kind==='scripture'&&!session.preferences.readScripture){notice='The passage is ready for you to read. Continue when you’re ready.';return;}
  if(!automaticOff)timer=setTimeout(()=>{if(generation===selectionGeneration&&activity.id===id&&!session.detour)playActivity(false,true);},650);
 }
 function playActivity(forceReading=false,automatic=false){
  if(inTransition){transitionSection=null;persist();}
  if(session.detour){describe(stage.focal);return;}
  if(finished){reset();return;}
  started=true;notice='';
  // A viewing-pause cue is only appropriate when there is nothing to play.
  if(visual&&!muted&&/I will pause the audio here/i.test(activity.narration||'')&&((matchingVideo&&(!automatic||session.preferences.autoplayVideo))||(session.preferences.describeImages&&focal.descriptionAudio))){
   cancel();introduced=new Set([...introduced,activity.id]);
   session={...session,status:'waiting'};persist();describe(focal.id,!automatic);return;
  }
  if(focal?.kind==='term')termDefinition=null;
  if(activity.kind==='scripture'&&!session.preferences.readScripture&&!forceReading){dispatch({type:'CONTINUE'});scheduleNext();return;}
  if(!activity.audioSrc){settleSilent();return;}
  if(automaticOff&&activity.readingGroupId){navigate({type:'CONTINUE'});return;}
  if(automaticOff&&!forceReading){dispatch({type:'PLAY'});introduced=new Set([...introduced,activity.id]);dispatch({type:'NARRATION_END',activityId:activity.id});return;}
  cancel();dispatch({type:'PLAY'});
  audioContext={type:'narration',id:activity.id};audio.play(activity.narration,activity.audioSrc,rate);
 }

 function primary(){
  if(!activity.audioSrc&&!session.detour&&!inTransition&&!finished&&!videoPending&&!visualPending){navigate({type:'CONTINUE'},true);return;}
  if(inTransition){transitionSection=null;persist();playActivity();return;}
  if(finished){reset();return;}
  if(automaticOff&&!session.detour){navigate({type:'CONTINUE'},true);return;}
  if(isPlaying){audio?.pause();document.querySelectorAll('video').forEach(v=>v.pause());dispatch({type:'PAUSE'});return;}
  if(inlineVideo){playVideo();return;}
  if(audio?.active&&audioContext){if(!session.detour&&audioContext.type!=='description')dispatch({type:'PLAY'});if(audio.resume())return;}
  if(videoPending&&(!activity.audioSrc||session.status==='waiting'||session.detour)){openMatchingVideo();return;}
  if(visualPending){if(!session.detour&&activity.audioSrc&&!introduced.has(activity.id)&&session.status!=='waiting')playActivity();else describe(focal.id,true);return;}
  if(session.detour){if(visual)navigate({type:'RETURN'});else if(focal.kind==='video')playVideo();else if(focal.descriptionAudio)describe(focal.id,true);else navigate({type:'RETURN'});return;}
  if(session.status==='waiting'&&termPrompt){describe(focal.id,true);return;}
  if(session.status==='waiting'){navigate({type:'CONTINUE'},true);return;}
  if(activity.kind==='video'&&introduced.has(activity.id)){playVideo();return;}
  if(session.status==='paused'&&audio?.active){dispatch({type:'PLAY'});if(audio.resume())return;}
  playActivity();
 }
 async function openMatchingVideo(){
  if(!matchingVideo)return;
  const target=matchingVideo;
  cancel();inlineVideo=target;
  await tick();if(inlineVideo?.id===target.id)playVideo();
 }
 function navigate(event,auto=false){
  if(inTransition&&event.type==='CONTINUE'){transitionSection=null;persist();if(auto&&started)playActivity();return;}
  cancel();visualHeard=null;dispatch(event);notice='';settleSilent();
  if(event.type==='DETOUR'&&assets[event.assetId]?.kind==='video'&&session.preferences.autoplayVideo)tick().then(playVideo);
  if(auto&&started)scheduleNext();
 }
 function reset(){cancel();const preferences={...session.preferences};const mode=session.mode;dispatch({type:'RESET'});session={...session,preferences,mode};introduced=new Set();started=false;messages=[];persist();}
 function describe(id,explicit=false){const a=assets[id];if(!a)return;if(['image','map'].includes(a.kind)&&matchingVideo&&focal.id===id&&(explicit||session.preferences.autoplayVideo)){openMatchingVideo();return;}if(!session.detour&&a.kind==='term'&&activity.assetId===id){termDefinition=activity.id;persist();}cancel();dispatch({type:'PAUSE'});message(a.description);if(!a.descriptionAudio){notice='No source recording is available for this resource.';return;}audioContext={type:'description',id};audio.play(a.description,a.descriptionAudio,rate);}
 function playVideo(){
  if(!(inlineVideo||focal)?.src){notice='Download this resource before playback.';return;}
  audio?.stop();audioContext=null;
  const v=document.querySelector('.media-stage video');
  if(v){v.playbackRate=rate;v.play().catch(()=>notice='Use the video’s Play button to start.');}
 }
 function videoTime(event){const v=event.currentTarget;videoState={elapsed:Number.isFinite(v.currentTime)?v.currentTime:0,duration:Number.isFinite(v.duration)?v.duration:0};}
 function videoStarted(){audio?.stop();audioContext=null;videoPlaying=true;dispatch({type:'PAUSE'});}
 function videoEnded(){videoState={elapsed:0,duration:0};videoPlaying=false;if(inlineVideo){inlineVideo=null;visualHeard=focal.id;if(!session.detour)session={...session,status:'waiting'};persist();return;}if(session.detour){navigate({type:'RETURN'});return;}dispatch({type:'MEDIA_END',activityId:activity.id});scheduleNext();}
 function setMode(mode){if(session.mode===mode)return;dispatch({type:'SET_MODE',mode});}
 function runCommand(text=command){
  if(!text.trim())return;const input=text.trim();command='';messages=[...messages.slice(-11),{role:'user',text:input}];
  const result=parseCommand(input);sheet=null;
  if(result.event){
   const event={...result.event};if(event.assetId)event.assetId=resolveAsset(event.assetId);
   if(event.type==='PLAY'){
    if(!isPlaying){
     if(audio?.active&&audioContext){if(audioContext.type!=='description')dispatch({type:'PLAY'});audio.resume();}
     else if(session.detour){if(focal.kind==='video')playVideo();else describe(stage.focal);}
     else if(activity.kind==='video'&&introduced.has(activity.id))playVideo();
     else playActivity(true);
    }
   }
   else if(event.type==='PAUSE'){audio?.pause();document.querySelectorAll('video').forEach(v=>v.pause());clearTimeout(timer);dispatch(event);}
   else if(['SET_MODE','SET_PREFERENCE','PIN','UNPIN','QUEUE_NEXT'].includes(event.type))dispatch(event);
   else if(event.type==='CONTINUE'&&termPrompt&&session.status==='waiting')primary();
   else navigate(event,event.type==='CONTINUE');
   if(/\bdescribe\b/i.test(input)&&event.type==='DETOUR')describe(event.assetId);
   else if(/\b(read|watch|play)\b/i.test(input)&&event.type==='DETOUR'){
    if(assets[event.assetId]?.kind==='video')tick().then(playVideo);
    else if(assets[event.assetId]?.descriptionAudio)describe(event.assetId);
   }
  }
  message(result.response);notice=result.response;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{if(notice===result.response)notice='';},4500);
 }
 function exportSession(){const blob=new Blob([JSON.stringify({contract:contentContract.id,session},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='fia-test-session.json';a.click();URL.revokeObjectURL(url);}
 onMount(()=>{
  try{const selected=localStorage.getItem('fia-v3-library-language');if(['eng','spa'].includes(selected))language=selected;}catch{}
  const landscape=window.matchMedia?.('(orientation: landscape) and (pointer: coarse) and (max-height: 600px)');
  const rotate=()=>{phoneLandscape=!!landscape?.matches;if(!phoneLandscape)landscapeDismissed=false;};
  rotate();landscape?.addEventListener('change',rotate);
  try{applyStored();}catch{}
  updateDownloaded();
  audio=createAudioController(s=>audioState=s,finishAudio,text=>{notice=text;dispatch({type:'PAUSE'});},{allowSpeechFallback:false});
  const net=()=>online=navigator.onLine;net();window.addEventListener('online',net);window.addEventListener('offline',net);
  if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').then(()=>updateDownloaded()).catch(()=>{serviceWorkerError='Offline storage is unavailable here. Try the published HTTPS version.';});
  try{const id=localStorage.getItem('fia-v3-selected-pack');if(id&&id!==selectedPack.id)selectPack(id).catch(e=>notice=e.message);}catch{}
  const context=document.modelContext;const lifecycle=new AbortController();
  const register=tool=>{try{Promise.resolve(context?.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'fia_read_session',description:'Read the current FIA activity and stage without changing it.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({activityId:activity.id,status:session.status,mode:session.mode,stage:presentStage(session,activities)})});
  register({name:'fia_present_resource',annotations:{readOnlyHint:false},description:'Open an approved resource as a detour, preserving the current guide position.',inputSchema:{type:'object',properties:{assetId:{type:'string'}},required:['assetId'],additionalProperties:false},execute:async input=>{if(!input||!Object.hasOwn(assets,input.assetId)||Object.keys(input).some(k=>k!=='assetId'))throw new Error('Unknown resource');navigate({type:'DETOUR',assetId:input.assetId});await tick();return {assetId:stage.focal,activityId:activity.id};}});
  register({name:'fia_return_to_guide',description:'Close resource exploration and restore the held guide activity without advancing.',annotations:{readOnlyHint:false},inputSchema:{type:'object',properties:{},additionalProperties:false},execute:async input=>{if(input&&Object.keys(input).length)throw new Error('No arguments expected');navigate({type:'RETURN'});await tick();return {activityId:activity.id,status:session.status,stage:presentStage(session,activities)};}});
  register({name:'fia_complete_activity',annotations:{readOnlyHint:false},description:'Explicitly finish or skip the current activity and advance; this is a user decision, never a read.',inputSchema:{type:'object',properties:{activityId:{type:'string'}},required:['activityId'],additionalProperties:false},execute:async input=>{if(!input||input.activityId!==activity.id||session.detour||Object.keys(input).some(k=>k!=='activityId'))throw new Error('Activity changed or exploration is open');navigate({type:'CONTINUE'},true);await tick();return {activityId:activity.id,status:session.status};}});
  return()=>{landscape?.removeEventListener('change',rotate);clearTimeout(noticeTimer);cancel();lifecycle.abort();window.removeEventListener('online',net);window.removeEventListener('offline',net);};
 });
</script>

<svelte:head><title>FIA · A guided conversation</title></svelte:head>

<main class="scene" class:immersive style={`--reading-scale:${scale}`}>
 <div class="scene-glass scene-glass-top" aria-hidden="true"></div>
 <div class="scene-glass scene-glass-bottom" aria-hidden="true"></div>
 {#if finished}
  <section class="words-stage"><h1>Carry the story with you.</h1></section>
 {:else if inTransition}
  <SectionTransition section={sections.find(s=>s.id===activity.sectionId)} index={sections.findIndex(s=>s.id===activity.sectionId)}/>
 {:else if termPrompt}
  <section class="media-stage reading-stage" data-kind="term-instruction"><h1 class="sr-only">{focal.title}</h1>{#key activity.id}<AlignedReading asset={guideText} identification={focal} playback={audioState} suspended={!!sheet}/>{/key}</section>
 {:else if focal}
  <h1 class="sr-only">{session.detour?focal.title:activity.title}</h1>
  {#key focal.id}<MediaStage asset={focal} {inlineVideo} {immersive} {matchingVideo} onvideo={openMatchingVideo} descriptionsEnabled={session.preferences.describeImages} ontoggledescription={()=>dispatch({type:'SET_PREFERENCE',key:'describeImages',value:!session.preferences.describeImages})} playback={audioState} suspended={!!sheet||mediaTools} toolsVisible={mediaTools} pinned={session.pinned===focal.id} onpin={()=>dispatch({type:session.pinned===focal.id?'UNPIN':'PIN',assetId:focal.id})} ondescribe={()=>describe(focal.id)} ontime={videoTime} onplay={videoStarted} onpause={()=>videoPlaying=false} onend={videoEnded} ondownload={()=>sheet='downloads'} onerror={()=>notice='Video unavailable. Try again or continue without it.'}/>{/key}
 {:else}
  <section class="media-stage reading-stage" data-kind="guide"><h1 class="sr-only">{activity.prompt}</h1>{#key guideText.id}<AlignedReading asset={guideText} playback={audioState} suspended={!!sheet}/>{/key}</section>
 {/if}
 {#if immersive}
  <div class="immersive-controls">
   <button class="glass-icon" aria-label="Exit immersive view" onclick={()=>landscapeDismissed=true}><X size={24}/></button>
   {#if inlineVideo||focal?.kind==='video'}<button class="glass-icon" aria-label={isPlaying?'Pause video':'Play video'} onclick={()=>automaticOff?manualPlay():primary()}>{#if isPlaying}<Pause size={24}/>{:else}<Play size={24}/>{/if}</button>{/if}
  </div>
 {/if}
 <SessionProgress groups={progress} onopen={()=>sheet='progress'}/>
 {#if stage.supporting}<button class="kept-content" aria-label={`Open kept ${assets[stage.supporting].title}`} onclick={()=>navigate({type:'DETOUR',assetId:stage.supporting})}>{#if assets[stage.supporting].src&&assets[stage.supporting].kind!=='video'}<img src={assets[stage.supporting].src} alt={assets[stage.supporting].title}/>{:else}<BookOpen size={22}/>{/if}</button>{/if}

 {#if notice||!online}<div class="scene-notice" role="status"><span>{notice||(!online?(saved?'Offline · session saved':'You’re offline'):'')}</span><button aria-label="Dismiss notice" onclick={()=>notice=''}><X size={15}/></button></div>{/if}
 {#if listeningHint&&muted}<div class="scene-notice" role="status"><span>Prefer automatic narration?</span><button onclick={()=>{listeningHint=false;sheet='settings';}}>Settings</button><button aria-label="Dismiss narration suggestion" onclick={()=>listeningHint=false}><X size={15}/></button></div>{/if}
 <nav class="scene-controls" aria-label="Session controls">
  <button class="menu-control" aria-label="More options" onclick={()=>sheet='menu'}><FiaMark/></button>
  <button class="step-control" aria-label={session.detour?'Return to guide':'Previous activity'} disabled={!session.detour&&session.index===0&&!finished} onclick={()=>navigate({type:'BACK'})}><ChevronLeft size={26}/></button>
  <GuidePrimary playback={inlineVideo||focal?.kind==='video'?videoState:audioState} label={primaryLabel} playing={isPlaying&&!automaticOff} continuing={primaryLabel==='Continue'||primaryLabel==='Return'} onclick={primary}/>
  {#if automaticOff&&!session.detour&&!inTransition&&!finished}
  <button class="step-control" aria-label={manualLabel} title={manualLabel} disabled={!manualAvailable} onclick={()=>manualPlay()}>{#if isPlaying}<Pause size={26}/>{:else}<Play size={26}/>{/if}</button>
  {:else}<button class="step-control" aria-label="Skip to next activity" disabled={finished||!!session.detour} onclick={()=>navigate({type:'CONTINUE'},true)}><ChevronRight size={26}/></button>{/if}
  <button class="replay-control" aria-label="Replay" disabled={finished||!!session.detour} onclick={()=>{if(automaticOff){manualPlay(true);}else if(inlineVideo){const v=document.querySelector('.media-stage video');if(v)v.currentTime=0;videoState={...videoState,elapsed:0};playVideo();}else if(visual&&matchingVideo){openMatchingVideo();}else{cancel();playActivity(true);}}}><RotateCcw size={22}/></button>
 </nav>
 <span class="sr-only" aria-live="polite">{videoPlaying?'Watching together':audioState.playing?'Listening together':session.status==='waiting'?'Continue when your group is ready':''}</span>
</main>

{#if sheet}
 <Sheet glass={true} title={{languages:'Language',passages:'Passages',downloads:'Downloads',progress:'',settings:'Settings',outline:selectedPack.title,help:'Try the experience',about:'About this prototype',menu:'',conversation:'Ask the guide',words:'Words for this moment',resources:'Explore the passage',example:'Drama example'}[sheet]} onclose={()=>sheet=null}>
  {#if sheet==='menu'}
   <div class="scene-menu">
    <button onclick={()=>sheet='languages'}><MessageCircle size={19}/>Language<span class="menu-value">{language==='eng'?'English':'Español'}</span></button>
    <button onclick={()=>sheet='passages'}><BookOpen size={19}/>Passages</button>
    <button onclick={()=>sheet='downloads'}><Download size={19}/>Downloads</button>
    <button onclick={()=>sheet='resources'}><BookOpen size={19}/>Passage resources</button>
    <button onclick={()=>sheet='settings'}><Settings2 size={19}/>Settings</button>
    {#if session.pinned}<button onclick={()=>{dispatch({type:'UNPIN'});sheet=null;}}><PinOff size={19}/>Release kept content</button>{/if}
    <button onclick={()=>sheet='about'}><Info size={19}/>About & sources</button>
   </div>
  {:else if ['languages','passages','downloads'].includes(sheet)}
   <button class="sheet-back" onclick={()=>sheet='menu'}><ChevronLeft size={18}/>FIA menu</button>
   {#key sheet}<LibraryPanel view={sheet} {selectedPack} {language} onlanguage={selectLanguage} onview={view=>sheet=view} completed={session.completed.length} total={activities.length} onstatus={value=>{saved=value;updateDownloaded();}} onselect={selectPack} onreset={restartPack}/>{/key}
  {:else if sheet==='conversation'}
   <p class="sheet-intro">Ask to show a resource, pause, or change how we continue. This prototype supports commands; open-ended AI is not connected.</p>
   <form class="command-form" onsubmit={e=>{e.preventDefault();runCommand();}}><label class="sr-only" for="command">Tell the guide what you need</label><input bind:this={chatInput} id="command" bind:value={command} placeholder="Show me the map…" autocomplete="off"/><button class="icon-button" type="submit" aria-label="Send command" disabled={!command.trim()}><Send size={18}/></button></form>
   {#if messages.length}<details class="conversation-history"><summary>Recent conversation</summary><div class="chat-log" bind:this={chatLog}>{#each messages as m}<p><small>{m.role==='user'?'You':'Guide'}</small>{m.text}</p>{/each}</div></details>{/if}
  {:else if sheet==='words'}
   <p class="reading-transcript">{session.detour||focal?.kind==='term'&&!termPrompt?focal.description:activity.narration||activity.prompt}</p>
   {#if focal}<p class="fine-print">{focal.title} · {focal.source}</p>{/if}
  {:else if sheet==='progress'}
   {#if immersive}
  <div class="immersive-controls">
   <button class="glass-icon" aria-label="Exit immersive view" onclick={()=>landscapeDismissed=true}><X size={24}/></button>
   {#if inlineVideo||focal?.kind==='video'}<button class="glass-icon" aria-label={isPlaying?'Pause video':'Play video'} onclick={()=>automaticOff?manualPlay():primary()}>{#if isPlaying}<Pause size={24}/>{:else}<Play size={24}/>{/if}</button>{/if}
  </div>
 {/if}
 <SessionProgress groups={progress} overview onselect={(id,section)=>{navigate({type:'SEEK_ACTIVITY',activityId:id});transitionSection=section?activity.sectionId:null;persist();sheet=null;}}/>
  {:else if sheet==='settings'}
   <div class="settings-panel">
    <button class="sheet-back" onclick={()=>sheet='menu'}><ChevronLeft size={18}/>FIA menu</button>
    <p class="sheet-intro">Saved on this device for every passage. After downloading available recordings, Play and Replay let you listen without changing these settings.</p>
    <h3>Listening</h3>
    <label class="preference"><span><strong>Automatic guide narration</strong><small>Listen as you move through the guide. When off, Continue stays in the center and Play is beside it.</small></span><input type="checkbox" checked={!muted} onchange={e=>{muted=!e.currentTarget.checked;cancel();dispatch({type:'PAUSE'});persist();}}/></label>
    {#each [{key:'readScripture',title:'Automatic Scripture reading',detail:'Read Scripture aloud when a passage opens, independently of guide narration.'},{key:'describeImages',title:'Describe images and maps',detail:'Automatically play available descriptions after the guide instruction. Source recordings may be generated.'},{key:'autoplayVideo',title:'Automatic video playback',detail:'Use the companion video when available. Explicit Play can still start a video when this is off.'}] as pref}<label class="preference"><span><strong>{pref.title}</strong><small>{pref.detail}</small></span><input type="checkbox" checked={session.preferences[pref.key]} onchange={e=>{if(!e.currentTarget.checked&&pref.key==='readScripture'&&activity.kind==='scripture'){cancel();}if(!e.currentTarget.checked&&pref.key==='autoplayVideo'&&videoPlaying){document.querySelectorAll('video').forEach(v=>v.pause());}dispatch({type:'SET_PREFERENCE',key:pref.key,value:e.currentTarget.checked});}}/></label>{/each}
    {#if matchingVideo}<button class="secondary full" onclick={()=>{sheet=null;openMatchingVideo();}}><Play size={19}/>Play video: {matchingVideo.title}</button>{/if}
    <label class="select-row">Playback speed<select bind:value={rate} onchange={()=>persist()}><option value={.85}>Unhurried · 0.85×</option><option value={1}>Natural · 1×</option><option value={1.15}>Quicker · 1.15×</option></select></label>
    <h3>Appearance</h3>
    <label class="preference"><span><strong>Dark theme</strong><small>A softer dark color palette.</small></span><input type="checkbox" bind:checked={dark} onchange={persist}/></label>
    <label class="select-row">Reading size<select bind:value={scale} onchange={()=>persist()}><option value={1}>Standard</option><option value={1.25}>Larger</option><option value={1.5}>Largest</option></select></label>
   </div>
  {:else if sheet==='outline'}
   <p class="sheet-intro">The complete default six-stage flow. Choose a stage or a moment; jumping does not mark skipped activities complete.</p>
   <div class="outline">{#each sections as section}<details open={activity.sectionId===section.id}><summary>{section.title}</summary>{#each activities.filter(a=>a.sectionId===section.id) as a}{@const Icon=iconFor[a.kind]||Speech}<button class:current={activity.id===a.id} onclick={()=>{navigate({type:'SEEK_ACTIVITY',activityId:a.id});sheet=null;}}><span class="outline-number">{session.completed.includes(a.id)?'✓':''}</span><span><strong>{a.kind==='scripture'?assets[a.assetId].subtitle:a.prompt}</strong><small>{a.id}</small></span><Icon size={18}/></button>{/each}</details>{/each}</div>
   <div class="sheet-actions"><button class="quiet" onclick={()=>{reset();sheet=null;}}><RotateCcw size={16}/>Restart session</button><button class="quiet" onclick={exportSession}><Download size={16}/>Export test state</button></div>
  {:else if sheet==='resources'}
   <p class="sheet-intro">Explore without losing your place. Back returns to the held guide moment. Videos are optional companions.</p>
   <div class="outline">{#each ['scripture','image','map','video','term'] as kind}<details><summary>{({scripture:'Scripture translations',image:'Images',map:'Maps',video:'Videos',term:'Word meanings'})[kind]}</summary>{#each Object.values(assets).filter(a=>a.kind===kind) as a}<button onclick={()=>{navigate({type:'DETOUR',assetId:a.id});sheet=null;}}>{a.subtitle||a.title}<ChevronRight size={18}/></button>{/each}</details>{/each}</div>
   <button class="quiet full" onclick={()=>sheet='example'}><Users size={19}/>Drama example</button>
  {:else if sheet==='example'}
   <p class="sheet-intro">Optional authored example from Embodying the Text. The source provides text here without recordings.</p>{#each examples as unit}<p class="reading-transcript">{unit.text}</p>{/each}
  {:else if sheet==='help'}
   <p class="sheet-intro">Original approved English Mark 1:1–13 example, after downloading its resources. Begin listening. Use More options → Conversation to type a request. Your place stays the same.</p>
   <ol class="test-list"><li><strong>Begin and listen.</strong> Scripture appears and is read automatically; the guide then returns.</li><li><strong>Stay with the image.</strong> The river appears with its prompt. Narration ends, but the image stays until your group continues.</li><li><strong>Explore the map.</strong> Zoom, drag and enlarge it. Keep it visible with the pin.</li><li><strong>Watch the video.</strong> Press Play; completion brings you back to the guide.</li><li><strong>Take a detour.</strong> In Conversation, type “show the map”, then “return to guide”. Your original place is preserved.</li></ol>
   <div class="scope-note"><strong>What’s real in this prototype</strong><p>Svelte UI, activity engine, local narration, video, zoom/pan, session persistence, browser-supported voice commands, preferences and resource presentation.</p><strong>What’s simulated or pending</strong><p>Commands use a bounded local interpreter. There is no live LLM or Jev model, no external MCP server, and no native app wrapper. Passage text is available from the library. Resource downloads and recording availability are shown separately for each passage.</p></div>
   <a class="secondary full" href="/docs/V3-BLUEPRINT.html" target="_blank" rel="noreferrer"><BookOpen size={17}/>Read the design blueprint</a><a class="quiet full" href="/docs/TEST-GUIDE.html" target="_blank" rel="noreferrer">Detailed test guide<ExternalLink size={14}/></a>
  {:else}
   <p class="sheet-intro">FIA v3 · {selectedPack.title}</p><p>Passage text is available. Guide recordings: {selectedPack.capabilities.guideNarration.count}. Scripture recordings: {selectedPack.capabilities.scriptureAudio.count}. Resources must be downloaded before playback or viewing. {selectedPack.diagnostics?.length?'Some source instructions or requested resource links remain unresolved; their text is retained for your group.':''}</p><p>Built from the conversation’s content-first blueprint. The original approved English Mark 1:1–13 sequence uses the complete six-stage source guide, its existing recordings, three Scripture translations, and linked FIA resources. Authored Scripture calls enter a reading and return to the next guide unit. This remains a prototype for testing.</p><p>Original approved English Mark 1:1–13 sources: Berean Standard Bible, unfoldingWord Literal Text and unfoldingWord Simplified Text; each edition’s rights are retained in the source records. Images: © 2025 Word Collective. Map metadata credits © 2025 Biblica. Video: © 2025 Word Collective. FIA media is provided under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>. Video is compressed for this prototype; visual assets otherwise unchanged.</p><p>The original approved English pack uses the existing source app’s AI-generated recordings, copied unchanged. No new prototype voice is substituted. It is distinct from the source video’s recording. Video captions/transcript are not supplied in this prototype.</p><a class="quiet" href="/content/source/audio-manifest.json" target="_blank" rel="noreferrer">View recording provenance<ExternalLink size={14}/></a><a class="quiet full" href="/docs/CONTENT-RECEIPT.html" target="_blank" rel="noreferrer">Content and design-system receipt<ExternalLink size={14}/></a>
  {/if}
 </Sheet>
{/if}
