// Input builder for fia-easy-button-policy@1 (packages/contracts/easy-button-policy).
// Maps App.svelte's own derived values onto the policy's closed input. No decisions here:
// every branch the primary button, autoplay and the viewing cue take is decide()'s.
// Line cites are against fia-app main @3d3b1d2 (apps/web/src/App.svelte).
import viewingCues from './viewing-cues.json' with {type:'json'};

const ROLES=new Set(['guide','discussion','scripture','video']);
const FOCAL_KINDS=new Set(['image','map','video','term','scripture']);
const NARRATION_OF_ACTION={none:'none','play-bound-audio':'bound','prepare-original':'preparable',blocked:'blocked'};

/** Pause-only viewing cue from data only: server flow first, then the activity, then viewing-cues.json. Never from text. */
export function pauseOnlyCue(presentationId,activity){
 if(activity?.flow?.cue)return activity.flow.cue.pauseOnly===true;
 if(activity?.cue)return activity.cue.pauseOnly===true;
 return !!activity?.id&&(viewingCues.presentations[presentationId]?.pauseOnly||[]).includes(activity.id);
}

/**
 * policyInputFrom(state) → fia-easy-button-policy@1 input.
 * `state` carries App.svelte's values as they are at the call site:
 * executableMode, executableAction (:33), presentationId, activity, focal (:190), matchingVideo (:208),
 * session (status, detour, preferences), muted, inTransition (:183), isPlaying (:186), inlineVideo (:200),
 * mediaLoading, videoLoading (videoDeliveryState.loading), playbackPending, audioActive (audio?.active),
 * audioContext, started, introduced (Set), visualHeard, playbackConsent, automatic (playActivity's flag),
 * preparationAvailable (preparationRequest && hasGuidePreparation, :215), preparationBusy (:66), preparationStatus.
 * verifying (R5), starting (R4: startPending||startBurst&&isPlaying, before the gate decide() applies) and requestStarting
 * come from App.svelte after #193; phase is loading while verifying, starting while a start is pending, else verified.
 */
export function policyInputFrom(s){
 const activity=s.activity,focal=s.focal,session=s.session;
 const executable=!!s.executableMode;
 // Unknown activity kinds read as guide: the :91/:216 chains only test kind for scripture (:179) and video (:270).
 const role=ROLES.has(activity?.kind)?activity.kind:'guide';
 const kind=FOCAL_KINDS.has(focal?.kind)?focal.kind:null;
 const hold=executable?(s.executableAction?.completion?.action==='manual-continue'?'manual':'auto'):(activity?.completion==='confirm'?'manual':'auto');
 const narration=executable?(NARRATION_OF_ACTION[s.executableAction?.narration?.action]||'blocked'):(activity?.audioSrc?'bound':'none');
 const preparation=s.preparationBusy?'preparing':s.preparationAvailable?'available':['ready','failed'].includes(s.preparationStatus)?s.preparationStatus:'none';
 return {
  flow:{
   role,hold,narration,
   focal:{kind,descriptionAudio:!!focal?.descriptionAudio},
   media:{video:s.matchingVideo?'bound':'none'},
   cue:{pauseOnly:pauseOnlyCue(s.presentationId,activity)}
  },
  settings:{
   guideNarration:!s.muted,
   readScripture:!!session.preferences.readScripture,
   describeImages:!!session.preferences.describeImages,
   autoplayVideo:!!session.preferences.autoplayVideo
  },
  facts:{
   phase:s.verifying?'loading':s.starting?'starting':'verified',
   mode:executable?'executable':'bundled',
   detour:!!session.detour,
   inTransition:!!s.inTransition,
   mediaLoading:!!s.mediaLoading,
   videoLoading:!!s.videoLoading,
   playbackPending:!!s.playbackPending,
   playing:!!s.isPlaying,
   inlineVideo:!!s.inlineVideo,
   audioActive:!!s.audioActive,
   audioContext:!!s.audioContext,
   started:!!s.started,
   introduced:!!activity?.id&&!!s.introduced?.has?.(activity.id),
   visualHeard:!!focal&&s.visualHeard===focal.id,
   playbackConsent:!!s.playbackConsent,
   automaticStart:!!s.automatic,
   requestStarting:!!s.requestStarting,
   status:session.status,
   preparation
  }
 };
}
