import type { SheetInput } from './provenance';

// Route state carried to SH-1 (/sheet/provenance): the caller's slot travels with the item,
// so the sheet is identical online, offline and while loading (spec 20 § States).
export interface ProvenanceSheetState extends SheetInput {
  language?: string;
  /** Scripture edition short name for `s.prov.body.scripture` */
  edition?: string;
  /** `{type}` for the absent bodies (a `s.coverage.type.*` word) */
  typeWord?: string;
}

export const PROVENANCE_SHEET_PATH = '/sheet/provenance';
