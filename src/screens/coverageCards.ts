// F6-S19: the six type cards of the nodded mock (cookbook design/alpha-v2-screens/19-coverage.html), as
// data. Pure and unit-tested; the screen only draws what this returns. Every chip is read from the
// pipeline's catalog: C-03 presence and provenance (`coverageFor`) plus the per-language file
// `data/catalog/<lang>.json` (`counts`, and the audio slot status of each passage's guide and
// Scripture). Nothing is invented: a slot the data has not filled reads "not yet", and audio that no
// such thing has (images, maps) reads "none" (mock 19-coverage.html:12).
import { t } from '../i18n';
import type { CoverageKey, LanguageCounts, LanguageCoverage } from '../settings';

/** on = on FIA in this language · ai = AI voice · absent = not yet · none = no such thing. */
export type CellMark = 'on' | 'ai' | 'absent' | 'none';
export interface Cell {
  mark: CellMark;
  words: string;
}
/** Kit Bead kinds (progress/StageRail.jsx): the guide's progress-dot code (PRD § 8.3). */
export type CardKind = 'plain' | 'scripture' | 'term' | 'media' | 'video';
export interface TypeCard {
  key: CoverageKey;
  kind: CardKind;
  text: Cell;
  audio: Cell;
}
export type VoiceState = 'ai' | 'recorded' | 'not-yet';

/** The subset of `data/catalog/<lang>.json` the screen reads (pipeline/src/inventory.mjs). */
interface Slot {
  status?: string;
}
export interface LanguageFile {
  autonym?: string;
  counts?: LanguageCounts;
  entries?: {
    guide?: { narration?: Slot };
    scripture?: { audio?: Slot }[];
  }[];
}

const KIND: Record<CoverageKey, CardKind> = {
  guide: 'plain',
  scripture: 'scripture',
  terms: 'term',
  images: 'media',
  maps: 'media',
  videos: 'video',
};

/** The noun each type counts in the mock: 396 passages, 2 editions, 238 terms, 217 titles. */
const NOUN: Record<CoverageKey, string> = {
  guide: 's.coverage.chip.passages',
  scripture: 's.coverage.chip.editions',
  terms: 's.coverage.chip.terms',
  images: 's.coverage.chip.titles',
  maps: 's.coverage.chip.titles',
  videos: 's.coverage.chip.titles',
};

const count = (key: string, n: number) => t(key, { n, count: n.toLocaleString('en') });
const notYet = (): Cell => ({ mark: 'absent', words: t('s.coverage.not-yet') });

/** Audio slots: recorded wins, then AI voice; neither filled is "not yet". */
function audioFrom(slots: (Slot | undefined)[]): Cell {
  let source = 0;
  let generated = 0;
  for (const s of slots) {
    if (s?.status === 'source') source++;
    else if (s?.status === 'generated') generated++;
  }
  if (source) return { mark: 'on', words: count('s.coverage.chip.recordings', source) };
  if (generated) return { mark: 'ai', words: t('s.common.mark.ai-voice') };
  return notYet();
}

function textCell(cov: LanguageCoverage, key: CoverageKey): Cell {
  const row = cov.rows.find((r) => r.key === key)!;
  switch (row.status) {
    case 'available':
      return { mark: 'on', words: count(NOUN[key], row.count ?? 0) };
    case 'english-only':
      return { mark: 'absent', words: t('s.coverage.chip.english-shown') };
    case 'absent':
      return notYet();
    case 'listed':
      // Only without the per-language counts, which the screen treats as a failed load.
      return { mark: 'none', words: t('s.common.mark.checking') };
  }
}

function audioCell(cov: LanguageCoverage, key: CoverageKey, file: LanguageFile): Cell {
  const entries = file.entries ?? [];
  switch (key) {
    case 'guide':
      return audioFrom(entries.map((e) => e.guide?.narration));
    case 'scripture':
      return audioFrom(entries.flatMap((e) => (e.scripture ?? []).map((s) => s.audio)));
    case 'terms': {
      const n = file.counts?.termAudio ?? 0;
      return n > 0 ? { mark: 'on', words: count('s.coverage.chip.recordings', n) } : notYet();
    }
    case 'videos':
      // A video carries its own sound: localized videos are heard in the language.
      return cov.rows.find((r) => r.key === 'videos')?.status === 'available'
        ? { mark: 'on', words: t('s.coverage.chip.in-video') }
        : notYet();
    case 'images':
    case 'maps':
      return { mark: 'none', words: t('s.coverage.none') };
  }
}

export function coverageCards(cov: LanguageCoverage, file: LanguageFile): TypeCard[] {
  return cov.rows.map((r) => ({
    key: r.key,
    kind: KIND[r.key],
    text: textCell(cov, r.key),
    audio: audioCell(cov, r.key, file),
  }));
}

/** The voice the guide is read in (mock: "Voice: Español AI voice"), from the guide's audio cell. */
export function voiceState(cards: TypeCard[]): VoiceState {
  const m = cards.find((c) => c.key === 'guide')?.audio.mark;
  return m === 'ai' ? 'ai' : m === 'on' ? 'recorded' : 'not-yet';
}

/** The key lists only the marks the cards use, in the mock's order (on · AI voice · not yet). */
export function marksUsed(cards: TypeCard[]): Exclude<CellMark, 'none'>[] {
  const used = new Set(cards.flatMap((c) => [c.text.mark, c.audio.mark]));
  return (['on', 'ai', 'absent'] as const).filter((m) => used.has(m));
}
