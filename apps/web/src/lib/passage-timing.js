// Page-turn / highlight timing for a Scripture passage, from the reviewed word sidecar (fia-word-transcript@1).
// The sidecar is the single canonical timing source (captain, Nov 4 2026). Its top-level `words` are in the delivery file's
// media seconds, so they already include the passage's offset inside the file; `range` (playbackRange) only trims the words
// to the passage, and `mapping` (timing.mapping) converts the delivery clock to the clock the player reports to the screens.
// The result has the shape AlignedReading already consumes (schemaVersion 2: verses[].words[{from,to,start,end}]), so
// alignmentPosition / alignedSegments / the data-align-word spans and scroll-follow are reused unchanged.
// Anything that cannot be matched honestly returns null and the reading keeps its duration-based scroll fallback.
const norm = s => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');
const TOKEN = /[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu;
export const MIN_SPOKEN_MATCH = 0.7, MIN_VERSE_MATCH = 0.6;
/** Longest-common-subsequence match of displayed words to spoken words; returns [[displayIndex, spokenIndex], ...]. */
function lcs(a, b) {
  const n = a.length, m = b.length, w = m + 1, t = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    t[i * w + j] = a[i] === b[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
  const pairs = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { pairs.push([i++, j++]); } else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) i++; else j++;
  }
  return pairs;
}
/**
 * verses: [{text}] as displayed. sidecar: validated transcript. range: {startSeconds,endSeconds}|null. mapping: {scale,offsetSeconds}|null.
 * Returns an alignment for AlignedReading, or null when the spoken words are not this text (the reading then keeps its
 * duration-based scroll). A sidecar may time only some verses (the reviewed Berean one omits five of Mark 1:1-13): a verse
 * whose words are matched is word-timed; a verse the sidecar does not carry is verse-timed, placed in the silence between
 * its timed neighbours (split by text length), so the page still turns on time and no word is highlighted on a guess.
 */
export function alignmentFromSidecar(verses, sidecar, { range = null, mapping = null } = {}) {
  if (!Array.isArray(verses) || !verses.length || !Array.isArray(sidecar?.words) || !sidecar.words.length) return null;
  const slack = 250;
  const spoken = sidecar.words.filter(w => !range || w.startMs >= range.startSeconds * 1000 - slack && w.endMs <= range.endSeconds * 1000 + slack);
  const shown = [];
  verses.forEach((verse, v) => { for (const m of String(verse.text ?? '').matchAll(TOKEN)) shown.push({ v, from: m.index, to: m.index + m[0].length, key: norm(m[0]) }); });
  if (!spoken.length || !shown.length) return null;
  const pairs = lcs(shown.map(s => s.key), spoken.map(s => norm(s.text)));
  if (pairs.length < MIN_SPOKEN_MATCH * spoken.length) return null;
  const hit = shown.map(() => null); for (const [i, j] of pairs) hit[i] = spoken[j];
  const clock = ms => { const s = ms / 1000; return mapping ? (s - mapping.offsetSeconds) / mapping.scale : s; };
  const per = verses.map((verse, v) => {
    const own = shown.map((s, i) => [s, i]).filter(([s]) => s.v === v), matched = own.filter(([, i]) => hit[i]);
    return { own, timed: own.length > 0 && matched.length >= MIN_VERSE_MATCH * own.length };
  });
  if (!per.some(p => p.timed)) return null;
  const out = verses.map(() => ({ words: [], highlightMode: 'verse', reason: 'Not carried by the word sidecar; scrolled by verse.' }));
  per.forEach((p, v) => {
    if (!p.timed) return;
    const starts = p.own.map(([, i]) => hit[i]?.startMs ?? null), ends = p.own.map(([, i]) => hit[i]?.endMs ?? null);
    // Words the recording did not say (or said differently) share the gap between their matched neighbours, by length.
    for (let a = 0; a < starts.length;) {
      if (starts[a] !== null) { a++; continue; }
      let b = a; while (b < starts.length && starts[b] === null) b++;
      const first = starts.find(x => x !== null), last = [...ends].reverse().find(x => x !== null);
      const from = a > 0 ? ends[a - 1] : first, to = b < starts.length ? starts[b] : last;
      const weights = p.own.slice(a, b).map(([s]) => s.to - s.from), total = weights.reduce((x, y) => x + y, 0) || 1;
      let at = from; for (let x = a; x < b; x++) { const next = at + (Math.max(to, from) - from) * weights[x - a] / total; starts[x] = Math.round(at); ends[x] = Math.round(next); at = next; }
      a = b;
    }
    out[v] = { highlightMode: 'word', words: p.own.map(([s], k) => ({ from: s.from, to: s.to, start: clock(starts[k]), end: clock(Math.max(ends[k], starts[k])) })) };
    out[v].start = out[v].words[0].start; out[v].end = out[v].words.at(-1).end;
  });
  // Verse-timed verses take the silence around them. Runs of them split the gap by text length.
  const edge = { start: clock(spoken[0].startMs), end: clock(spoken.at(-1).endMs) };
  for (let v = 0; v < out.length;) {
    if (per[v].timed) { v++; continue; }
    let w = v; while (w < out.length && !per[w].timed) w++;
    const from = v > 0 ? out[v - 1].end : edge.start, to = w < out.length ? out[w].start : edge.end;
    const weights = verses.slice(v, w).map(x => String(x.text ?? '').length || 1), total = weights.reduce((x, y) => x + y, 0);
    let at = from; for (let x = v; x < w; x++) { const next = at + (Math.max(to, from) - from) * weights[x - v] / total; out[x].start = at; out[x].end = next; at = next; }
    v = w;
  }
  return { schemaVersion: 2, clockDomain: 'delivery-media-seconds', source: 'sidecar', duration: clock(sidecar.durationMs), verses: out };
}
