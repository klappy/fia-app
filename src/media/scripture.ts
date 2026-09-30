// Scripture pack (L1 `scripture.json`, C-02) → reader model for S08: editions with the R-305
// ladder (the language's own editions, else English marked absent), verse numbering and text.
// Scripture text is never AI (epic RULING): a generated edition is refused, not shown.
import type { Provenance } from '../components/types';
import { scriptureTextMark, type Slot } from './provenance';

export interface PackVerse {
  ref: string; // BBBCCCVVV
  usfm: string;
  html: string;
  text: string;
}

export interface PackEdition extends Slot {
  repo: string;
  short: string;
  language: string;
  verses: PackVerse[];
  longName?: string;
  /** C-05 binding: narration clips must carry this as `sourceSha256` */
  textSha256?: string;
}

export interface ScripturePack {
  schemaVersion: 1;
  packId: string;
  passage: string;
  scriptureNeverAI: true;
  editions: PackEdition[];
}

export interface ReaderEdition {
  short: string;
  repo: string;
  language: string;
  mark: Provenance;
  /** true when this edition stands in for a language with no Scripture (English, badged) */
  fallback: boolean;
  verses: { n: number; ref: string; sourceId: string; text: string }[];
}

/** `41001009` → 9 */
export const verseNumber = (ref: string) => Number(ref.slice(-3));

const BOOKS: Record<string, string> = {
  '01': 'GEN',
  '40': 'MAT',
  '41': 'MRK',
  '42': 'LUK',
  '43': 'JHN',
};

/** `41001009` → `MRK-1-9` (C-12 `sourceId` shape); unknown books keep the number. */
export function sourceIdOf(ref: string): string {
  const b = ref.slice(0, ref.length - 6).padStart(2, '0');
  return `${BOOKS[b] ?? b}-${Number(ref.slice(-6, -3))}-${verseNumber(ref)}`;
}

/** Drop the leading verse number the pipeline keeps in `text` ("9 In those days…"). */
export function verseBody(text: string, n: number): string {
  const lead = `${n} `;
  return text.startsWith(lead) ? text.slice(lead.length) : text;
}

/** Reader editions in pack order; generated (AI) Scripture editions are refused (never shown). */
export function readerEditions(pack: ScripturePack): ReaderEdition[] {
  const out: ReaderEdition[] = [];
  for (const e of pack.editions) {
    let mark: Provenance;
    try {
      mark = scriptureTextMark(e);
    } catch {
      continue; // never AI Scripture
    }
    out.push({
      short: e.short,
      repo: e.repo,
      language: e.language,
      mark,
      fallback: e.status !== 'source',
      verses: e.verses.map((v) => {
        const n = verseNumber(v.ref);
        return { n, ref: v.ref, sourceId: sourceIdOf(v.ref), text: verseBody(v.text, n) };
      }),
    });
  }
  // the language's own editions first, then fallbacks (R-305 ladder)
  return [...out.filter((e) => !e.fallback), ...out.filter((e) => e.fallback)];
}

/** Segments shown inline (three) and behind `▾ more`. */
export function splitEditions<T>(editions: T[], inline = 3): { inline: T[]; more: T[] } {
  return { inline: editions.slice(0, inline), more: editions.slice(inline) };
}

/** On edition switch keep the same verse in view: its index in the new edition, else 0. */
export function sameVerseIndex(to: ReaderEdition, ref: string | null): number {
  if (!ref) return 0;
  const i = to.verses.findIndex((v) => v.ref === ref);
  return i < 0 ? 0 : i;
}
