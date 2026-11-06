/** Timings are media seconds, never wall-clock estimates. Hold the last word in gaps. */
export function alignmentPosition(alignment, elapsed) {
  if (!alignment?.verses?.length || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > alignment.duration) return null;
  if(alignment.schemaVersion===2){
    // Half-open verse spans; the last started verse stays current through the gap after it.
    let verseIndex=-1;
    for(let i=0;i<alignment.verses.length&&alignment.verses[i].start<=elapsed;i++)verseIndex=i;
    if(verseIndex<0||verseIndex===alignment.verses.length-1&&elapsed>=alignment.verses[verseIndex].end)return null;
    const verse=alignment.verses[verseIndex];
    if(verse.highlightMode==='verse'||!verse.words?.length)return {verseIndex,wordIndex:-1};
    // Inside a word gap the last spoken word keeps its line; the verse centre would pull back.
    let wordIndex=0;
    for(let i=1;i<verse.words.length&&verse.words[i].start<=elapsed;i++)wordIndex=i;
    return {verseIndex,wordIndex};
  }
  let verseIndex = 0;
  for (let i = 1; i < alignment.verses.length; i++) {
    if (alignment.verses[i].start > elapsed) break;
    verseIndex = i;
  }
  const verse = alignment.verses[verseIndex];
  let wordIndex = 0;
  for (let i = 1; i < verse.words.length; i++) {
    if (verse.words[i].start > elapsed) break;
    wordIndex = i;
  }
  return { verseIndex, wordIndex };
}

/** Preserve every source character, including spaces and punctuation between timed words. */
export function alignedSegments(text, words = []) {
  const parts = []; let end = 0;
  words.forEach((word, index) => {
    if (word.from > end) parts.push({text: text.slice(end, word.from)});
    parts.push({text: text.slice(word.from, word.to), wordIndex: index});
    end = word.to;
  });
  if (end < text.length) parts.push({text: text.slice(end)});
  return parts;
}

/** Center the spoken line. A tiny tolerance avoids movement within the same line. */
export function followScrollTop(viewport, target, scrollTop, scrollHeight) {
  if (viewport.height <= 0 || scrollHeight <= viewport.height) return null;
  const delta=(target.top+target.bottom)/2-(viewport.top+viewport.height/2);
  if(Math.abs(delta)<=2)return null;
  const next=Math.max(0,Math.min(scrollHeight-viewport.height,scrollTop+delta));
  return Math.abs(next-scrollTop)<1?null:next;
}

/** Untimed guide text uses an explicitly approximate scroll, not fabricated word alignment.
 * Reach the last line before the clip ends; even a few pixels of overflow count.
 * A clip cut from a shared recording uses its own clock (progressElapsed over
 * progressDuration), never the file's; whole-file playback uses elapsed over duration. */
export function durationScrollTop(playback, height, scrollHeight) {
  const ranged=playback?.progressDuration!==undefined;
  const elapsed=ranged?playback.progressElapsed:playback?.elapsed, duration=ranged?playback.progressDuration:playback?.duration;
  if (![elapsed,duration,height,scrollHeight].every(Number.isFinite) || duration<=0 || height<=0 || scrollHeight<=height) return null;
  const progress=Math.max(0,Math.min(1,(elapsed/duration-.1)/.8));
  return (scrollHeight-height)*progress;
}

/** Open overflowing text like a centered three-line block, with its attribution above it. */
export function readingEdgeSpace(viewportHeight, contentHeight, lineHeight, headingHeight=0) {
  if(viewportHeight<=0||contentHeight<=viewportHeight)return {leading:0,trailing:0};
  return {leading:Math.max(0,viewportHeight/2-lineHeight*1.5-headingHeight),trailing:viewportHeight/2};
}


/** The scroll surface continues behind glass; spoken lines center in its clear area. */
export function clearReadingRect(viewport,topEdge=viewport.top,bottomEdge=viewport.bottom){
 const top=Math.max(viewport.top,Math.min(viewport.bottom,topEdge));
 const bottom=Math.max(top,Math.min(viewport.bottom,bottomEdge));
 return {...viewport,top,bottom,height:bottom-top};
}

/** The highlight leads the voice: word times from speech recognition start a little after the sound does, and the clock reaches the
 * screen a frame or two late, so a highlight that waits for the exact word start always reads behind (captain, Nov 5 2026). */
export const HIGHLIGHT_LEAD_SECONDS = 0.25;
/** Highlight position at a media time, leading the voice. Past the end of the timed words it falls back to the plain clock. */
export function leadingPosition(alignment, elapsed, lead = HIGHLIGHT_LEAD_SECONDS) {
  return alignmentPosition(alignment, elapsed + lead) ?? alignmentPosition(alignment, elapsed);
}
/** The gel is two words wide and slides one word at a time: the spoken word and the next (n+n+1, then n+1+n+2). On a verse's last word it
 * keeps the final two words instead of reaching past the verse. Returns the window's first and last word index. */
export function wordPair(wordIndex, wordCount) {
  const first = Math.max(0, Math.min(wordIndex, wordCount - 2));
  return { first, last: Math.min(wordCount - 1, first + 1) };
}

// Keep accents and non-Latin words; normalize casing, canonical forms and punctuation alike.
const activityWordKey = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s]/gu, '').trim();
const wordCharacter = char => /[\p{L}\p{N}\p{M}]/u.test(char);

/** A guide or instruction card's alignment from its sidecar words ({startMs,endMs,from,to}, offsets into the narration), so the card
 * highlights through the same gel as scripture. Returns null unless every word sits inside the narration text it is shown with. */
export function activityAlignment(text, words, durationMs) {
  if (typeof text !== 'string' || !text || !Array.isArray(words) || !words.length) return null;
  let end = 0;
  for (const w of words) {
    if (!w || !Number.isInteger(w.from) || !Number.isInteger(w.to) || w.from < end || w.to <= w.from || w.to > text.length || !Number.isFinite(w.startMs) || !Number.isFinite(w.endMs)) return null;
    if (typeof w.text !== 'string') return null;
    const key = activityWordKey(w.text);
    if (!key || /\s/u.test(key) || key !== activityWordKey(text.slice(w.from, w.to))) return null;
    // A matching substring inside a different word is still stale.
    const before = Array.from(text.slice(0, w.from)).at(-1) ?? '';
    const after = Array.from(text.slice(w.to))[0] ?? '';
    if (wordCharacter(before) || wordCharacter(after)) return null;
    end = w.to;
  }
  const timed = words.map(w => ({ from: w.from, to: w.to, start: w.startMs / 1000, end: w.endMs / 1000 }));
  const last = timed[timed.length - 1].end;
  return { schemaVersion: 2, clockDomain: 'delivery-media-seconds', duration: Math.max(last, (durationMs || 0) / 1000), verses: [{ start: timed[0].start, end: last, highlightMode: 'word', words: timed }] };
}
