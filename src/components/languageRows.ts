// F6-S01: the S01 picker's rows, read from data (R-301, R-304; BUILD-ORDER BL2). Each language's
// autonym, English name and direction come from the C-03 catalog (`languages[]`); its coverage chips
// come from the same per-type statuses S19 shows (settings/coverage.ts `coverageFor`), in the nodded
// mock's words and order: Scripture · Guide · Key terms · Maps (cookbook
// design/alpha-v2-screens/01-first-run-language.html, `TYPES`; states from data/catalog/COVERAGE.md).
import { t } from '../i18n';
import { LANGUAGES } from '../i18n/languages';
import {
  coverageFor,
  type CatalogManifest,
  type CoverageKey,
  type CoverageStatus,
  type LanguageCounts,
} from '../settings';

/** The row's chips in the mock's order. Keys are S19's (`s.coverage.type.*`). */
export const CHIP_KEYS = [
  'scripture',
  'guide',
  'terms',
  'maps',
] as const satisfies readonly CoverageKey[];
export type ChipKey = (typeof CHIP_KEYS)[number];

/** The kit picker's three chip states (LanguagePicker.d.ts `coverage`): available · AI-filled · none. */
export type ChipState = 'a' | 'i' | 'n';

/**
 * One chip from an S19 coverage status (COVERAGE.md): localized items → available; the type is carried
 * but nothing is in this language → an AI-filled slot for key-term text, none for Scripture (never AI,
 * R-305) and maps (English maps, badged); absent → none. `listed` (the per-language counts could not be
 * read) only tells Scripture and Guide; for key terms and maps it returns null and the chip is not drawn.
 */
export function chipState(key: ChipKey, status: CoverageStatus): ChipState | null {
  if (status === 'available') return 'a';
  if (status === 'absent') return 'n';
  if (status === 'english-only') return key === 'terms' ? 'i' : 'n';
  return key === 'scripture' || key === 'guide' ? 'a' : null;
}

export interface PickerLanguage {
  /** Aquifer code (C-03), also the row's `lang` like the rest of the app (guide.language). */
  code: string;
  autonym: string;
  english: string;
  dir: 'ltr' | 'rtl';
  /** Chip states in CHIP_KEYS order, cut at the first one the data cannot tell. */
  chips: ChipState[];
}

const STATE_KEY: Record<ChipState, string> = {
  a: 's.lang.cov.available',
  i: 's.lang.cov.ai',
  n: 's.lang.cov.absent',
};

/** What a screen reader hears for a row: autonym, English name, then each chip and its state (the kit
 *  draws the state only by edge and fill). */
export function rowName(l: PickerLanguage): string {
  const summary = l.chips
    .map((s, i) => `${t(`s.coverage.type.${CHIP_KEYS[i]}`)} ${t(STATE_KEY[s])}`)
    .join(', ');
  return t('s.lang.a11y.row-chips', { language: l.autonym, englishName: l.english, summary });
}

/** Rows in catalog order (never hard-coded); `counts` per code, null/absent when unread. */
export function pickerLanguages(
  m: CatalogManifest,
  counts: Readonly<Record<string, LanguageCounts | null | undefined>> = {},
): PickerLanguage[] {
  return m.languages.map((l) => {
    const cov = coverageFor(m, l.code, counts[l.code] ?? undefined);
    const chips: ChipState[] = [];
    for (const key of CHIP_KEYS) {
      const row = cov.rows.find((r) => r.key === key);
      const s = row ? chipState(key, row.status) : null;
      if (s === null) break;
      chips.push(s);
    }
    return { code: l.code, autonym: l.autonym, english: l.name, dir: l.direction, chips };
  });
}

/** The phone's own language, when the catalog has it (navigator.languages → Aquifer code). */
export function deviceLanguage(
  codes: readonly string[],
  tags: readonly string[] = globalThis.navigator?.languages ?? [],
): string | undefined {
  for (const raw of tags) {
    const tag = raw.toLowerCase();
    const want = tag.startsWith('zh')
      ? /hant|-tw|-hk|-mo/.test(tag)
        ? 'zh-hant'
        : 'zh-hans'
      : tag;
    const hit = LANGUAGES.find((l) => {
      const b = l.bcp47.toLowerCase();
      return codes.includes(l.code) && (b === want || b === want.split('-')[0]);
    });
    if (hit) return hit.code;
  }
  return undefined;
}

/** Gateway languages the mock pins after the recent and the phone's own (01-first-run-language.html `suggested`). */
export const GATEWAY = ['eng', 'fra', 'hin'] as const;

/** The kit's Suggested group, in its own order: recent, the phone's language, gateway; three at most. */
export function suggestedLanguages(
  codes: readonly string[],
  recent: string | undefined,
  device: string | undefined,
): string[] {
  const out: string[] = [];
  for (const c of [recent, device, ...GATEWAY])
    if (c && codes.includes(c) && !out.includes(c)) out.push(c);
  return out.slice(0, 3);
}

const COUNTS = /"counts"\s*:\s*(\{[^{}]*\})/;
const NUMERIC: (keyof LanguageCounts)[] = ['pericopes', 'scriptureEditions', 'terms', 'maps'];

/**
 * The per-language counts S19 reads (`data/catalog/<code>.json` `.counts`), without the file: each file
 * is 0.06–4.7 MB because it lists every entry, while `counts` sits in its first few hundred bytes. The
 * stream is read only until that object closes, then cancelled. Null when it cannot be read.
 */
export async function readCounts(
  url: string,
  {
    fetchImpl = fetch,
    signal,
    limit = 64 * 1024,
  }: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    limit?: number;
  } = {},
): Promise<LanguageCounts | null> {
  try {
    const res = await fetchImpl(url, { signal });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let text = '';
    try {
      while (text.length < limit) {
        const { done, value } = await reader.read();
        if (value) text += dec.decode(value, { stream: !done });
        const m = COUNTS.exec(text);
        if (m) {
          const c = JSON.parse(m[1]) as Partial<LanguageCounts>;
          return NUMERIC.every((k) => typeof c[k] === 'number') ? (c as LanguageCounts) : null;
        }
        if (done) break;
      }
      return null;
    } finally {
      reader.cancel().catch(() => undefined);
    }
  } catch {
    return null;
  }
}
