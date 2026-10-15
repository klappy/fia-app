// A notice belongs to the passage, screen and sheet that raised it (UX repair R3).
// Its scope is recorded once, when it is raised; the notice ends when that scope does.

const unavailable=/\b(?:unavailable|not available|could not be loaded)\b|\bno (?:source )?recording is available\b|^(?:connect to prepare|download this resource)\b/i;
const failure=/\b(?:could not|cannot|invalid|failed|stopped|refused)\b|\bchanged\./i;

// Kind is read from the app's own fixed wording. It labels the notice; no clearing rule depends on it.
export function noticeKind(text){return unavailable.test(text)?'unavailable':failure.test(text)?'error':'info';}

export function noticeScope(text,{pack,activityId,sheet,playing}){
 return {text,kind:noticeKind(text),packId:pack?.id??null,revision:pack?.revision??null,activityId:activityId??null,sheet:sheet||null,playing:!!playing};
}

// A notice ends when its passage revision or its screen is no longer current, when the
// sheet it was raised in closes, or when playback starts after it was raised while
// nothing played ("Tap Play to hear…" ends once playback starts).
export function noticeEnded(scope,{pack,activityId,sheet,playing}){
 return scope.packId!==(pack?.id??null)||scope.revision!==(pack?.revision??null)||scope.activityId!==(activityId??null)||!!scope.sheet&&!sheet||!scope.playing&&!!playing;
}
