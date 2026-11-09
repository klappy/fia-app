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

/** Timing tiers a card can carry (data attribute only; the gel looks the same at every tier):
 *  exact — the activity map passed every check unchanged;
 *  clamped — word times were fitted to the runtime clip (words outside the accepted range were clamped to its edges, and
 *            zero-duration words the generator emits when matched neighbours leave no gap took a share of the neighbouring gap);
 *  approximate — fewer than 70% of the on-screen tokens were heard, so the layout between heard anchors is the generator's
 *            interpolation (a 0/N map is linear across the clip). It is still the closest match the evidence allows.
 * Captain, 2026-11-09: "Highlighting should be antifragile and always highlight the closest matches to create the best UX,
 * previous releases refused highlight features on sections there is no perfect alignment." The UX refusal is gone; byte
 * identity, source pins and range validation stay strict elsewhere, and activityAlignment's text-offset check remains the
 * only hard refusal for a card. */
export const TIMING_TIERS = Object.freeze(['exact', 'clamped', 'approximate']);
export const ACTIVITY_MATCH_FLOOR = 0.7;
/** Structural check of an activity map: shape, integer times, monotonic starts. A malformed map is still refused. */
function activityShape(activity) {
  if (!activity || !Array.isArray(activity.words) || !activity.words.length) return null;
  const {words, matched, total, startMs, endMs} = activity;
  if (!Number.isInteger(total) || total !== words.length || !Number.isInteger(matched) || matched < 0 || matched > total) return null;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs) return null;
  let previous = -Infinity;
  for (const w of words) {
    if (!w || !Number.isInteger(w.startMs) || !Number.isInteger(w.endMs) || w.startMs < previous || w.endMs < w.startMs) return null;
    previous = w.startMs;
  }
  return {words, matched, total, startMs, endMs};
}
/** Zero-duration words share the gap between their timed neighbours by text length (the passage-timing gap-split rule),
 * so every word owns a moment of the clock. When the neighbours leave no gap (the generator's common case: S02-U002 has
 * "or" and "gospel" at 18360 ms with the next word starting at 18360 ms) the run borrows from each timed neighbour the run's
 * text-length share of that neighbour's span, never more than half of it. Every word in the run then holds a strictly
 * positive, distinguishable interval (one millisecond at least, wherever the span has one to give), monotonic,
 * non-overlapping and inside the clip, so wordIndexAt reaches each of them instead of only the last word sharing a start
 * (Codex P2 on #354). Returns the number of zero-duration words it re-timed; a neighbour that lent time is not counted. */
function respaceZeroDuration(words, lo, hi) {
  const timed = w => w.endMs > w.startMs, weight = w => Math.max(1, (w.to ?? 0) - (w.from ?? 0));
  const retime = (x, startMs, endMs) => { if (startMs === words[x].startMs && endMs === words[x].endMs) return 0; words[x] = {...words[x], startMs, endMs}; return 1; };
  let changed = 0;
  for (let a = 0; a < words.length;) {
    if (timed(words[a])) { a++; continue; }
    let b = a; while (b < words.length && !timed(words[b])) b++;
    const weights = words.slice(a, b).map(weight), need = weights.reduce((x, y) => x + y, 0), k = b - a;
    let from = a > 0 ? words[a - 1].endMs : lo, to = b < words.length ? words[b].startMs : hi;
    if (to - from < k) {
      const lend = n => Math.min(Math.floor((n.endMs - n.startMs) / 2), Math.round((n.endMs - n.startMs) * need / (need + weight(n))));
      if (a > 0) { from -= lend(words[a - 1]); retime(a - 1, words[a - 1].startMs, from); }
      if (b < words.length) { to += lend(words[b]); retime(b, to, words[b].endMs); }
    }
    const start = Math.round(from), end = Math.max(start, Math.round(to)), edges = [start];
    let acc = 0; for (const w of weights) edges.push(start + Math.round((end - start) * (acc += w) / need));
    // Forward: distinct starts. Backward: the run still ends at `end` and never starts before `start`.
    for (let i = 1; i < k; i++) edges[i] = Math.max(edges[i], edges[i - 1] + 1);
    for (let i = k - 1; i > 0; i--) edges[i] = Math.max(start, Math.min(edges[i], edges[i + 1] - 1));
    for (let x = a; x < b; x++) changed += retime(x, edges[x - a], edges[x - a + 1]);
    a = b;
  }
  return changed;
}
/** The timing an activity map gives a card, never refused for imperfect evidence: {words, tier, matched, total, clamped, respaced}.
 * `range` is the runtime clip ({startSeconds,endSeconds}); words are clamped into it (a word's true clock cannot be outside
 * the clip that plays it; the recognised onset of the first word often leads the authored clip start by 30–440 ms, and the
 * stop-before-the-next-sound tail policy can end the clip below the map's endMs). Only a malformed map returns null. */
export function activityTiming(activity, range = null) {
  const shape = activityShape(activity);
  if (!shape) return null;
  const {matched, total, startMs, endMs} = shape;
  const lo = range ? range.startSeconds * 1000 : startMs, hi = range ? range.endSeconds * 1000 : endMs;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
  const clip = v => Math.round(Math.min(hi, Math.max(lo, v)));
  let clamped = 0;
  const words = shape.words.map(w => {
    const s = clip(w.startMs), e = Math.max(s, clip(w.endMs));
    if (s === w.startMs && e === w.endMs) return w;
    clamped++; return {...w, startMs: s, endMs: e};
  });
  const respaced = respaceZeroDuration(words, lo, hi);
  // A map whose declared span reaches outside the clip is fitted even when every word already lies inside it.
  const spanClamped = lo > startMs || hi < endMs;
  const tier = matched < Math.ceil(total * ACTIVITY_MATCH_FLOOR) ? 'approximate' : clamped || respaced || spanClamped ? 'clamped' : 'exact';
  Object.defineProperty(words, 'tier', {value: tier, enumerable: false});
  return {words, tier, matched, total, clamped, respaced, spanClamped};
}
/** The words a card highlights and seeks by (same array as activityTiming().words; `words.tier` names the tier). Null only for a
 * malformed map. Never extends playback to accommodate word timings: words are fitted to the clip, not the clip to the words. */
export function activityWords(activity, range = null) {
  return activityTiming(activity, range)?.words ?? null;
}
