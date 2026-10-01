// R-314 / S19: per-language coverage read from the C-03 catalog manifest. Nothing is invented:
// a type with no entries is `absent` (badged "not yet in {language}"); counts are sums of the
// manifest's own provenance records. Scripture text is never AI (R-305).
import { C03, contracts, errorsText } from './contracts';

export type CatalogResourceType =
  'guide' | 'scripture' | 'term' | 'image' | 'map' | 'video' | 'audio' | 'description';

export interface ProvenanceCount {
  source: number;
  generated: number;
  missing: number;
}
export interface ProvenanceCounts {
  text: ProvenanceCount;
  audio: ProvenanceCount;
  description: ProvenanceCount;
}

export interface CatalogLanguage {
  code: string;
  autonym: string;
  name: string;
  direction: 'ltr' | 'rtl';
  script?: string;
}

export interface CatalogEntry {
  packId: string;
  language: string;
  pericope: string;
  book: string;
  title: string;
  resourceTypes: CatalogResourceType[];
  tierBytes: Record<string, number>;
  sourceRevision: string;
  provenance: ProvenanceCounts;
  manifestSha256: string;
}

export interface CatalogManifest {
  schemaVersion: 1;
  builtAt: string;
  appVersion: string;
  languages: CatalogLanguage[];
  entries: CatalogEntry[];
}

/** The six S19 rows, in spec order, keyed to C-03 resourceTypes. */
export const COVERAGE_TYPES = [
  { key: 'guide', type: 'guide' },
  { key: 'scripture', type: 'scripture' },
  { key: 'terms', type: 'term' },
  { key: 'images', type: 'image' },
  { key: 'maps', type: 'map' },
  { key: 'videos', type: 'video' },
] as const satisfies readonly { key: string; type: CatalogResourceType }[];

export type CoverageKey = (typeof COVERAGE_TYPES)[number]['key'];
/**
 * available    — localized items exist (count from the per-language catalog counts)
 * english-only — passages carry the type but nothing is localized: the English item is shown badged
 * listed       — passages carry the type; localized count not loaded, so no number is claimed
 * absent       — no passage in this language carries the type: "not yet in {language}"
 */
export type CoverageStatus = 'available' | 'english-only' | 'listed' | 'absent';

export interface CoverageRow {
  key: CoverageKey;
  /** Passages (C-03 entries) in this language that carry the type. */
  passages: number;
  status: CoverageStatus;
  /** Localized count (only when status = available). */
  count?: number;
  /** Source recordings for this type, when the catalog reports them (key-term audio). */
  sourceAudio?: number;
}

/**
 * Per-language counts emitted beside C-03 by the L1 pipeline (`data/catalog/<lang>.json` `counts`).
 * Optional: without it, coverage falls back to C-03 presence only and claims no numbers.
 */
export interface LanguageCounts {
  pericopes: number;
  scriptureEditions: number;
  terms: number;
  termAudio?: number;
  images: number;
  maps: number;
  videos: number;
}

const COUNT_FOR: Record<CoverageKey, keyof LanguageCounts> = {
  guide: 'pericopes',
  scripture: 'scriptureEditions',
  terms: 'terms',
  images: 'images',
  maps: 'maps',
  videos: 'videos',
};

export interface LanguageCoverage {
  language: CatalogLanguage | undefined;
  code: string;
  passages: number;
  rows: CoverageRow[];
  /** Summed C-03 provenance over this language's entries (source / generated / missing). */
  provenance: ProvenanceCounts;
  hasAudio: boolean;
  hasDescription: boolean;
  builtAt: string;
  /** Distinct `sourceRevision` values across the language's entries. */
  revisions: number;
}

const zero = (): ProvenanceCount => ({ source: 0, generated: 0, missing: 0 });

export function validateCatalog(data: unknown): { ok: boolean; errors: string[] } {
  const r = contracts().validate(C03, data);
  return { ok: r.ok, errors: errorsText(r.errors) };
}

export function coverageFor(
  manifest: CatalogManifest,
  code: string,
  counts?: LanguageCounts,
): LanguageCoverage {
  const seen = new Set<string>();
  const entries = manifest.entries.filter(
    (e) => e.language === code && !seen.has(e.packId) && !!seen.add(e.packId),
  );
  const provenance: ProvenanceCounts = { text: zero(), audio: zero(), description: zero() };
  const revisions = new Set<string>();
  const perType = new Map<CatalogResourceType, number>();
  for (const e of entries) {
    revisions.add(e.sourceRevision);
    for (const t of new Set(e.resourceTypes)) perType.set(t, (perType.get(t) ?? 0) + 1);
    for (const k of ['text', 'audio', 'description'] as const)
      for (const f of ['source', 'generated', 'missing'] as const)
        provenance[k][f] += e.provenance[k][f];
  }
  const rows = COVERAGE_TYPES.map(({ key, type }): CoverageRow => {
    const passages = perType.get(type) ?? 0;
    const row: CoverageRow = { key, passages, status: 'absent' };
    if (passages === 0) return row;
    if (!counts) return { ...row, status: 'listed' as const };
    const n = counts[COUNT_FOR[key]] ?? 0;
    if (n > 0) row.status = 'available';
    else row.status = 'english-only';
    if (n > 0) row.count = n;
    if (key === 'terms' && counts.termAudio) row.sourceAudio = counts.termAudio;
    return row;
  });
  return {
    language: manifest.languages.find((l) => l.code === code),
    code,
    passages: entries.length,
    rows,
    provenance,
    hasAudio: (perType.get('audio') ?? 0) > 0,
    hasDescription: (perType.get('description') ?? 0) > 0,
    builtAt: manifest.builtAt,
    revisions: revisions.size,
  };
}

/** Languages in manifest order — read from data, never hard-coded (R-301, R-304). */
export const catalogLanguages = (m: CatalogManifest) => m.languages;
