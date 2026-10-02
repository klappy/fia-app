// C-06 provenance → user-word marks (R-313, R-503) and the SH-1 sheet model (screen spec 20).
// Rule: AI-made content is always marked and never presented as source. When a slot's fields
// disagree (e.g. status `source` but `ai: true` or a generated provenance), the AI mark wins.
import type { Provenance } from '../components/types';

/** C-06 record (contracts/c06-provenance.schema.json). */
export interface ProvenanceRecord {
  status: 'source' | 'generated' | 'missing';
  collection?: string;
  revision?: string;
  generatedFrom?: string;
  generator?: 'translation' | 'narration' | 'description' | 'subtitle';
  audited?: boolean;
}

/** C-03 1.1.0 entry `ref`: the pericope as book + first/last chapter:verse. */
export interface PericopeRef {
  book: string;
  start: string;
  end: string;
}

/** C-03 1.1.0 `subtitle.inputs[]`: a heading span (`text`) or the grounding passage (`textSha256`). */
export interface SubtitleInput {
  /** C-13 record id, so rights resolve directly */
  source: string;
  verse: string;
  last?: string;
  kind?: 'heading' | 'passage';
  text?: string;
  textSha256?: string;
}

/** C-03 1.1.0 entry `subtitle` (AI, always marked; C-10 `subtitleMode` shows or hides it). */
export interface SubtitleRecord {
  text: string;
  lang: string;
  ai: true;
  generator: 'subtitle' | 'translation';
  basis?: 'headings' | 'passage';
  model: string;
  promptSha256: string;
  key: string;
  /** null when every input is CC0/PD */
  licence: { name: 'CC BY-SA 4.0' | 'CC BY 4.0'; url: string } | null;
  inputs: SubtitleInput[];
  /** rung 2 only */
  translatedFrom?: { lang: string; key: string; text: string };
  provenance: ProvenanceRecord;
  review?: { status: 'pass' | 'fail'; receiptSha256: string };
}

/** C-10 1.1.0 `subtitleMode`; a missing key normalizes to `off` (PoC a5). */
export type SubtitleMode = 'generated' | 'off';
export const DEFAULT_SUBTITLE_MODE: SubtitleMode = 'off';

/** C-13 1.1.0 `revisionKind`; absent = `git` (40-hex commit), `sha256` = 64-hex file digest. */
export type RevisionKind = 'git' | 'sha256';

/** A pack slot as the L1 pipeline emits it (text / audio / description / title). */
export interface Slot {
  status: string; // source | generated | absent | missing | absent-fallback
  ai?: boolean;
  generator?: string;
  fallback?: string;
  badge?: string;
  provenance?: ProvenanceRecord;
}

export type Domain = 'text' | 'audio' | 'description';

export class ScriptureAIError extends Error {
  constructor() {
    super('Scripture text is never AI-generated (epic RULING); refusing to present it.');
  }
}

/** True when the slot carries AI-generated content (filled, not just a backfill slot). */
export function isGenerated(slot: Slot | undefined): boolean {
  if (!slot) return false;
  return slot.status === 'generated' || slot.provenance?.status === 'generated';
}

/** True when the slot has content of its own (source or generated), i.e. something to show/play. */
export function hasContent(slot: Slot | undefined): boolean {
  if (!slot) return false;
  if (isGenerated(slot)) return true;
  return slot.status === 'source' && slot.provenance?.status !== 'missing';
}

/**
 * Mark for one slot. Generated text → `ai-translation`; generated audio/description → `ai-voice`;
 * source → `source`; anything else (absent, missing, unfilled AI slot, English fallback) → `absent`.
 * A `source` status with `ai: true` is treated as AI (never present AI as source).
 */
export function markFor(slot: Slot | undefined, domain: Domain): Provenance {
  if (!slot) return 'absent';
  const aiFlagOnFilled = slot.ai === true && slot.status === 'source';
  if (isGenerated(slot) || aiFlagOnFilled) return domain === 'text' ? 'ai-translation' : 'ai-voice';
  if (hasContent(slot)) return 'source';
  return 'absent';
}

/** Scripture text: source or (English) fallback only. A generated Scripture text throws. */
export function scriptureTextMark(slot: Slot): Provenance {
  if (isGenerated(slot) || slot.ai === true) throw new ScriptureAIError();
  return slot.status === 'source' ? 'source' : 'absent';
}

export type NarrationMode = 'source-fallback' | 'source-only' | 'generated-only';

export interface ClipRef {
  id: string;
  url: string;
  durationSec?: number;
  sha256?: string;
}

