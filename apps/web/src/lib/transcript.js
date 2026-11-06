// Word-level millisecond transcript: the seek map of one audio file, and the single source of truth for
// word-by-word highlighting, seeking to a word, and end-of-audio auto-advance.
// The SIDECAR is canonical because it is always writable and accessible; the audio files are not always writable, so timings
// cannot always be embedded. Embedded timings are optional, never read here, and never override the sidecar.
// A sidecar names the delivered bytes it times (audioSha256), the original it was made from (sourceAudioSha256) and the
// verified source-to-delivery clock mapping.
// Sidecar shape (fia-word-transcript@1), stored next to the file's delivery bytes as <audioSha256>.words.json:
//   { schema, audioSha256, clockDomain:'delivery-media-seconds', durationMs, words:[{startMs,endMs,text}],
//     activities?: { [activityId]: { startMs, endMs, words:[{startMs,endMs,text,from,to}] } } }
// `from`/`to` index the activity's on-screen text so every displayed character maps to a millisecond.
export const TRANSCRIPT_SCHEMA = 'fia-word-transcript@1';
export function validateTranscript(t) {
  const fail = why => { throw Error('Invalid word transcript: ' + why); };
  if (!t || t.schema !== TRANSCRIPT_SCHEMA) fail('schema');
  if (t.clockDomain !== 'delivery-media-seconds') fail('clock domain');
  if (!Number.isFinite(t.durationMs) || t.durationMs <= 0) fail('duration');
  const check = (words, label) => {
    if (!Array.isArray(words) || !words.length) fail(label + ' words');
    let last = 0;
    for (const w of words) {
      if (!Number.isInteger(w.startMs) || !Number.isInteger(w.endMs) || w.startMs < 0 || w.endMs < w.startMs || w.endMs > t.durationMs) fail(label + ' bounds');
      if (w.startMs < last) fail(label + ' order');
      if (typeof w.text !== 'string') fail(label + ' text');
      last = w.startMs;
    }
  };
  check(t.words, 'file');
  for (const [id, a] of Object.entries(t.activities || {})) check(a.words, 'activity ' + id);
  return t;
}
/** Index of the word being spoken at `ms` (the last started word holds through gaps); null before the first word or after the last ends. */
export function wordIndexAt(words, ms) {
  if (!words?.length || !Number.isFinite(ms) || ms < words[0].startMs || ms >= words.at(-1).endMs) return null;
  let lo = 0, hi = words.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (words[mid].startMs <= ms) lo = mid; else hi = mid - 1; }
  return lo;
}
/** Exact millisecond at which word `index` starts, for a seek. */
export function seekMsForWord(words, index) {
  return Number.isInteger(index) && index >= 0 && index < words.length ? words[index].startMs : null;
}
/** Split on-screen text into highlightable segments using the activity's from/to word spans. */
export function highlightSegments(text, words, ms) {
  const active = wordIndexAt(words, ms), parts = []; let end = 0;
  words.forEach((w, i) => {
    if (w.from > end) parts.push({ text: text.slice(end, w.from) });
    parts.push({ text: text.slice(w.from, w.to), wordIndex: i, active: i === active, spoken: active !== null && i < active });
    end = w.to;
  });
  if (end < text.length) parts.push({ text: text.slice(end) });
  return parts;
}

/** ASR activity maps may contain interpolated words. Below 70% matched tokens (the
 * existing passage-timing spoken-match floor), or outside the accepted clip, use
 * untimed text. Never extend playback to accommodate suspect word timings. */
export function activityWords(activity, range = null) {
  if (!activity || !Array.isArray(activity.words) || !activity.words.length) return null;
  const {words, matched, total, startMs, endMs} = activity;
  if (!Number.isInteger(total) || total !== words.length || !Number.isInteger(matched) || matched > total || matched < Math.ceil(total * 0.7)) return null;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs) return null;
  const lo = range ? range.startSeconds * 1000 : startMs, hi = range ? range.endSeconds * 1000 : endMs;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > startMs || hi < endMs) return null;
  let previous = startMs;
  for (const w of words) {
    if (!Number.isInteger(w.startMs) || !Number.isInteger(w.endMs) || w.startMs < previous || w.startMs < startMs || w.endMs <= w.startMs || w.endMs > endMs) return null;
    previous = w.startMs;
  }
  return words;
}
