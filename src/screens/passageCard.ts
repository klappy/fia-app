// F6-S04 Passage card: pure queries the glass card draws (nodded mock design/alpha-v2-screens/
// 04-passage-card.html). Nothing here invents data: a row, a count or the voice chip appears only when
// the pack (C-02 manifest.json counts, scripture.json editions), the C-03 catalog entry or the guide
// (C-04 stops) carries it.
import type { Provenance } from '../components/types';
import { position } from '../flow/model';
import type { CatalogEntry, FlowGuide } from '../flow/types';
import { t } from '../i18n';
import type { FlowState } from '../flow/machine';
import type { NarrationChoice } from '../media/provenance';
import { STANDINS } from '../media/standin';

/** What the pack's own files add to the catalog entry (fetched beside the card). */
export interface PackFacts {
  /** C-02 manifest.json `counts` (terms, termAudio, images, maps, videos, scripture …). */
  counts: Record<string, number>;
  /** scripture.json `editions[].short`, in pack order (BSB, ULT, UST, …). */
  editions: string[];
}

export const EMPTY_FACTS: PackFacts = { counts: {}, editions: [] };

/** Bead kinds the legend draws: the kit's StageRail kinds (progress/StageRail.jsx BEAD_KINDS). */
export type LegendKind = 'plain' | 'scripture' | 'term' | 'media' | 'video' | 'stop';

export interface LegendRow {
  kind: LegendKind;
  word: string;
  count: string;
}

const NB = ' ';
/** "Mark 1:1–13" never breaks at the dash (mock TITLE). */
export const keepRef = (title: string) => title.replace(/–/g, '⁠–⁠');
const num = (n: number) => n.toLocaleString('en-US');

/** C-04 discussion stops: the guide's "Talk together" (the terminal stop is the guide's end, not a talk). */
export const talkStops = (g: FlowGuide) => g.stops.filter((s) => s.kind === 'discussion').length;

/** Scripture editions the pack carries: scripture.json when read, else manifest `counts.scripture`. */
const editionCount = (f: PackFacts) => f.editions.length || f.counts.scripture || 0;

/**
 * The "Includes" card (mock KINDS): one row per kind the pack carries, with the bead the guide's
 * progress dots use for it. Kinds the pack does not carry are left out, never shown as zero.
 */
export function legendRows(
  g: FlowGuide,
  entry: CatalogEntry | undefined,
  f: PackFacts,
): LegendRow[] {
  const has = (k: string) => !entry || entry.resourceTypes.includes(k);
  const c = f.counts;
  const parts = g.steps.reduce((n, s) => n + s.units.length, 0);
  const rows: LegendRow[] = [
    {
      kind: 'plain',
      word: t('s.passage.kind.guide'),
      count: t('s.passage.kind.guide-count', { n: num(parts), steps: g.steps.length }),
    },
  ];
  const eds = editionCount(f);
  if (has('scripture') && eds > 0)
    rows.push({
      kind: 'scripture',
      word: t('s.passage.inc.scripture'),
      count: t('s.passage.kind.scripture-count', { n: eds }),
    });
  const terms = c.terms ?? 0;
  if (has('term') && terms > 0) {
    const audio = c.termAudio ?? 0;
    rows.push({
      kind: 'term',
      word: t('s.passage.inc.terms'),
      count:
        audio === 0
          ? num(terms)
          : audio >= terms
            ? t('s.passage.kind.terms-all-audio', { n: num(terms) })
            : t('s.passage.kind.terms-some-audio', { n: num(terms), k: num(audio) }),
    });
  }
  const images = has('image') ? (c.images ?? 0) : 0;
  const maps = has('map') ? (c.maps ?? 0) : 0;
  if (images + maps > 0)
    rows.push({
      kind: 'media',
      word: t('s.passage.kind.media'),
      count: [
        images > 0 && t('s.passage.kind.images-count', { n: num(images) }),
        maps > 0 && t('s.passage.kind.maps-count', { n: num(maps) }),
      ]
        .filter(Boolean)
        .join(`${NB}· `),
    });
  const videos = has('video') ? (c.videos ?? 0) : 0;
  if (videos > 0)
    rows.push({ kind: 'video', word: t('s.passage.kind.videos'), count: num(videos) });
  const talks = talkStops(g);
  if (talks > 0)
    rows.push({
      kind: 'stop',
      word: t('s.passage.kind.talk'),
      count: t('s.passage.kind.talk-count', { n: talks }),
    });
  return rows;
}

