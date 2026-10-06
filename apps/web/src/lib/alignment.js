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
