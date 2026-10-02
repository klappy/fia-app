// Thin loader over the L1 catalog shape (C-03 manifest) and pack guides (guide.json + C-04
// guide-units.json). Every document is validated before use; nothing is invented when data is
// missing — callers get an error status and render the spec's error state.
import { C03, C04, errorText, flowValidator } from './contracts';
import type {
  CatalogEntry,
  CatalogManifest,
  FlowGuide,
  GuideStep,
  GuideStop,
  UnitKind,
} from './types';
import { CONTENT_BASE } from '../media/usePack';

export type FetchJson = (url: string) => Promise<unknown>;

export const defaultFetchJson: FetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

export class ContractError extends Error {}

interface RawGuide {
  packId: string;
  title?: string;
  passage?: string;
  provenance?: { status?: string };
  steps: {
    id: string;
    title: string;
    units: {
      id: string;
      kind: UnitKind;
      text: string;
      textSha256: string;
      resources?: string[];
    }[];
  }[];
}

interface RawUnits {
  packId: string;
  steps: { id: string; title: string; units: { id: string; hidden?: boolean }[] }[];
  stops: GuideStop[];
}

/**
 * `base` holds the catalog (`<base>/catalog/manifest.json`). Pack files are read at their C-02
 * paths, `<contentBase>/packs/<id>/<file>` — the URLs a Save stores and the worker serves offline
 * (C-07), and the ones the media screens read (`packUrl`). One path per pack file.
 */
export function createCatalog(
  base: string,
  fetchJson: FetchJson = defaultFetchJson,
  contentBase: string = CONTENT_BASE,
) {
  const data = base.replace(/\/$/, '');
  const root = contentBase.replace(/\/$/, '');
  return {
    async manifest(): Promise<CatalogManifest> {
      const doc = await fetchJson(`${data}/catalog/manifest.json`);
      const r = flowValidator().validate(C03, doc);
      if (!r.ok) throw new ContractError(`catalog manifest (C-03): ${errorText(r.errors)}`);
      return doc as CatalogManifest;
    },
    async guide(packId: string): Promise<FlowGuide> {
      const [g, u] = await Promise.all([
        fetchJson(`${root}/packs/${packId}/guide.json`),
        fetchJson(`${root}/packs/${packId}/guide-units.json`),
      ]);
      const r = flowValidator().validate(C04, u);
      if (!r.ok) throw new ContractError(`guide units (C-04): ${errorText(r.errors)}`);
      return joinGuide(g as RawGuide, u as RawUnits);
    },
  };
}

export type Catalog = ReturnType<typeof createCatalog>;

/** Join unit text (guide.json) onto the C-04 unit index; ids must agree one-to-one. */
export function joinGuide(g: RawGuide, u: RawUnits): FlowGuide {
  if (g.packId !== u.packId) throw new ContractError(`pack mismatch ${g.packId} ≠ ${u.packId}`);
  const text = new Map(g.steps.flatMap((s) => s.units.map((x) => [x.id, x] as const)));
  const steps: GuideStep[] = u.steps.map((s) => ({
    id: s.id,
    title: s.title,
    units: s.units.map((x) => {
      const t = text.get(x.id);
      if (!t) throw new ContractError(`unit ${x.id} has no text in guide.json`);
      return {
        id: x.id,
        stepId: s.id,
        kind: t.kind,
        text: t.text,
        textSha256: t.textSha256,
        hidden: x.hidden === true,
        resources: t.resources ?? [],
      };
    }),
  }));
  return {
    packId: u.packId,
    language: u.packId.split('.')[0],
    title: g.title ?? u.packId,
    passage: g.passage ?? '',
    provenance: g.provenance?.status ?? 'source',
    steps,
    stops: u.stops,
  };
}

// ---- catalog queries (S02 library, S03 pericope list) ----

export interface BookRow {
  book: string;
  /** Book name as the source titles it ("1 Chronicles 1:1–7" → "1 Chronicles"). */
  name: string;
  count: number;
}

export const bookName = (title: string): string =>
  title.replace(/\s+\d+[:.]\d+.*$/u, '').trim() || title;

export function entriesFor(m: CatalogManifest, language: string): CatalogEntry[] {
  return m.entries.filter((e) => e.language === language && e.resourceTypes.includes('guide'));
}

/** USFM book ids in canonical (Protestant) order; unknown ids sort after, in manifest order. */
const CANON = (
  'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA ' +
  'JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO ' +
  '2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'
).split(' ');
const canonIndex = (book: string) => {
  const i = CANON.indexOf(book.toUpperCase());
  return i < 0 ? CANON.length : i;
};

/** Books of one language in canonical order (spec 02). */
export function booksFor(m: CatalogManifest, language: string): BookRow[] {
  const rows = new Map<string, BookRow>();
  for (const e of entriesFor(m, language)) {
    const r = rows.get(e.book);
    if (r) r.count += 1;
    else rows.set(e.book, { book: e.book, name: bookName(e.title), count: 1 });
  }
  return [...rows.values()].sort((a, b) => canonIndex(a.book) - canonIndex(b.book));
}

/** Pericopes of one book in canonical order (chapter, then verse). */
export function pericopesFor(m: CatalogManifest, language: string, book: string): CatalogEntry[] {
  const key = (p: string) => p.split('-').slice(1).map(Number);
  return entriesFor(m, language)
    .filter((e) => e.book === book)
    .sort((a, b) => {
      const [ka, kb] = [key(a.pericope), key(b.pericope)];
      for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
        const d = (ka[i] ?? 0) - (kb[i] ?? 0);
        if (d) return d;
      }
      return 0;
    });
}

export function matches(query: string, ...fields: string[]): boolean {
  const q = query.trim().toLowerCase();
  return !q || fields.some((f) => f.toLowerCase().includes(q));
}