export interface NarrationChoice {
  clip: ClipRef | null;
  mark: Provenance;
  /** why nothing plays: the mode forbids the only clip, or no clip exists at all */
  silent?: 'source-only-silent' | 'no-audio';
}

/**
 * R-501 / R-502: pick the clip a mode allows. Source-only never loads a generated clip;
 * generated-only plays AI even where a source exists; source-fallback prefers source.
 */
export function selectNarration(
  mode: NarrationMode,
  clips: { source?: ClipRef | null; generated?: ClipRef | null },
): NarrationChoice {
  const { source, generated } = clips;
  if (mode === 'source-only') {
    if (source) return { clip: source, mark: 'source' };
    return { clip: null, mark: 'absent', silent: generated ? 'source-only-silent' : 'no-audio' };
  }
  if (mode === 'generated-only') {
    if (generated) return { clip: generated, mark: 'ai-voice' };
    return { clip: null, mark: 'absent', silent: 'no-audio' };
  }
  if (source) return { clip: source, mark: 'source' };
  if (generated) return { clip: generated, mark: 'ai-voice' };
  return { clip: null, mark: 'absent', silent: 'no-audio' };
}

// ── SH-1 sheet model (spec 20 § States) ──────────────────────────────────────────────────────

export interface SheetInput {
  domain: Domain;
  slot: Slot | undefined;
  /** the item is Scripture (text never AI; only the audio flag may be AI) */
  scripture?: boolean;
  /** an English item is shown in place of the missing one (R-305 ladder) */
  englishShown?: boolean;
  /** a source recording exists but could not be matched to this text (R-315) */
  unmatched?: boolean;
  /** the user's narration mode made this item silent */
  sourceOnlySilent?: boolean;
  /** Scripture audio reads the English edition (absent-Scripture ladder) */
  readsEnglish?: boolean;
}

export type SheetRow = 'rights' | 'report' | 'change-settings';

export interface SheetModel {
  mark: Provenance;
  titleKey: string;
  bodyKeys: string[];
  /** show the `s.prov.source` line (source · holder · licence, verbatim) */
  sourceLine: boolean;
  rows: SheetRow[];
}

export function provenanceSheet(input: SheetInput): SheetModel {
  const { domain, slot, scripture, englishShown, unmatched, sourceOnlySilent, readsEnglish } =
    input;
  if (scripture && domain === 'text') scriptureTextMark(slot ?? { status: 'absent' });
  if (sourceOnlySilent) {
    return {
      mark: 'absent',
      titleKey: 's.prov.title.absent',
      bodyKeys: ['s.prov.body.source-only-silent'],
      sourceLine: false,
      rows: ['change-settings', 'report'],
    };
  }
  const mark = markFor(slot, domain);
  const scriptureBody = scripture ? ['s.prov.body.scripture'] : [];
  if (mark === 'ai-voice') {
    const body = unmatched ? 's.prov.body.unmatched' : 's.prov.body.ai-voice';
    return {
      mark,
      titleKey: scripture ? 's.prov.title.ai-voice-scripture' : 's.prov.title.ai-voice',
      bodyKeys: [...scriptureBody, body, ...(readsEnglish ? ['s.prov.body.reads-english'] : [])],
      sourceLine: true,
      rows: scripture ? ['rights'] : ['rights', 'report'],
    };
  }
  if (mark === 'ai-translation') {
    return {
      mark,
      titleKey: 's.prov.title.ai-text',
      bodyKeys: ['s.prov.body.ai-text'],
      sourceLine: true,
      rows: ['rights', 'report'],
    };
  }
  if (mark === 'source') {
    return {
      mark,
      titleKey: 's.prov.title.source',
      bodyKeys: scripture ? scriptureBody : ['s.prov.body.source', 's.prov.body.source-speaker'],
      sourceLine: true,
      rows: scripture ? ['rights'] : ['rights', 'report'],
    };
  }
  return {
    mark: 'absent',
    titleKey: 's.prov.title.absent',
    bodyKeys: [englishShown ? 's.prov.body.absent-fallback' : 's.prov.body.absent-nothing'],
    sourceLine: !!englishShown,
    rows: ['report'],
  };
}

/** Title glyph placeholders used by the `s.prov.title.*` strings (glyph + text, never glyph alone). */
export const TITLE_GLYPHS = { src: '🎙', ai: '✦', absent: '◌' } as const;

/** Backend names that must never reach a play control or sheet (R-313). */
export const FORBIDDEN_UI_NAMES = [/aquifer/i];

export function assertNoBackendName(label: string): string {
  for (const re of FORBIDDEN_UI_NAMES)
    if (re.test(label)) throw new Error(`backend name in UI label: ${label}`);
  return label;
}
