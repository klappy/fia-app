// L3 guided-flow data shapes. Catalog = contract C-03 (contracts/c03-catalog-manifest.schema.json);
// guide = L1 pack `guide.json` text joined with C-04 `guide-units.json` (ids, hidden flags, stops).

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
  resourceTypes: string[];
  tierBytes: { text: number; phone?: number; medium?: number; original?: number };
  sourceRevision: string;
  provenance: unknown;
  manifestSha256: string;
}

export interface CatalogManifest {
  schemaVersion: 1;
  builtAt: string;
  appVersion: string;
  languages: CatalogLanguage[];
  entries: CatalogEntry[];
}

export type UnitKind = 'paragraph' | 'list-item' | 'heading' | 'example';

export interface GuideUnit {
  id: string;
  stepId: string;
  kind: UnitKind;
  text: string;
  textSha256: string;
  /** C-04 hidden region: reachable behind the unit's info control (R-413), never deleted. */
  hidden: boolean;
  resources: string[];
}

export interface GuideStep {
  id: string;
  title: string;
  units: GuideUnit[];
}

export interface GuideStop {
  id: string;
  afterUnitId: string;
  kind: 'discussion' | 'activity' | 'terminal';
}

export interface FlowGuide {
  packId: string;
  language: string;
  title: string;
  passage: string;
  /** C-06 status of the guide text (`source` or backfilled). */
  provenance: string;
  steps: GuideStep[];
  stops: GuideStop[];
}
