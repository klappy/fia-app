<script>
 import { onMount, tick, untrack } from 'svelte';
 import {validateExecutablePresentation,executionFor,executablePresentationView,createExecutableNarration} from './lib/executable-presentation.js';
 import { MoreHorizontal, Speech, Play, Pause, ChevronRight, ChevronLeft, Send, Settings2, List, BookOpen, Image, Map, Film, Users, RotateCcw, ArrowLeft, PinOff, Info, Download, MessageCircle, X, CircleHelp, ExternalLink } from 'lucide-svelte';
 import {bundledPresentation,presentationContent} from './lib/content.js';
 import { createSession, reduceSession, currentActivity, presentStage } from './lib/engine.js';
 import { parseCommand } from './lib/commands.js';
 import { createAudioController } from './lib/audio.js';
 import {swipeNavigation,createSelectionTracker} from './lib/swipe.js';
 import {createVideoPresentation} from './lib/video-presentation.js';
 import {createVisualDelivery} from './lib/visual-delivery.js';
 import MediaStage from './components/MediaStage.svelte';
 import AlignedReading from './components/AlignedReading.svelte';
 import Sheet from './components/Sheet.svelte';
 import SessionProgress from './components/SessionProgress.svelte';
 import SectionTransition from './components/SectionTransition.svelte';
 import {progressSections,progressState} from './lib/progress.js';
 import GuidePrimary from './components/GuidePrimary.svelte';
 import FiaMark from './components/FiaMark.svelte';
 import LibraryPanel from './components/LibraryPanel.svelte';
 import {createVideoDelivery} from './lib/video-delivery.js';
 import {createPreparationIntent,preparationIdentity,preparationKey} from './lib/preparation-intent.js';
 import {verifyScripturePassageFile,sameScripturePassageFile,scripturePassagePins} from './lib/scripture-passage.js';
 import {hasGuidePreparation} from './lib/recording-availability.js';
 import {preparationHash} from './lib/prepared-audio.js';
 import {demoVideoSource} from './lib/video-demo.js';
 import {bundledPack,libraryAdapter,hasUnresolvedInstructions} from './lib/library.js';
 import {saveProgress,restoreProgress,resetProgress} from './lib/session-store.js';
 let selectedPack=$state(bundledPack),rawPresentation=$state.raw(bundledPresentation),downloadedPaths=$state(new Set()),downloadedAudioDescriptors=$state(new globalThis.Map());
 let executionPresentation=$derived(executablePresentationView(rawPresentation));
 let executableMode=$derived(!!rawPresentation.execution);
 let executableAction=$derived(executableMode?executionFor(rawPresentation,activity.id):null);
 let executablePlayable=$derived(['play-bound-audio','prepare-original'].includes(executableAction?.narration.action));
 let boundPreparation=$state(null),dismissedExecutionNotice=$state(null);
 let executionNoticeKey=$derived(executableMode?`${selectedPack.revision}:${activity.id}`:null);
 const executableOwner=createExecutableNarration({playBoundAudio:(reference,context)=>libraryAdapter.playBoundAudio(reference,context),prepareOriginal:(reference,context)=>libraryAdapter.prepareOriginal(reference,{...context,prepareNarration:identity=>prepareBoundNarration(identity,context)})});
 let visualState=$state({entries:new globalThis.Map(),loading:null,error:null}),visualAuthorization=$state(null),visualCanceled=$state(null);
 const visualOwner=createVisualDelivery({fetch:(request,signal)=>libraryAdapter.playMedia(request.pack,request.path,request.revision,signal,request.size),create:result=>URL.createObjectURL(new Blob([result.bytes],{type:result.mime})),revoke:url=>tick().then(()=>URL.revokeObjectURL(url)),publish:value=>visualState=value});
 function visualIdentity(){const view=presentStage(session,executionPresentation.activities);return `${selectionGeneration}:${selectedPack.id}:${selectedPack.revision}:${session.index}:${view.focal}:${session.detour?.assetId||''}`;}
 function authorizeVisual(){visualAuthorization=visualIdentity();syncVisual();}
 function retryVisual(){visualCanceled=null;visualOwner.retry();authorizeVisual();}
 function cancelVisual(){visualCanceled=visualIdentity();stopVisual();}
 function stopVisual(){visualAuthorization=null;visualOwner.cancel();}
 function syncVisual(){const view=presentStage(session,executionPresentation.activities),asset=rawPresentation.assets[view.focal];visualOwner.retain([asset?.src,rawPresentation.assets[view.supporting]?.src].filter(Boolean));if(!online||inTransition||finished||visualCanceled===visualIdentity()||!['image','map'].includes(asset?.kind)||downloadedPaths.has(asset.src)&&(!deliveryRevision||downloadedDeliveryRevision===deliveryRevision)||!onlineMedia.has(asset.src)||!deliveryRevision)return;visualAuthorization=visualIdentity();void visualOwner.load({pack:selectedPack,path:asset.src,revision:deliveryRevision,identity:visualAuthorization});}
 $effect(()=>{session;rawPresentation;selectedPack;deliveryRevision;onlineMedia;online;downloadedPaths;downloadedDeliveryRevision;visualCanceled;untrack(syncVisual);});
 let content=$derived(presentationContent(mediaForDevice(executionPresentation,downloadedPaths),selectedPack));
 let activities=$derived(content.activities),assets=$derived(content.assets),sections=$derived(content.sections),examples=$derived(content.examples),readingGroups=$derived(content.readingGroups),contentContract=$derived(content.contentContract),defaultScriptureId=$derived(content.defaultScriptureId);
 let videoDeliveryState=$state({entry:null,loading:false,error:null});
 let nativeDemoVideo=$state(null),savedMedia=$state(new globalThis.Map());
 function storedStreamingSize(){try{const size=localStorage.getItem('fia-streaming-video-size');return ['small','medium','large'].includes(size)?size:'large';}catch{return 'large';}}
 let streamingSize=$state(storedStreamingSize());
 let videoSizes=$derived(['small','medium','large'].filter(size=>{const videos=Object.values(rawPresentation.assets).filter(a=>a.kind==='video');return videos.length&&videos.every(a=>{const f=onlineMedia.get(a.src);return f?.variants?.[size]||size==='large'&&f&&!f.variants;});}));
 const videoDelivery=createVideoDelivery({fetch:(request,signal)=>libraryAdapter.playMedia(request.pack,request.path,request.revision,signal,request.size),create:result=>URL.createObjectURL(new Blob([result.bytes],{type:result.mime})),revoke:url=>tick().then(()=>URL.revokeObjectURL(url)),publish:value=>videoDeliveryState=value});
 let selectionGeneration=0,selectionIntent=0,selectionAbort=null;
 let preparationState=$state(null),preparedRecordings=$state(new globalThis.Map()),preparationDismissed=$state(null);let preparationEvent=0;
 const preparationOwner=createPreparationIntent({request:(identity,signal)=>libraryAdapter.prepareRecording(identity,signal),status:(id,identity,signal)=>libraryAdapter.preparationStatus(id,identity,signal),verify:(result,identity,signal)=>libraryAdapter.verifyPreparedRecording(result,identity,signal),publish:value=>{preparationState=value?{...value,event:++preparationEvent}:null;if(value?.status==='ready')preparedRecordings=new globalThis.Map(preparedRecordings).set(value.key,value.descriptor);}});
 function requestableNarration(){
  if(executableMode)return null;
  const raw=rawPresentation.activities.find(a=>a.id===activity?.id);
  if(session.detour||inTransition||finished||raw?.audioSrc||!['guide','discussion'].includes(raw?.kind)||!raw?.sourceText)return null;
  try{return preparationIdentity(selectedPack,raw,'original');}catch{return null;}
 }
 let preparationRequest=$derived(requestableNarration());
 let observedPreparationRequest=$derived(executableMode?(boundPreparation?.activityId===activity.id?boundPreparation.identity:null):preparationRequest);
 let currentPreparation=$derived(observedPreparationRequest&&preparationState?.key===preparationKey(observedPreparationRequest)?preparationState:null);
 let preparationBusy=$derived(currentPreparation?.status==='preparing');
 let preparationNotice=$derived(executableAction?.narration.action==='blocked'&&dismissedExecutionNotice!==executionNoticeKey?executableAction.narration.reason:currentPreparation?.event!==preparationDismissed?currentPreparation?.message:'');
 async function prepareBoundNarration(identity,context){
  if(context.signal.aborted)return null;
  boundPreparation={activityId:context.activityId,identity};
  const key=preparationKey(identity);let descriptor=preparedRecordings.get(key);
  if(!descriptor){const result=await preparationOwner.start(identity,{explicit:true});if(context.signal.aborted||!result)return null;if(!result.immediate&&!context.automatic)return {status:'ready'};descriptor=result.descriptor;}
  return libraryAdapter.playPreparedRecording(descriptor,context.signal);
 }
 async function playExecutableNarration({automatic=false}={}){
  if(!executablePlayable||session.detour||inTransition||finished||automatic&&(!playbackConsent||automaticOff))return;
  if(deferVideo(()=>playExecutableNarration({automatic})))return;
  const pack=selectedPack,id=activity.id,generation=selectionGeneration,presentation=rawPresentation;
  cancel();notice='';started=true;const owner=++mediaGeneration;mediaAbort=new AbortController();const signal=mediaAbort.signal;mediaLoading=true;
  try{
   const result=await executableOwner.run(presentation,id,{explicit:true,automatic,signal});
   if(owner!==mediaGeneration||signal.aborted||generation!==selectionGeneration||pack!==selectedPack||id!==activity.id||automatic&&(!playbackConsent||automaticOff))return;
   if(!result?.bytes)return;
   mediaBlob=URL.createObjectURL(new Blob([result.bytes],{type:result.mime}));mediaTiming=null;mediaAlignment=null;mediaLogicalPath=null;
   audioContext={type:'narration',id};playbackConsent=true;dispatch({type:'PLAY'});
   if(result.playback==='whole-file-native-ended')audio.play('',mediaBlob,1);else audio.play('',mediaBlob,rate,result.playbackRange??undefined);persist();
  }catch(error){if(owner===mediaGeneration){revokePlayback();notice=error.message;dispatch({type:'PAUSE'});}}
  finally{if(owner===mediaGeneration)mediaLoading=false;}
 }
 function executablePrimaryLabel(){return mediaLoading?'Cancel loading':finished?'Begin again':inTransition||session.detour||automaticOff||session.status==='waiting'||!executablePlayable?'Continue':isPlaying?'Pause':audio?.active&&audioContext?'Resume':!started?'Begin':'Play';}
 function executablePrimary(){
  if(mediaLoading){revokePlayback();return;}
  if(inTransition){navigate({type:'CONTINUE'},true);return;}if(finished){reset();return;}
  if(automaticOff||session.status==='waiting'||!executablePlayable){navigate({type:'CONTINUE'},true);return;}
  if(isPlaying){revokePlayback();audio?.pause();dispatch({type:'PAUSE'});return;}
  if(audio?.active&&audioContext){playbackConsent=true;dispatch({type:'PLAY'});audio.resume();return;}
  playbackConsent=true;void playExecutableNarration({automatic:true});
 }
 async function playRequestedNarration({automatic=false}={}){
  if(automatic&&(!playbackConsent||automaticOff))return;
  if(!preparationRequest||!online){notice='Connect to prepare or play this recording. You can continue without it.';return;}
  if(preparationBusy){preparationOwner.cancel();return;}
  if(deferVideo(()=>playRequestedNarration({automatic})))return;
  const identity=preparationRequest,key=preparationKey(identity),pack=selectedPack,id=activity.id,generation=selectionGeneration;
  cancel();notice='';const playbackOwner=mediaGeneration;started=true;
  const raw=rawPresentation.activities.find(a=>a.id===id);
  if(await preparationHash(raw.sourceText)!==identity.sourceTextSha256){notice='This instruction text could not be verified.';return;}
  if(generation!==selectionGeneration||pack!==selectedPack||id!==activity.id||playbackOwner!==mediaGeneration)return;
  let descriptor=preparedRecordings.get(key);
  if(!descriptor){
   const result=await preparationOwner.start(identity,{explicit:true});
   if(generation!==selectionGeneration||pack!==selectedPack||id!==activity.id||playbackOwner!==mediaGeneration)return;
   // Only the still-owned explicit Begin/Next action may carry playback through preparation.
   // Passive/manual readiness continues to require another Play.
   if(!result||(!result.immediate&&!automatic))return;
   descriptor=result.descriptor;
  }
  if(automatic&&(!playbackConsent||automaticOff))return;
  const owner=++mediaGeneration;mediaAbort=new AbortController();const signal=mediaAbort.signal;mediaLoading=true;
  try{
   const result=await libraryAdapter.playPreparedRecording(descriptor,signal);
   if(owner!==mediaGeneration||signal.aborted||generation!==selectionGeneration||pack!==selectedPack||id!==activity.id||automatic&&(!playbackConsent||automaticOff))return;
   mediaBlob=URL.createObjectURL(new Blob([result.bytes],{type:result.mime}));mediaTiming=null;mediaAlignment=null;mediaLogicalPath=null;
   audioContext={type:'narration',id};playbackConsent=true;dispatch({type:'PLAY'});if(result.playback==='whole-file-native-ended')audio.play(raw.narration||raw.sourceText,mediaBlob,1);else audio.play(raw.narration||raw.sourceText,mediaBlob,rate,result.playbackRange);persist();
  }catch(error){if(owner===mediaGeneration){preparedRecordings=new globalThis.Map(preparedRecordings);preparedRecordings.delete(key);revokePlayback();notice=error.message;dispatch({type:'PAUSE'});}}
  finally{if(owner===mediaGeneration)mediaLoading=false;}
 }

 let onlineMedia=$state(new globalThis.Map()),deliveryRevision=$state(null),downloadedDeliveryRevision=$state(null),mediaLoading=$state(false),playbackPending=$state(false);
 let playbackConsent=false,mediaGeneration=0,mediaAbort=null,mediaBlob=null,mediaTiming=null;
 let mediaAlignment=$state(null),mediaLogicalPath=$state(null);
 let mediaRefreshGeneration=0;
 async function updateMedia(){const refresh=++mediaRefreshGeneration,generation=selectionGeneration,pack=selectedPack;try{const status=await libraryAdapter.mediaStatus(pack);for(const file of [...status.files,...(status.savedFiles||[])])if(file.scripturePlaybackMode==='passage-only')await verifyScripturePassageFile(file,pack.id,rawPresentation.assets);if(generation!==selectionGeneration||refresh!==mediaRefreshGeneration)return;if(deliveryRevision&&deliveryRevision!==status.deliveryRevision){if(deferVideo(()=>updateMedia()))return;videoDelivery.clear();stopVisual();visualOwner.clear();}deliveryRevision=status.deliveryRevision;onlineMedia=new globalThis.Map(status.files.map(f=>[f.path,f]));savedMedia=new globalThis.Map((status.savedFiles||[]).map(f=>[f.path,f]));}catch(error){if(generation===selectionGeneration&&refresh===mediaRefreshGeneration&&error?.code!=='media-status-transient'){onlineMedia=new globalThis.Map();savedMedia=new globalThis.Map();deliveryRevision=null;}}}
 function revokePlayback(){executableOwner.cancel();preparationOwner.cancel();videoDelivery.cancel();stopVisual();playbackConsent=false;playbackPending=false;clearTimeout(timer);timer=null;mediaGeneration++;mediaAbort?.abort();mediaAbort=null;mediaLoading=false;}
 async function startRecording(text,path,explicit=false){
  if(explicit){playbackConsent=true;authorizeVisual();}if(!playbackConsent)return;
  const owner=++mediaGeneration,pack=selectedPack,activityId=activity.id;mediaAbort?.abort();mediaAbort=new AbortController();const signal=mediaAbort.signal;
  if(mediaBlob){URL.revokeObjectURL(mediaBlob);mediaBlob=null;}mediaTiming=null;mediaAlignment=null;
  try{if(onlineMedia.has(path)){mediaLoading=true;const result=await libraryAdapter.playMedia(pack,path,deliveryRevision,signal);if(owner!==mediaGeneration||signal.aborted||pack!==selectedPack||activityId!==activity.id)return;const expected=savedMedia.get(path)||onlineMedia.get(path);if(expected.scripturePlaybackMode==='passage-only'){await verifyScripturePassageFile(result.file,pack.id,rawPresentation.assets);if(!sameScripturePassageFile(expected,result.file)||result.scriptureAlignment!==null||JSON.stringify(result.playbackRange)!==JSON.stringify(expected.playbackRange)||JSON.stringify(result.timing)!==JSON.stringify(expected.timing))throw Error('Scripture playback binding changed.');if(owner!==mediaGeneration||signal.aborted||pack!==selectedPack||activityId!==activity.id)return;}mediaBlob=URL.createObjectURL(new Blob([result.bytes],{type:result.mime}));mediaTiming=result.timing;mediaLogicalPath=path;mediaAlignment=result.scriptureAlignment||null;audio.play(text,mediaBlob,rate,result.playbackRange);}else if(downloadedPaths.has(path)){const descriptor=downloadedAudioDescriptors.get(path);if(!descriptor)throw Error('This recording descriptor is unavailable.');mediaTiming=descriptor.timing;mediaLogicalPath=path;mediaAlignment=descriptor.scriptureAlignment||null;audio.play(text,path,rate,descriptor.playbackRange);}else throw Error('This recording is unavailable.');}
  catch(error){if(owner===mediaGeneration){revokePlayback();notice=error.message;dispatch({type:'PAUSE'});}}finally{if(owner===mediaGeneration)mediaLoading=false;}
 }
 function passageFile(assetId){return [...onlineMedia.values(),...downloadedAudioDescriptors.values()].find(f=>f.scripturePlaybackMode==='passage-only'&&f.scriptureAssetId===assetId&&(!deliveryRevision||f.deliveryRevision===deliveryRevision));}
 function mediaForDevice(pack,paths){if(deliveryRevision&&downloadedDeliveryRevision!==deliveryRevision)paths=new Set([...paths].filter(path=>!onlineMedia.has(path)));return {...pack,activities:pack.activities.map(a=>({...a,audioSrc:a.kind==='scripture'&&passageFile(a.assetId)?passageFile(a.assetId).path:paths.has(a.audioSrc)||onlineMedia.has(a.audioSrc)?a.audioSrc:null})),assets:Object.fromEntries(Object.entries(pack.assets).map(([id,a])=>[id,{...a,alignment:a.kind==='scripture'&&passageFile(id)?null:a.kind==='scripture'&&a.descriptionAudio===mediaLogicalPath&&mediaAlignment?mediaAlignment:a.alignment,src:(nativeDemoVideo&&nativeDemoVideo.path===a.src?nativeDemoVideo.url:null)||(videoDeliveryState.entry&&videoDeliveryState.entry.path===a.src?videoDeliveryState.entry.url:null)||visualState.entries.get(a.src)?.url||(paths.has(a.src)?a.src:undefined),videoPrepared:a.kind==='video'&&(onlineMedia.has(a.src)||!!demoVideoSource(selectedPack,a)),videoLoading:a.kind==='video'&&videoDeliveryState.loading,videoError:a.kind==='video'?videoDeliveryState.error:null,visualPrepared:['image','map'].includes(a.kind)&&onlineMedia.has(a.src),visualOffline:!online,visualCanceled:visualCanceled===visualIdentity(),visualLoading:visualState.loading===a.src,visualError:visualState.error&&visualState.error.path===a.src?visualState.error.message:null,poster:paths.has(a.poster)?a.poster:undefined,descriptionAudio:a.kind==='scripture'&&passageFile(id)?passageFile(id).path:paths.has(a.descriptionAudio)||onlineMedia.has(a.descriptionAudio)?a.descriptionAudio:undefined,downloadRequired:['image','map','video'].includes(a.kind)&&(!nativeDemoVideo||nativeDemoVideo.path!==a.src)&&!paths.has(a.src)&&!visualState.entries.has(a.src)&&!(videoDeliveryState.entry&&videoDeliveryState.entry.path===a.src),downloadPrepared:typeof a.src==='string'&&a.src.startsWith('/')&&!a.src.startsWith('//')}]))};}
 function verifiedDownloadedDescriptors(active){
  const keys=['path','sha256','bytes','mime','deliveryURL','deliveryRevision','sourceSha256','sourceBytes','logicalSourceSha256','logicalSourceBytes','scriptureAlignmentSha256','duration',...scripturePassagePins];
  const result=new globalThis.Map();
  for(const file of active.files){
   const declared=active.manifest.files.find(f=>f.path===file.path);
   const candidates=declared?[declared,...Object.values(declared.variants||{})]:[];
   if(!candidates.some(candidate=>keys.every(key=>candidate[key]===file[key])&&JSON.stringify(candidate.timing)===JSON.stringify(file.timing)&&JSON.stringify(candidate.playbackRange)===JSON.stringify(file.playbackRange)&&JSON.stringify(candidate.scriptureAlignment)===JSON.stringify(file.scriptureAlignment)))throw Error('The saved recording descriptor changed.');
   result.set(file.path,file);
  }
  return result;
 }
 let downloadRefreshGeneration=0;
 async function updateDownloaded(){
  const refresh=++downloadRefreshGeneration,generation=selectionGeneration,pack=selectedPack;
  try{
   const status=await libraryAdapter.downloadStatus(pack);if(generation!==selectionGeneration||refresh!==downloadRefreshGeneration)return;
   const snapshot=status.active?.serverSnapshot,media=pack.mediaIdentity;
   const mediaMatches=media?status.active?.manifest?.packId===media.packId&&status.active.manifest.presentationRevision===media.revision&&snapshot?.record.execution?.mediaIdentity?.packId===media.packId&&snapshot.record.execution.mediaIdentity.revision===media.revision&&snapshot.record.execution.mediaAssetsSha256===pack.mediaAssetsSha256:status.active?.manifest?.presentationRevision===pack.revision;
   const verified=!!status.saved&&mediaMatches&&(!media||!snapshot?.invalid&&snapshot?.record.revision===pack.revision);
   const descriptors=verified?verifiedDownloadedDescriptors(status.active):new globalThis.Map();for(const file of descriptors.values())if(file.scripturePlaybackMode==='passage-only')await verifyScripturePassageFile(file,pack.id,rawPresentation.assets);if(generation!==selectionGeneration||refresh!==downloadRefreshGeneration)return;
   if(verified){await libraryAdapter.activate(pack);if(generation!==selectionGeneration||refresh!==downloadRefreshGeneration)return;}
   downloadedAudioDescriptors=descriptors;saved=verified;downloadedDeliveryRevision=verified?status.active.manifest?.deliveryRevision||null:null;downloadedPaths=new Set(verified?status.active.files.map(f=>f.path):[]);
  }catch{if(generation===selectionGeneration&&refresh===downloadRefreshGeneration){saved=false;downloadedPaths=new Set();downloadedAudioDescriptors=new globalThis.Map();downloadedDeliveryRevision=null;}}
 }

 function applyStored(){const stored=restoreProgress(localStorage,selectedPack,activities,assets);if(stored?.resetRequired)notice='This passage changed. Your previous place could not be matched; starting at the beginning.';session=stored?.session||createSession(activities);if(stored){scale=[1,1.25,1.5].includes(stored.scale)?stored.scale:1;rate=[.85,1,1.15].includes(stored.rate)?stored.rate:1;muted=!!stored.muted;dark=!!stored.dark;termDefinition=stored.termDefinition===activities[session.index]?.id?stored.termDefinition:null;transitionSection=stored.transitionSection===activities[session.index]?.sectionId?stored.transitionSection:null;}started=session.index>0||session.status!=='ready';}
 let selectionPending=$state(false);const trackSelection=createSelectionTracker(value=>selectionPending=value);let swipeGeneration=0;
 async function selectPack(id,{explicit=true}={}){selectionAbort?.abort();selectionAbort=new AbortController();const intent=++selectionIntent;await executeSelection(id,intent,{explicit,signal:selectionAbort.signal});}
 async function executeSelection(id,intent,options){if(intent!==selectionIntent)return;if(deferVideo(()=>executeSelection(id,intent,options)))return;const finish=trackSelection();try{await loadSelectedPack(id,intent,options);}catch(error){if(intent===selectionIntent)notice=error.message||'The passage could not be opened. Try again.';}finally{finish();}}
 async function loadSelectedPack(id,intent,options){videoDelivery.cancel();stopVisual();visualOwner.clear();const generation=++selectionGeneration;const loaded=await libraryAdapter.select(id,options);if(intent!==selectionIntent||generation!==selectionGeneration)return;if(deferVideo(()=>applySelectedPack(loaded,generation,intent)))return;await applySelectedPack(loaded,generation,intent);}
 async function applySelectedPack(loaded,generation,intent){if(intent!==selectionIntent||generation!==selectionGeneration)return;validateExecutablePresentation(loaded.presentation);persist();cancel();selectedPack=loaded.descriptor;if(selectedPack.offlineSnapshot==='historical-verified')notice=historicalSnapshotNotice;else if(notice===historicalSnapshotNotice)notice='';rawPresentation=loaded.presentation;saved=false;downloadedDeliveryRevision=null;downloadedPaths=new Set();downloadedAudioDescriptors=new globalThis.Map();onlineMedia=new globalThis.Map();savedMedia=new globalThis.Map();deliveryRevision=null;revokePlayback();introduced=new Set();manualStarts=new Set();visualHeard=null;termDefinition=null;transitionSection=null;messages=[];language=selectedPack.language;session=createSession(loaded.presentation.activities);try{applyStored();localStorage.setItem('fia-v3-selected-pack',loaded.descriptor.id);}catch{notice='Your saved place could not be read.';}sheet=null;await libraryAdapter.activate(selectedPack).catch(()=>{});if(intent!==selectionIntent||generation!==selectionGeneration)return;await updateDownloaded();await updateMedia();}
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
 const historicalSnapshotNotice='Using the last verified saved passage while offline.';
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
 const videoOwner=createVideoPresentation({quiesce:()=>{revokePlayback();audio?.pause();videoPlaying=false;},notice:text=>notice=text});
 function videoIdentity(){return `${selectionGeneration}:${selectedPack.id}:${selectedPack.revision}:${swipeGeneration}:${activity.id}:${inlineVideo?.id||focal.id}`;}
 function ownsVideo(node){return videoOwner.owns(node,videoIdentity());}
 function registerVideo(node,identity){return videoOwner.register(node,identity);}
 function deferVideo(action,retry=false){return videoOwner.defer(action,{retry});}
 function exitImmersive(){if(deferVideo(exitImmersive,true))return;landscapeDismissed=true;}
 let matchingVideo=$derived((executableMode&&!session.detour?[]:focal?.relatedIds||[]).map(id=>assets[id]).find(a=>a?.kind==='video'&&(a.src||a.videoPrepared)));
 let visualHeard=$state(null);
 let visual=$derived(['image','map'].includes(focal?.kind));
 let videoPending=$derived(visual&&!!matchingVideo&&visualHeard!==focal.id);
 let visualPending=$derived(visual&&!matchingVideo&&session.preferences.describeImages&&!muted&&!!focal.descriptionAudio&&visualHeard!==focal.id);
 // Preparation is primary only when no higher-priority playback or visual action owns the control.
 // requestableNarration already excludes transitions, detours and completed sessions.
 let primaryStartsPreparation=$derived(!executableMode&&!isPlaying&&!playbackPending&&!inlineVideo&&!videoDeliveryState.loading&&!videoPending&&!visualPending&&!!preparationRequest&&hasGuidePreparation(selectedPack,preparationRequest)&&!automaticOff&&!audioContext&&!preparationBusy&&!mediaLoading&&['ready','paused'].includes(session.status));
 let primaryLabel=$derived(executableMode&&!session.detour?executablePrimaryLabel():mediaLoading||videoDeliveryState.loading?'Cancel loading':playbackPending?'Pause':finished?'Begin again':inTransition?'Continue':automaticOff&&!session.detour?'Continue':isPlaying?'Pause':inlineVideo?'Resume':audio?.active&&audioContext?'Resume':videoPending&&(!activity.audioSrc||session.status==='waiting'||session.detour)?'Play video':visualPending&&(!activity.audioSrc||session.status==='waiting'||session.detour)?'Play':session.detour?(visual?'Return':focal?.kind==='video'?'Play video':focal?.descriptionAudio?'Listen':'Return'):primaryStartsPreparation?(!started?'Begin':'Play'):session.status==='waiting'||automaticOff||!activity?.audioSrc?'Continue':session.status==='paused'?'Resume':!started?'Begin':'Play');
 let manualStarts=new Set();let listeningHint=$state(false),hintShown=false;
 let manualAvailable=$derived(executableMode&&!session.detour?executablePlayable:!!(preparationRequest||matchingVideo||focal?.kind==='video'&&(focal.src||focal.videoPrepared)||focal?.descriptionAudio||activity?.audioSrc));
 let manualLabel=$derived(preparationBusy?'Cancel preparation':currentPreparation?.status==='failed'?'Retry recording':isPlaying?'Pause':inlineVideo||audioContext&&audio?.active?'Resume':preparationRequest?'Play original recording':'Play');
 function manualPlay(restart=false){
  if(!isPlaying)authorizeVisual();
  if(!restart&&isPlaying){revokePlayback();audio?.pause();videoOwner.node?.pause();dispatch({type:'PAUSE'});return;}
  if(!restart&&inlineVideo){playVideo();return;}
  if(!restart&&audioContext&&audio?.active){playbackConsent=true;audio.resume();return;}
  if(deferVideo(()=>manualPlay(restart)))return;
  if(executableMode&&!session.detour){void playExecutableNarration();return;}
  if(preparationRequest){void playRequestedNarration();return;}
  manualStarts.add(activity.id);
  if(manualStarts.size>=3&&!hintShown){listeningHint=true;hintShown=true;}
  if(visual&&matchingVideo){openMatchingVideo();return;}
  if(focal?.kind==='video'){cancel();const v=videoOwner.node;if(v)v.currentTime=0;playVideo();return;}
  const src=focal?.descriptionAudio||activity.audioSrc;
  if(!src)return;
  cancel();started=true;
  if(focal?.kind==='term')termDefinition=activity.id;
  audioContext={type:'manual',id:activity.id};startRecording(focal?.description||activity.narration,src,true);persist();
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
  if(activities[session.index]?.id!==priorActivity||event.type==='RESET'){swipeGeneration++;termDefinition=null;}
  if(nextSection!==priorSection&&event.type!=='RESET')transitionSection=nextSection;
  if(event.type==='RESET'||event.type==='SEEK_ACTIVITY'&&nextSection===priorSection)transitionSection=null;
  persist();
  if(event.type==='SET_PREFERENCE'&&event.key==='describeImages'&&descriptionsBefore!==session.preferences.describeImages&&['image','map'].includes(focal?.kind)){
   if(!session.preferences.describeImages&&audioContext?.type==='description'&&audioContext.id===focal.id)cancel();
   // Enabling a preference does not grant a new playback action.
  }
  if(queued&&!session.queued&&session.detour===queued){timer=setTimeout(()=>{if(session.detour===queued&&!muted)describe(queued);},350);}
 }
 function resolveAsset(id){if(assets[id])return id;return (activity.relatedAssetIds||[]).find(key=>assets[key]?.kind===id)||(focal?.kind===id?focal.id:null)||(id==='scripture'?defaultScriptureId:Object.values(assets).find(a=>a.kind===id)?.id)||id;}
 function settleSilent(){if(!inTransition&&!session.detour&&!finished&&!activity.audioSrc){session={...session,status:'waiting'};persist();}}
 function cancel(){if(deferVideo(cancel))return;executableOwner.cancel();preparationOwner.cancel();nativeDemoVideo=null;videoDelivery.clear();playbackPending=false;mediaGeneration++;mediaAbort?.abort();mediaAbort=null;mediaLoading=false;if(mediaBlob){URL.revokeObjectURL(mediaBlob);mediaBlob=null;}mediaTiming=null;mediaAlignment=null;mediaLogicalPath=null;videoState={elapsed:0,duration:0};inlineVideo=null;videoPlaying=false;clearTimeout(timer);timer=null;audio?.stop();videoOwner.node?.pause();audioContext=null;}
 function message(text){messages=[...messages.slice(-11),{role:'assistant',text}];tick().then(()=>chatLog?.scrollTo({top:chatLog.scrollHeight,behavior:'smooth'}));}
 function finishAudio(){
  const context=audioContext;audioContext=null;if(!context)return;
  if(context.type==='description'){if(['image','map'].includes(assets[context.id]?.kind)){visualHeard=context.id;if(!session.detour)session={...session,status:'waiting'};}return;}
  if(context.type==='manual'){session={...session,status:'waiting'};persist();return;}
  if(context.type==='response')return;
  introduced=new Set([...introduced,context.id]);
  const before=session.index;dispatch({type:'NARRATION_END',activityId:context.id});
  if(session.index!==before){scheduleNext();}
  else if(!executableMode&&!session.detour&&visual&&(session.preferences.describeImages&&focal?.descriptionAudio||session.preferences.autoplayVideo&&matchingVideo)){describe(focal.id);}
  else if(!executableMode&&!session.detour&&activity?.kind==='video'&&session.preferences.autoplayVideo){timer=setTimeout(()=>{if(session.preferences.autoplayVideo)playVideo();},350);}
 }
 function scheduleNext(){
  if(!playbackConsent)return;
  if(session.status==='complete'||session.detour||inTransition)return;
  authorizeVisual(false);
  if(executableMode){if(executablePlayable&&!automaticOff)void playExecutableNarration({automatic:true});else settleSilent();return;}
  if(!activity.audioSrc){if(preparationRequest&&hasGuidePreparation(selectedPack,preparationRequest)&&!automaticOff){void playRequestedNarration({automatic:true});return;}settleSilent();if(activity.kind==='scripture'&&session.preferences.readScripture)notice='No recording is available for this Scripture passage. You can read it and continue.';if(visual&&(session.preferences.autoplayVideo&&matchingVideo||session.preferences.describeImages&&focal?.descriptionAudio)||focal?.kind==='term'&&!muted&&focal.descriptionAudio)describe(focal.id);return;}
  if(automaticOff&&visual&&(session.preferences.autoplayVideo&&matchingVideo||session.preferences.describeImages&&focal?.descriptionAudio)){describe(focal.id);return;}
  const id=activity.id,generation=selectionGeneration;
  if(activity.kind==='scripture'&&!session.preferences.readScripture){notice='The passage is ready for you to read. Continue when you’re ready.';return;}
  if(!automaticOff){playbackPending=true;timer=setTimeout(()=>{playbackPending=false;if(playbackConsent&&generation===selectionGeneration&&activity.id===id&&!session.detour)playActivity(false,true);},650);}
 }
 function playActivity(forceReading=false,automatic=false){
  if(automatic&&!playbackConsent)return;
  if(deferVideo(()=>playActivity(forceReading,automatic)))return;
  if(inTransition){transitionSection=null;persist();}
  if(session.detour){describe(stage.focal);return;}
  if(finished){reset();return;}
  if(executableMode){if(executablePlayable&&(!automatic||!automaticOff))void playExecutableNarration({automatic});else settleSilent();return;}
  started=true;notice='';
  // A viewing-pause cue is only appropriate when there is nothing to play.
  if(visual&&!muted&&/I will pause the audio here/i.test(activity.narration||'')&&((matchingVideo&&(!automatic||session.preferences.autoplayVideo))||(session.preferences.describeImages&&focal.descriptionAudio))){
   cancel();introduced=new Set([...introduced,activity.id]);
   session={...session,status:'waiting'};persist();describe(focal.id,!automatic);return;
  }
  if(focal?.kind==='term')termDefinition=null;
  if(activity.kind==='scripture'&&!session.preferences.readScripture&&!forceReading){dispatch({type:'CONTINUE'});scheduleNext();return;}
  if(!activity.audioSrc){if(!automatic&&preparationRequest){void playRequestedNarration();return;}settleSilent();return;}
  if(automaticOff&&activity.readingGroupId){navigate({type:'CONTINUE'});return;}
  if(automaticOff&&!forceReading){dispatch({type:'PLAY'});introduced=new Set([...introduced,activity.id]);dispatch({type:'NARRATION_END',activityId:activity.id});return;}
  cancel();dispatch({type:'PLAY'});
  audioContext={type:'narration',id:activity.id};startRecording(activity.narration,activity.audioSrc,!automatic);
 }

 function primary(){
  if(executableMode&&!session.detour){executablePrimary();return;}
  if(!isPlaying&&!playbackPending&&!mediaLoading&&!['Continue','Return','Begin again'].includes(primaryLabel))authorizeVisual();
  if(videoDeliveryState.loading){videoDelivery.cancel();return;}if(mediaLoading){revokePlayback();notice='Playback canceled.';return;}
  if(primaryStartsPreparation){playbackConsent=true;void playRequestedNarration({automatic:true});return;}
  if(!activity.audioSrc&&!audioContext&&!session.detour&&!inTransition&&!finished&&!videoPending&&!visualPending){navigate({type:'CONTINUE'},true);return;}
  if(inTransition){navigate({type:'CONTINUE'},true);return;}
  if(finished){reset();return;}
  if(automaticOff&&!session.detour){navigate({type:'CONTINUE'},true);return;}
  if(isPlaying||playbackPending){revokePlayback();audio?.pause();videoOwner.node?.pause();dispatch({type:'PAUSE'});return;}
  if(inlineVideo){playVideo();return;}
  if(audio?.active&&audioContext){playbackConsent=true;if(!session.detour&&audioContext.type!=='description')dispatch({type:'PLAY'});if(audio.resume())return;}
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
  if(deferVideo(openMatchingVideo))return;
  if(!matchingVideo)return;
  const target=matchingVideo,pack=selectedPack,generation=selectionGeneration,activityId=activity.id;
  cancel();inlineVideo=target;
  await tick();if(pack===selectedPack&&generation===selectionGeneration&&activityId===activity.id&&inlineVideo?.id===target.id)playVideo();
 }
 function beginForwardPlayback(){
  if(automaticOff||session.detour||finished||inTransition)return;
  started=true;playbackConsent=true;scheduleNext();
 }
 function navigate(event,auto=false){
  if(deferVideo(()=>navigate(event,auto)))return;
  swipeGeneration++;
  const hadPlaybackConsent=playbackConsent,priorIndex=session.index,forward=auto&&event.type==='CONTINUE';revokePlayback();
  if(inTransition&&event.type==='CONTINUE'){cancel();transitionSection=null;persist();authorizeVisual();if(forward)beginForwardPlayback();return;}
  cancel();visualHeard=null;dispatch(event);notice='';settleSilent();authorizeVisual();
  if(event.type==='DETOUR'&&assets[event.assetId]?.kind==='video'&&session.preferences.autoplayVideo&&hadPlaybackConsent){playbackConsent=true;queueVideoPlay();}
  if(forward&&session.index!==priorIndex)beginForwardPlayback();
 }
 function reset(){if(deferVideo(reset))return;stopVisual();visualOwner.clear();cancel();const preferences={...session.preferences};const mode=session.mode;dispatch({type:'RESET'});session={...session,preferences,mode};introduced=new Set();started=false;messages=[];persist();}
 function describe(id,explicit=false){if(deferVideo(()=>describe(id,explicit)))return;const a=assets[id];if(!a)return;if(['image','map'].includes(a.kind)&&matchingVideo&&focal.id===id&&(explicit||session.preferences.autoplayVideo)){openMatchingVideo();return;}if(!session.detour&&a.kind==='term'&&activity.assetId===id){termDefinition=activity.id;persist();}cancel();dispatch({type:'PAUSE'});message(a.description);if(!a.descriptionAudio){notice='No source recording is available for this resource.';return;}audioContext={type:'description',id};startRecording(a.description,a.descriptionAudio,explicit);}
 function queueVideoPlay(explicit=false){if(!explicit&&!playbackConsent)return;const pack=selectedPack,generation=selectionGeneration,activityId=activity.id,focalId=focal.id,playbackGeneration=mediaGeneration;tick().then(()=>{if(pack===selectedPack&&generation===selectionGeneration&&activityId===activity.id&&focalId===focal.id&&playbackGeneration===mediaGeneration)playVideo();});}
 async function playVideo(){
  audio?.stop();audioContext=null;
  const target=inlineVideo||focal,raw=rawPresentation.assets[target?.id];
  const demoUrl=downloadedDeliveryRevision===deliveryRevision&&downloadedPaths.has(raw?.src)?null:demoVideoSource(selectedPack,raw);
  if(demoUrl){
   const identity=videoIdentity();nativeDemoVideo={path:raw.src,url:demoUrl};if(inlineVideo)inlineVideo={...inlineVideo,src:demoUrl};await tick();if(identity!==videoIdentity())return;
  }else if(target?.videoPrepared&&!target.src?.startsWith('blob:')){
   const pack=selectedPack,identity=videoIdentity(),path=raw?.src;
   try{const catalog=onlineMedia.get(path),file=savedMedia.get(path)||catalog?.variants?.[streamingSize]||(streamingSize==='large'&&!catalog?.variants?catalog:null);if(!file)throw Error(`${({small:'Small',medium:'Medium',large:'Large'}[streamingSize])} is not available for this video yet.`);const url=await videoDelivery.load({pack,path,revision:deliveryRevision,identity,file,size:catalog?.variants?streamingSize:undefined});if(!url||pack!==selectedPack||identity!==videoIdentity())return;if(inlineVideo)inlineVideo={...inlineVideo,src:url};await tick();if(pack!==selectedPack||identity!==videoIdentity())return;}catch(error){if(pack===selectedPack&&identity===videoIdentity())notice=error.message;return;}
  }
  if(!(inlineVideo||focal)?.src){notice='Download this resource before playback.';return;}
  audio?.stop();audioContext=null;
  const v=videoOwner.node;
  if(v&&!videoOwner.pending){v.playbackRate=rate;v.play().catch(()=>{if(ownsVideo(v))notice='Use the video’s Play button to start.';});}
 }
 function videoTime(event){const v=event.currentTarget;if(!ownsVideo(v))return;videoState={elapsed:Number.isFinite(v.currentTime)?v.currentTime:0,duration:Number.isFinite(v.duration)?v.duration:0};}
 function videoStarted(event){if(event&&!ownsVideo(event.currentTarget))return;audio?.stop();audioContext=null;videoPlaying=true;dispatch({type:'PAUSE'});}
 function videoEnded(event){if(event&&!ownsVideo(event.currentTarget))return;if(videoOwner.pending)return;if(deferVideo(()=>videoEnded()))return;videoState={elapsed:0,duration:0};videoPlaying=false;if(inlineVideo){inlineVideo=null;visualHeard=focal.id;if(!session.detour)session={...session,status:'waiting'};persist();return;}if(session.detour){navigate({type:'RETURN'});return;}dispatch({type:'MEDIA_END',activityId:activity.id});scheduleNext();}
 function setMode(mode){if(session.mode===mode)return;dispatch({type:'SET_MODE',mode});}
 function runCommand(text=command){
  if(!text.trim())return;const input=text.trim();command='';messages=[...messages.slice(-11),{role:'user',text:input}];
  const result=parseCommand(input);sheet=null;
  if(result.event){
   const event={...result.event};if(event.assetId)event.assetId=resolveAsset(event.assetId);
   if(event.type==='PLAY'){
    authorizeVisual();
    if(!isPlaying){
     if(audio?.active&&audioContext){playbackConsent=true;if(audioContext.type!=='description')dispatch({type:'PLAY'});audio.resume();}
     else if(session.detour){if(focal.kind==='video')playVideo();else describe(stage.focal,true);}
     else if(executableMode)void playExecutableNarration();
     else if(activity.kind==='video'&&introduced.has(activity.id))playVideo();
     else playActivity(true);
    }
   }
   else if(event.type==='PAUSE'){revokePlayback();audio?.pause();videoOwner.node?.pause();clearTimeout(timer);dispatch(event);}
   else if(['SET_MODE','SET_PREFERENCE','PIN','UNPIN','QUEUE_NEXT'].includes(event.type))dispatch(event);
   else if(event.type==='CONTINUE'&&termPrompt&&session.status==='waiting')primary();
   else navigate(event,event.type==='CONTINUE');
   if(/\bdescribe\b/i.test(input)&&event.type==='DETOUR')describe(event.assetId,true);
   else if(/\b(read|watch|play)\b/i.test(input)&&event.type==='DETOUR'){
    if(assets[event.assetId]?.kind==='video')queueVideoPlay(true);
    else if(assets[event.assetId]?.descriptionAudio)describe(event.assetId,true);
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
  updateDownloaded();updateMedia();
  audio=createAudioController(s=>{const m=mediaAlignment?.clockDomain==='delivery-media-seconds'?null:mediaTiming?.mapping;const logical={...s,src:s.src&&s.src===mediaBlob?mediaLogicalPath:s.src};audioState=m?{...logical,elapsed:Math.max(0,(s.elapsed-m.offsetSeconds)/m.scale),duration:Math.max(0,(s.duration-m.offsetSeconds)/m.scale)}:logical;if(s.playing&&s.src===mediaBlob&&audioContext?.type==='narration'&&audioContext.id===currentPreparation?.identity.activityId&&currentPreparation?.status==='ready')preparationDismissed=currentPreparation.event;},finishAudio,text=>{revokePlayback();notice=text;dispatch({type:'PAUSE'});},{allowSpeechFallback:false});
  const net=()=>{const wasOnline=online;online=navigator.onLine;if(!online)visualOwner.cancel();else if(!wasOnline&&visualCanceled!==visualIdentity()){visualOwner.retry();syncVisual();}};net();window.addEventListener('online',net);window.addEventListener('offline',net);
  if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').then(()=>{updateDownloaded();updateMedia();}).catch(()=>{serviceWorkerError='Offline storage is unavailable here. Try the published HTTPS version.';});
  try{const id=localStorage.getItem('fia-v3-selected-pack');if(id&&id!==selectedPack.id)selectPack(id,{explicit:false}).catch(e=>notice=e.message);}catch{}
  const context=document.modelContext;const lifecycle=new AbortController();
  const register=tool=>{try{Promise.resolve(context?.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'fia_read_session',description:'Read the current FIA activity and stage without changing it.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({activityId:activity.id,status:session.status,mode:session.mode,stage:presentStage(session,activities)})});
  register({name:'fia_present_resource',annotations:{readOnlyHint:false},description:'Open an approved resource as a detour, preserving the current guide position.',inputSchema:{type:'object',properties:{assetId:{type:'string'}},required:['assetId'],additionalProperties:false},execute:async input=>{if(!input||!Object.hasOwn(assets,input.assetId)||Object.keys(input).some(k=>k!=='assetId'))throw new Error('Unknown resource');navigate({type:'DETOUR',assetId:input.assetId});await tick();return {assetId:stage.focal,activityId:activity.id};}});
  register({name:'fia_return_to_guide',description:'Close resource exploration and restore the held guide activity without advancing.',annotations:{readOnlyHint:false},inputSchema:{type:'object',properties:{},additionalProperties:false},execute:async input=>{if(input&&Object.keys(input).length)throw new Error('No arguments expected');navigate({type:'RETURN'});await tick();return {activityId:activity.id,status:session.status,stage:presentStage(session,activities)};}});
  register({name:'fia_complete_activity',annotations:{readOnlyHint:false},description:'Explicitly finish or skip the current activity and advance; this is a user decision, never a read.',inputSchema:{type:'object',properties:{activityId:{type:'string'}},required:['activityId'],additionalProperties:false},execute:async input=>{if(!input||input.activityId!==activity.id||session.detour||Object.keys(input).some(k=>k!=='activityId'))throw new Error('Activity changed or exploration is open');navigate({type:'CONTINUE'},true);await tick();return {activityId:activity.id,status:session.status};}});
  return()=>{selectionAbort?.abort();videoOwner.dispose();videoDelivery.clear();stopVisual();visualOwner.clear();landscape?.removeEventListener('change',rotate);clearTimeout(noticeTimer);cancel();lifecycle.abort();window.removeEventListener('online',net);window.removeEventListener('offline',net);};
 });
</script>

<svelte:head><title>FIA Guide</title></svelte:head>

<main class="scene" class:immersive style={`--reading-scale:${scale}`} use:swipeNavigation={()=>({identity:`${swipeGeneration}:${selectionGeneration}:${selectedPack.id}:${activity.id}:${inTransition}:${JSON.stringify(session.detour)}`,blocked:!!sheet||immersive||selectionPending,next:!finished&&!session.detour,back:!!session.detour||session.index!==0||finished,navigate:direction=>navigate({type:direction==='next'?'CONTINUE':'BACK'},direction==='next')})}>
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
  {#key focal.id}<MediaStage onvideonode={registerVideo} videoIdentity={videoIdentity()} asset={focal} {inlineVideo} {immersive} {matchingVideo} onvideo={openMatchingVideo} descriptionsEnabled={session.preferences.describeImages} ontoggledescription={()=>dispatch({type:'SET_PREFERENCE',key:'describeImages',value:!session.preferences.describeImages})} playback={audioState} suspended={!!sheet||mediaTools} toolsVisible={mediaTools} pinned={session.pinned===focal.id} onpin={()=>dispatch({type:session.pinned===focal.id?'UNPIN':'PIN',assetId:focal.id})} ondescribe={()=>describe(focal.id,true)} ontime={videoTime} onplay={videoStarted} onpause={event=>{if(ownsVideo(event.currentTarget))videoPlaying=false;}} onend={videoEnded} onplayvideo={playVideo} oncancelvideo={()=>videoDelivery.cancel()} onview={retryVisual} oncancelvisual={cancelVisual} ondownload={()=>sheet='downloads'} onerror={()=>notice='Video unavailable. Try again or continue without it.'}/>{/key}
 {:else}
  <section class="media-stage reading-stage" data-kind="guide"><h1 class="sr-only">{activity.prompt}</h1>{#key guideText.id}<AlignedReading asset={guideText} playback={audioState} suspended={!!sheet}/>{/key}</section>
 {/if}
 {#if immersive}
  <div class="immersive-controls">
   <button class="glass-icon" aria-label="Exit immersive view" onclick={exitImmersive}><X size={24}/></button>
   {#if inlineVideo||focal?.kind==='video'}<button class="glass-icon" aria-label={isPlaying?'Pause video':'Play video'} onclick={()=>executableMode?(videoPlaying?videoOwner.node?.pause():playVideo()):automaticOff?manualPlay():primary()}>{#if isPlaying}<Pause size={24}/>{:else}<Play size={24}/>{/if}</button>{/if}
  </div>
 {/if}
 <SessionProgress groups={progress} onopen={()=>sheet='progress'}/>
 {#if stage.supporting}<button class="kept-content" aria-label={`Open kept ${assets[stage.supporting].title}`} onclick={()=>navigate({type:'DETOUR',assetId:stage.supporting})}>{#if assets[stage.supporting].src&&assets[stage.supporting].kind!=='video'}<img src={assets[stage.supporting].src} alt={assets[stage.supporting].title}/>{:else}<BookOpen size={22}/>{/if}</button>{/if}

 {#if notice||!online||preparationNotice}<div class="scene-notice" role="status"><span>{notice||(!online?(saved?'Offline · session saved':'You’re offline'):preparationNotice||'')}</span><button aria-label="Dismiss notice" onclick={()=>{notice='';preparationDismissed=currentPreparation?.event??null;dismissedExecutionNotice=executionNoticeKey;}}><X size={15}/></button></div>{/if}
 {#if listeningHint&&muted}<div class="scene-notice" role="status"><span>Prefer automatic narration?</span><button onclick={()=>{listeningHint=false;sheet='settings';}}>Settings</button><button aria-label="Dismiss narration suggestion" onclick={()=>listeningHint=false}><X size={15}/></button></div>{/if}
 <nav class="scene-controls" aria-label="Session controls">
  <button class="menu-control" aria-label="More options" onclick={()=>sheet='menu'}><FiaMark/></button>
  <button class="step-control" aria-label={session.detour?'Return to guide':'Previous activity'} disabled={!session.detour&&session.index===0&&!finished} onclick={()=>navigate({type:'BACK'})}><ChevronLeft size={26}/></button>
  <GuidePrimary playback={inlineVideo||focal?.kind==='video'?videoState:audioState} label={primaryLabel} canceling={mediaLoading||videoDeliveryState.loading} playing={isPlaying&&!automaticOff} continuing={primaryLabel==='Continue'||primaryLabel==='Return'} onclick={primary}/>
  {#if (automaticOff||preparationRequest||executableMode)&&!primaryStartsPreparation&&manualLabel!==primaryLabel&&!session.detour&&!inTransition&&!finished}
  <button class="step-control" aria-label={manualLabel} title={manualLabel} disabled={!manualAvailable} onclick={()=>manualPlay()}>{#if preparationBusy}<X size={26}/>{:else if isPlaying}<Pause size={26}/>{:else}<Play size={26}/>{/if}</button>
  {:else}<button class="step-control" aria-label="Skip to next activity" disabled={finished||!!session.detour} onclick={()=>navigate({type:'CONTINUE'},true)}><ChevronRight size={26}/></button>{/if}
  <button class="replay-control" aria-label="Replay" disabled={finished||!!session.detour} onclick={()=>{if(executableMode){cancel();void playExecutableNarration();}else if(automaticOff){manualPlay(true);}else if(inlineVideo){const v=videoOwner.node;if(v)v.currentTime=0;videoState={...videoState,elapsed:0};playVideo();}else if(visual&&matchingVideo){openMatchingVideo();}else{cancel();playActivity(true);}}}><RotateCcw size={22}/></button>
 </nav>
 <span class="sr-only" aria-live="polite">{videoPlaying?'Watching together':audioState.playing?'Listening together':session.status==='waiting'?'Continue when your group is ready':''}</span>
</main>

{#if sheet}
 <Sheet glass={true} opaqueHeader={sheet==='settings'||sheet==='downloads'} title={{languages:'Language',passages:'Passages',downloads:'Downloads',progress:'',settings:'Settings',outline:selectedPack.title,help:'Try the experience',about:'About this prototype',menu:'',conversation:'Ask the guide',words:'Words for this moment',resources:'Explore the passage',example:'Drama example'}[sheet]} onclose={()=>sheet=null}>
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
   <button class="glass-icon" aria-label="Exit immersive view" onclick={exitImmersive}><X size={24}/></button>
   {#if inlineVideo||focal?.kind==='video'}<button class="glass-icon" aria-label={isPlaying?'Pause video':'Play video'} onclick={()=>executableMode?(videoPlaying?videoOwner.node?.pause():playVideo()):automaticOff?manualPlay():primary()}>{#if isPlaying}<Pause size={24}/>{:else}<Play size={24}/>{/if}</button>{/if}
  </div>
 {/if}
 <SessionProgress groups={progress} overview onselect={(id,section)=>{navigate({type:'SEEK_ACTIVITY',activityId:id});transitionSection=section?activity.sectionId:null;persist();sheet=null;}}/>
  {:else if sheet==='settings'}
   <div class="settings-panel">
    <button class="sheet-back" onclick={()=>sheet='menu'}><ChevronLeft size={18}/>FIA menu</button>
    <p class="sheet-intro">Saved on this device.</p>
    <h3>Listening</h3>
    <label class="preference"><span><strong>Automatic guide narration</strong><small>Listen as you move through the guide. When off, Continue stays in the center and Play is beside it.</small></span><input type="checkbox" checked={!muted} onchange={e=>{muted=!e.currentTarget.checked;revokePlayback();cancel();dispatch({type:'PAUSE'});persist();}}/></label>
    {#each [{key:'readScripture',title:'Automatic Scripture reading',detail:'Read Scripture aloud when a passage opens, independently of guide narration.'},{key:'describeImages',title:'Describe images and maps',detail:'Automatically play available descriptions after the guide instruction. Source recordings may be generated.'}] as pref}<label class="preference"><span><strong>{pref.title}</strong><small>{pref.detail}</small></span><input type="checkbox" checked={session.preferences[pref.key]} onchange={e=>{if(!e.currentTarget.checked&&pref.key==='readScripture'&&activity.kind==='scripture'){cancel();}if(!e.currentTarget.checked&&pref.key==='autoplayVideo'&&videoPlaying){videoOwner.node?.pause();}dispatch({type:'SET_PREFERENCE',key:pref.key,value:e.currentTarget.checked});}}/></label>{/each}
    <label class="select-row">Playback speed<select bind:value={rate} onchange={()=>persist()}><option value={.85}>Unhurried · 0.85×</option><option value={1}>Natural · 1×</option><option value={1.15}>Quicker · 1.15×</option></select></label>
    <h3>Media</h3><h4>Video</h4>
    {#if matchingVideo}<button class="secondary full" onclick={()=>{sheet=null;openMatchingVideo();}}><Play size={19}/>Play video: {matchingVideo.title}</button>{/if}
    <label class="preference"><span><strong>Automatic video playback</strong><small>Play companion videos as the guide continues.</small></span><input type="checkbox" checked={session.preferences.autoplayVideo} onchange={e=>{if(!e.currentTarget.checked&&videoPlaying)videoOwner.node?.pause();dispatch({type:'SET_PREFERENCE',key:'autoplayVideo',value:e.currentTarget.checked});}}/></label>
    {#if Object.values(rawPresentation.assets).some(a=>demoVideoSource(selectedPack,a))}<p><strong>Streaming: Demo source</strong></p><p class="fine-print">This demo plays the original video. Downloads use optimized files. Saved verified videos use their downloaded size.</p>
    {:else}<label class="select-row">Streaming size<select aria-label="Streaming size" bind:value={streamingSize} onchange={()=>localStorage.setItem('fia-streaming-video-size',streamingSize)}>{#each ['small','medium','large'] as size}<option value={size} disabled={!videoSizes.includes(size)}>{({small:'Small · 480p',medium:'Medium · 540p',large:'Large · 720p'}[size])}{videoSizes.includes(size)?'':' — not available yet'}</option>{/each}</select></label><p class="fine-print">Applies the next time a video starts. Saved videos use their downloaded size. {videoSizes.length<3?'Some sizes are not prepared for this passage yet.':''}</p>{/if}
    <button class="quiet full" onclick={()=>sheet='downloads'}>Choose offline sizes in Downloads</button>
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
   <div class="outline">{#each ['scripture','image','map','video','term'] as kind}<details><summary>{({scripture:'Scripture translations',image:'Images',map:'Maps',video:'Videos',term:'Word meanings'})[kind]}</summary>{#each Object.values(assets).filter(a=>a.kind===kind) as a}<button onclick={()=>{navigate({type:'DETOUR',assetId:a.id});sheet=null;}}>{a.kind==='scripture'?(a.sourceEvidence?.short||a.subtitle||a.title):(a.subtitle||a.title)}<ChevronRight size={18}/></button>{/each}</details>{/each}</div>
   <button class="quiet full" onclick={()=>sheet='example'}><Users size={19}/>Drama example</button>
  {:else if sheet==='example'}
   <p class="sheet-intro">Optional authored example from Embodying the Text. The source provides text here without recordings.</p>{#each examples as unit}<p class="reading-transcript">{unit.text}</p>{/each}
  {:else if sheet==='help'}
   <p class="sheet-intro">Original approved English Mark 1:1–13 example, after downloading its resources. Begin listening. Use More options → Conversation to type a request. Your place stays the same.</p>
   <ol class="test-list"><li><strong>Begin and listen.</strong> Scripture appears and is read automatically; the guide then returns.</li><li><strong>Stay with the image.</strong> The river appears with its prompt. Narration ends, but the image stays until your group continues.</li><li><strong>Explore the map.</strong> Zoom, drag and enlarge it. Keep it visible with the pin.</li><li><strong>Watch the video.</strong> Press Play; completion brings you back to the guide.</li><li><strong>Take a detour.</strong> In Conversation, type “show the map”, then “return to guide”. Your original place is preserved.</li></ol>
   <div class="scope-note"><strong>What’s real in this prototype</strong><p>Svelte UI, activity engine, local narration, video, zoom/pan, session persistence, browser-supported voice commands, preferences and resource presentation.</p><strong>What’s simulated or pending</strong><p>Commands use a bounded local interpreter. There is no live LLM or Jev model, no external MCP server, and no native app wrapper. Passage text is available from the library. Resource downloads and recording availability are shown separately for each passage.</p></div>
   <a class="secondary full" href="/docs/V3-BLUEPRINT.html" target="_blank" rel="noreferrer"><BookOpen size={17}/>Read the design blueprint</a><a class="quiet full" href="/docs/TEST-GUIDE.html" target="_blank" rel="noreferrer">Detailed test guide<ExternalLink size={14}/></a>
  {:else}
   <p class="sheet-intro">FIA v3 · {selectedPack.title}</p><p>Passage text is available. Guide recordings: {selectedPack.capabilities.guideNarration.count}. Scripture recordings: {selectedPack.capabilities.scriptureAudio.count}. Prepared audio can play online when you press Play. Downloads keep media available offline; prepared images and maps can be viewed on demand, with optional offline downloads. Prepared videos can play online when you press Play; downloads are optional for offline use. {hasUnresolvedInstructions(selectedPack)?'Some source instructions or requested resource links remain unresolved; their text is retained for your group.':''}</p><p>Built from the conversation’s content-first blueprint. The original approved English Mark 1:1–13 sequence uses the complete six-stage source guide, its existing recordings, three Scripture translations, and linked FIA resources. Authored Scripture calls enter a reading and return to the next guide unit. This remains a prototype for testing.</p><p>Original approved English Mark 1:1–13 sources: Berean Standard Bible, unfoldingWord Literal Text and unfoldingWord Simplified Text; each edition’s rights are retained in the source records. Images: © 2025 Word Collective. Map metadata credits © 2025 Biblica. Video: © 2025 Word Collective. FIA media is provided under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>. Video is compressed for this prototype; prepared images and maps use source-bound optimized delivery variants.</p><p>The 111 narrated guide activities across the six steps of English Mark 1:1–13 use reviewed sections of the original FIA guide recordings. The Berean Standard Bible reading uses its separate official recording. Recording availability for other passages and languages is shown separately; original human recordings take priority whenever available, with AI-generated narration allowed as a fallback. Scripture and companion-video recordings have separate provenance. Video captions/transcript are not supplied in this prototype.</p><a class="quiet" href="/content/source/audio-manifest.json" target="_blank" rel="noreferrer">Prepared recording provenance<ExternalLink size={14}/></a><a class="quiet" href="/content/recording-sources/66cfb3cb236e2e1072f16c78b5de895c5bff8d058a1526c667d78a9c063e34dd.json" target="_blank" rel="noreferrer">First-step recording provenance<ExternalLink size={14}/></a><a class="quiet full" href="/docs/CONTENT-RECEIPT.html" target="_blank" rel="noreferrer">Content and design-system receipt<ExternalLink size={14}/></a>
  {/if}
 </Sheet>
{/if}