/**
 * The voice line on S02, S04 and S05 (PoC floor a1: a passage shows whether it has a voice before you
 * choose it; C-06: AI narration is always marked). "AI voice" when the C-03 catalog says guide narration
 * was generated (`provenance.audio.generated`; key-term recordings are `source`, not the guide's voice),
 * or when the guide plays the stand-in's AI-voiced PoC clips for the passage (media/standin; RULING
 * 2026-10-02 ~17:22 ET). Only a passage with no clips at all reads "Text · voice not yet".
 */
export function voiceOf(entry: CatalogEntry | undefined): 'ai' | 'none' {
  const p = entry?.provenance as { audio?: { generated?: unknown } } | null | undefined;
  const n = p?.audio?.generated;
  if (typeof n === 'number' && n > 0) return 'ai';
  return entry && (STANDINS[entry.packId]?.manifest.entries.length ?? 0) > 0 ? 'ai' : 'none';
}

/**
 * S05's voice chip, in step with S02 and S04 (`voiceOf`) and with sheet 20 (the clip that plays). A
 * part whose clip plays names it: a recording, or "AI voice" (C-06: AI narration is always marked). A
 * part the narration setting keeps silent says so. A part with no clip reads "Text · voice not yet" when
 * the passage has no clips at all (`voiceOf` none, as the card says), else "No voice for this part".
 */
export function guideVoice(
  entry: CatalogEntry | undefined,
  choice: NarrationChoice | undefined,
): { mark: Provenance; words: string } {
  if (choice?.clip)
    return choice.mark === 'source'
      ? { mark: 'source', words: t('s.common.mark.source') }
      : { mark: choice.mark, words: t('s.common.mark.ai-voice') };
  if (choice?.silent === 'source-only-silent')
    return { mark: 'absent', words: t('s.guide.voice-silent') };
  if (entry && voiceOf(entry) === 'none')
    return { mark: 'absent', words: t('s.guide.voice-not-yet') };
  return { mark: 'absent', words: t('s.guide.voice-none') };
}

/** "English · 6 steps · 130 parts" (mock s04-sub); the language leads once the catalog names it. */
export function subLine(language: string, g: FlowGuide): string {
  const counts = t('s.passage.sub', {
    steps: g.steps.length,
    parts: g.steps.reduce((n, s) => n + s.units.length, 0),
  });
  return language ? `${language}${NB}· ${counts}` : counts;
}

/** "Guide: FIA Translation Guide · Scripture: BSB, ULT, UST · Rights: Explore › About" (mock s04-rights). */
export function rightsLine(f: PackFacts): string {
  return [
    t('s.passage.rights.guide', { name: t('s.about.source.guide') }),
    f.editions.length > 0 && t('s.passage.rights.scripture', { list: f.editions.join(', ') }),
    t('s.passage.rights.where'),
  ]
    .filter(Boolean)
    .join(`${NB}· `);
}

/**
 * The one primary and the line above it. Fresh: "Start Mark 1:1–13" over "Starts at Step 1 · Hear and
 * Heart" (mock). Started and finished are not mocked: they reuse the mock's words (S02's "Continue
 * {ref}", the guide band's "Step n of 6 · part n of m in this step"), named in the PR (dl-fgate-05).
 */
export function startCopy(g: FlowGuide, s: FlowState): { primary: string; hint: string } {
  const ref = keepRef(g.title);
  const started = s.visited.length > 1 || s.played.length > 0;
  if (s.finished)
    return {
      primary: t('s.passage.primary-again-ref', { ref }),
      hint: t('s.passage.start-at', { stage: g.steps[0]?.title ?? '' }),
    };
  if (started) {
    const p = position(g, s.unitId);
    return {
      primary: t('s.passage.primary-continue-ref', { ref }),
      hint: t('s.passage.resume-at', {
        n: p.stageIndex + 1,
        total: g.steps.length,
        part: p.unitIndex + 1,
        m: p.unitCount,
      }),
    };
  }
  return {
    primary: t('s.passage.primary-start-ref', { ref }),
    hint: t('s.passage.start-at', { stage: g.steps[0]?.title ?? '' }),
  };
}
