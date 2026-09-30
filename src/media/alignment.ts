// C-12 alignment sidecar: validation (ported from the PoC validator, KNOWLEDGE of
// `validAlignment`), lookup (highlight-from-elapsed) and tap-to-seek targets (R-504).
// A sidecar is bound to one recording: if its audioSha256 is not the playing clip's, it is not
// used — no highlight, no seek, no error (contract C-12 § Test).

export interface AlignedWord {
  from: number;
  to: number;
  start: number;
  end: number;
}

export interface AlignedVerse {
  sourceId: string;
  text: string;
  sourceHtmlSha256: string;
  start: number;
  end: number;
  words: AlignedWord[];
}

export interface AlignmentSidecar {
  schemaVersion: 1;
  id: string;
  audioSha256: string;
  sourceSha256: string;
  duration: number;
  verses: AlignedVerse[];
}

const EPS = 1e-6;

/** Structural checks beyond the JSON schema: monotonic times within duration; word ranges in text, no overlap. */
export function alignmentErrors(s: AlignmentSidecar): string[] {
  const errs: string[] = [];
  let prevEnd = 0;
  s.verses.forEach((v, i) => {
    const at = `verses[${i}]`;
    if (v.start > v.end + EPS) errs.push(`${at}: start after end`);
    if (v.start + EPS < prevEnd) errs.push(`${at}: starts before previous verse ends`);
    if (v.end > s.duration + EPS) errs.push(`${at}: ends after duration`);
    prevEnd = Math.max(prevEnd, v.end);
    let prevTo = 0;
    let prevWordEnd = v.start;
    v.words.forEach((w, j) => {
      const wa = `${at}.words[${j}]`;
      if (w.to <= w.from) errs.push(`${wa}: empty range`);
      if (w.from < prevTo) errs.push(`${wa}: range overlaps previous word`);
      if (w.to > v.text.length) errs.push(`${wa}: range past end of text`);
      if (w.start > w.end + EPS) errs.push(`${wa}: start after end`);
      if (w.start + EPS < prevWordEnd) errs.push(`${wa}: not monotonic`);
      if (w.start + EPS < v.start || w.end > v.end + EPS) errs.push(`${wa}: outside verse time`);
      prevTo = w.to;
      prevWordEnd = w.end;
    });
  });
  return errs;
}

/** The sidecar if it is valid and bound to the playing clip, else null (silently unused). */
export function usableAlignment(
  s: AlignmentSidecar | null | undefined,
  playingAudioSha256: string | null | undefined,
): AlignmentSidecar | null {
  if (!s || !playingAudioSha256) return null;
  if (s.audioSha256 !== playingAudioSha256) return null;
  return alignmentErrors(s).length === 0 ? s : null;
}

export type TimingMode = 'word' | 'verse' | 'none';

/** word: tap a word seeks; verse: tap a verse seeks; none: band only, notice once (R-504). */
export function timingMode(s: AlignmentSidecar | null): TimingMode {
  if (!s) return 'none';
  return s.verses.some((v) => v.words.length > 0) ? 'word' : 'verse';
}

/** Index of the last item with start ≤ t (binary search), or -1. */
function lastStartedAt<T extends { start: number }>(items: T[], t: number): number {
  let lo = 0;
  let hi = items.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].start <= t + EPS) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export interface AlignmentPosition {
  /** verse index, or -1 before the first verse / after the last ends */
  verse: number;
  /** word index in that verse; the last word started stays lit through a pause; -1 if none */
  word: number;
}

export function positionAt(s: AlignmentSidecar, t: number): AlignmentPosition {
  const vi = lastStartedAt(s.verses, t);
  if (vi < 0) return { verse: -1, word: -1 };
  const v = s.verses[vi];
  if (t > v.end + EPS) {
    // in a gap between verses keep the previous verse lit; after the last verse, nothing
    return vi === s.verses.length - 1 ? { verse: -1, word: -1 } : { verse: vi, word: -1 };
  }
  return { verse: vi, word: lastStartedAt(v.words, t) };
}

/** Seek target (seconds) for a tapped word, or null when the word has no timing. */
export function seekToWord(s: AlignmentSidecar, verse: number, word: number): number | null {
  const w = s.verses[verse]?.words[word];
  return w ? w.start : null;
}

/** Seek target for a tapped verse (verse offsets), or null. */
export function seekToVerse(s: AlignmentSidecar, verse: number): number | null {
  const v = s.verses[verse];
  return v ? v.start : null;
}

/** Index of the verse by its source id (e.g. `MRK-1-9`), or -1. */
export function verseIndex(s: AlignmentSidecar, sourceId: string): number {
  return s.verses.findIndex((v) => v.sourceId === sourceId);
}

/**
 * Edition switch keeps the audio position *by verse* (spec 08): the verse playing at `t` in the
 * old recording maps to the start of the same verse in the new one; unknown → 0.
 */
export function mapPositionByVerse(
  from: AlignmentSidecar | null,
  to: AlignmentSidecar | null,
  t: number,
): { sourceId: string | null; t: number } {
  if (!from || !to) return { sourceId: null, t: 0 };
  const p = positionAt(from, t);
  const vi = p.verse >= 0 ? p.verse : lastStartedAt(from.verses, t);
  if (vi < 0) return { sourceId: null, t: 0 };
  const id = from.verses[vi].sourceId;
  const ti = verseIndex(to, id);
  return { sourceId: id, t: ti >= 0 ? to.verses[ti].start : 0 };
}

/** Split a verse into word/gap pieces for rendering; word boundaries are alignment tokens, not whitespace. */
export function splitVerse(v: AlignedVerse): { text: string; word: number | null }[] {
  const out: { text: string; word: number | null }[] = [];
  let at = 0;
  v.words.forEach((w, i) => {
    if (w.from > at) out.push({ text: v.text.slice(at, w.from), word: null });
    out.push({ text: v.text.slice(w.from, w.to), word: i });
    at = w.to;
  });
  if (at < v.text.length) out.push({ text: v.text.slice(at), word: null });
  return out;
}

/** Position carried across an edition switch until the new clip's sidecar is usable. */
export interface EditionSwitchSeek {
  from: AlignmentSidecar;
  t: number;
  toClipId: string;
}

/**
 * Seek target in the new edition's clip once its (hash-bound) sidecar is usable, else null.
 * Seeks only — never plays (R-407).
 */
export function editionSwitchTarget(
  p: EditionSwitchSeek | null,
  to: AlignmentSidecar | null,
  clipId: string,
): number | null {
  if (!p || !to || p.toClipId !== clipId) return null;
  return mapPositionByVerse(p.from, to, p.t).t;
}
