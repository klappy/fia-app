import {guideSpeech} from './guide-speech.js';
// A recorded guide clip is a range of a longer recording. Its end comes from recognised word times and
// stops the instant the media clock reaches it, so a clock that runs a little ahead of the decoded audio
// (a different decoder, a seek that lands early) cuts the last word. This keeps the clip playing for a
// bounded tail (at most 0.25 s) of the recording's own silence after the stored end. How much silence there really is
// comes from guide-speech.js, measured from the delivered audio; with no measurement there is no tail.
// The tail never enters the next clip's range and never passes the end of the audio.
export const TAIL_GRACE_SECONDS = 0.25;
export const NEXT_CLIP_GUARD_SECONDS = 0.02;
const finite = n => typeof n === 'number' && Number.isFinite(n);
// Only recorded-guide clips (a ledger-bound logical source); Scripture passage audio keeps its aligned range.
const guideClip = file => !!file && typeof file.path === 'string' && file.path.startsWith('/audio/source/') && typeof file.logicalSourceSha256 === 'string' && !file.scripturePlaybackMode && !file.scriptureAlignment && !file.timing?.alignmentSha256;
export function tailRoomFor(file, speech = guideSpeech) {
  const room = speech?.sources?.[file?.sourceSha256]?.[file?.path]?.tailRoomSeconds;
  return finite(room) && room > 0 ? Math.min(room, TAIL_GRACE_SECONDS) : 0;
}
// range: {startSeconds,endSeconds}; file: the clip's descriptor; files: every descriptor of the passage.
export function tailExtendedRange(range, file, files = [], { guard = NEXT_CLIP_GUARD_SECONDS, speech = guideSpeech } = {}) {
  if (!range || !finite(range.startSeconds) || !finite(range.endSeconds) || !guideClip(file)) return range;
  let ceiling = range.endSeconds + tailRoomFor(file, speech);
  const same = other => other !== file && other?.sourceSha256 === file.sourceSha256 && other?.deliveryURL === file.deliveryURL;
  for (const other of files) {
    const next = other?.playbackRange;
    if (!same(other) || !next || !finite(next.startSeconds) || next.startSeconds <= range.startSeconds) continue;
    if (next.startSeconds >= range.endSeconds - 1e-9) ceiling = Math.min(ceiling, next.startSeconds - guard);
  }
  if (finite(file.duration)) ceiling = Math.min(ceiling, file.duration - 0.05);
  const end = Math.max(range.endSeconds, ceiling);
  return end === range.endSeconds ? range : { startSeconds: range.startSeconds, endSeconds: Math.round(end * 1000) / 1000 };
}
