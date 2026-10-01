import type { SheetInput, SheetModel } from './provenance';

/** `s.coverage.type.*` words — the `{type}` in the absent bodies of SH-1. */
export type CoverageType = 'guide' | 'images' | 'maps' | 'scripture' | 'terms' | 'videos';

/** Rights record for the `s.prov.source` line (spec 20; R-312: licence verbatim). */
export interface SheetRights {
  source: string;
  holder: string;
  licence: string;
}

// Route state carried to SH-1 (/sheet/provenance): the caller's slot travels with the item,
// so the sheet is identical online, offline and while loading (spec 20 § States).
export interface ProvenanceSheetState extends SheetInput {
  language?: string;
  /** Scripture edition short name for `s.prov.body.scripture` */
  edition?: string;
  /** `{type}` for the absent bodies; defaults per domain so the sentence never has a hole */
  typeKey?: CoverageType;
  /** holder and licence from the rights record; the source line shows only when all are known */
  rights?: SheetRights;
}

export const PROVENANCE_SHEET_PATH = '/sheet/provenance';

/** The `s.coverage.type.*` key for `{type}`: the caller's type, else a default per domain. */
export function sheetTypeKey(s: ProvenanceSheetState): string {
  const type =
    s.typeKey ?? (s.scripture ? 'scripture' : s.domain === 'description' ? 'images' : 'guide');
  return `s.coverage.type.${type}`;
}

/**
 * Values for `s.prov.source`, or null when the sheet has no source line or the rights record is
 * incomplete (never a line with holes; L1 packs do not carry holder/licence yet).
 */
export function sourceLineValues(model: SheetModel, s: ProvenanceSheetState): SheetRights | null {
  const r = s.rights;
  if (!model.sourceLine || !r || !r.source || !r.holder || !r.licence) return null;
  return r;
}

/**
 * Split the translated `s.prov.source` template into parts; rights values are flagged `ltr` so
 * the screen wraps them in `dir="ltr"` spans (licence text verbatim, R-312) inside RTL UI.
 */
export function sourceLineParts(
  template: string,
  r: SheetRights,
): { text: string; ltr: boolean }[] {
  return template
    .split(/\{(source|holder|licence)\}/)
    .map((p, i) =>
      i % 2 ? { text: r[p as keyof SheetRights], ltr: true } : { text: p, ltr: false },
    )
    .filter((p) => p.text !== '');
}
