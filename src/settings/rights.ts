// C-13 rights records → S15 rows. Everything shown is a verbatim field of the record; code never
// resolves a holder discrepancy (R-312) and never writes legal wording of its own.
import { C13, contracts, errorsText } from './contracts';

export interface RightsRecord {
  schemaVersion: 1;
  id: string;
  collection: string;
  revision: string;
  licenseInfo: string;
  adaptationNotice?: string;
  holders: string[];
  url?: string;
  metadataSha256: string;
  discrepancies?: string[];
}

export interface LicenseInfo {
  title?: string;
  holderName?: string;
  holderUrl?: string;
  licenseName?: string;
  licenseUrl?: string;
}

/** `licenseInfo` is verbatim `license_info` (JSON text from metadata.json) or a plain licence name. */
export function parseLicenseInfo(info: string): LicenseInfo {
  try {
    const j = JSON.parse(info) as {
      title?: string;
      copyright?: { holder?: { name?: string; url?: string } };
      licenses?: Record<string, { name?: string; url?: string }>[];
    };
    if (!j || typeof j !== 'object') return { licenseName: info };
    const first = j.licenses?.[0];
    const lic = first ? (first.eng ?? Object.values(first)[0]) : undefined;
    return {
      title: j.title,
      holderName: j.copyright?.holder?.name,
      holderUrl: j.copyright?.holder?.url,
      licenseName: lic?.name,
      licenseUrl: lic?.url,
    };
  } catch {
    return { licenseName: info };
  }
}

export interface RightsRow {
  id: string;
  collection: string;
  /** Holder shown on the row: the `license_info` holder when present, else holders[0] (verbatim). */
  holder: string;
  licence: string;
  holders: string[];
  /** Set only when the record lists discrepancies AND the adaptation notice names another holder. */
  bothHolders?: { holderA: string; holderB: string };
  discrepancies: string[];
  licenseInfo: string;
  adaptationNotice?: string;
  url?: string;
  licenseUrl?: string;
  revision: string;
}

/** Only http(s) links become <a href>; anything else is shown as plain text (never linked). */
export function safeHref(u: string | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const p = new URL(u).protocol;
    return p === 'http:' || p === 'https:' ? u : undefined;
  } catch {
    return undefined;
  }
}

export function toRightsRow(r: RightsRecord): RightsRow {
  const li = parseLicenseInfo(r.licenseInfo);
  const holder = li.holderName ?? r.holders[0];
  const discrepancies = r.discrepancies ?? [];
  let bothHolders: RightsRow['bothHolders'];
  if (discrepancies.length && r.adaptationNotice) {
    const other = r.holders.find((h) => h !== holder && r.adaptationNotice!.includes(h));
    if (other) bothHolders = { holderA: holder, holderB: other };
  }
  return {
    id: r.id,
    collection: r.collection,
    holder,
    licence: li.licenseName ?? r.licenseInfo,
    holders: [...r.holders],
    bothHolders,
    discrepancies,
    licenseInfo: r.licenseInfo,
    adaptationNotice: r.adaptationNotice || undefined,
    url: r.url,
    licenseUrl: li.licenseUrl,
    revision: r.revision,
  };
}

export interface RightsLoad {
  rows: RightsRow[];
  /** Records that failed C-13 are not rendered; their ids are reported, never patched. */
  rejected: { index: number; errors: string[] }[];
}

export function parseRightsRecords(data: unknown): RightsLoad {
  const list = Array.isArray(data) ? data : [];
  const rows: RightsRow[] = [];
  const rejected: RightsLoad['rejected'] = [];
  list.forEach((rec, index) => {
    const v = contracts().validate(C13, rec);
    if (v.ok) rows.push(toRightsRow(rec as RightsRecord));
    else rejected.push({ index, errors: errorsText(v.errors) });
  });
  return { rows, rejected };
}

/**
 * Adaptation notices are verbatim HTML (`<p><b>…</b> … <cite>…</cite></p>`). S15 renders them as
 * prose with bold/cite honoured; everything else is text. No innerHTML: tokens only.
 */
export type NoticeToken = { text: string; b?: boolean; cite?: boolean; br?: boolean };

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
  nbsp: ' ',
  copy: '©',
};
const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (ENTITIES[e.toLowerCase()] !== undefined) return ENTITIES[e.toLowerCase()];
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return m;
  });

export function noticeTokens(html: string): NoticeToken[] {
  const out: NoticeToken[] = [];
  let b = 0;
  let cite = 0;
  let paragraphs = 0;
  const re = /<\s*(\/)?\s*([a-z0-9]+)[^>]*>|([^<]+)/gi;
  for (const m of html.matchAll(re)) {
    if (m[3] !== undefined) {
      const text = decode(m[3]);
      if (text) out.push({ text, ...(b ? { b: true } : {}), ...(cite ? { cite: true } : {}) });
      continue;
    }
    const close = !!m[1];
    const tag = m[2].toLowerCase();
    if (tag === 'b' || tag === 'strong') b += close ? -1 : 1;
    else if (tag === 'cite' || tag === 'i' || tag === 'em') cite += close ? -1 : 1;
    else if ((tag === 'p' && !close && paragraphs++ > 0) || tag === 'br')
      out.push({ text: '', br: true });
    b = Math.max(0, b);
    cite = Math.max(0, cite);
  }
  return out;
}

export const noticePlainText = (html: string) =>
  noticeTokens(html)
    .map((t) => (t.br ? '\n' : t.text))
    .join('');

/**
 * BL8 pack rights lines (`data/packs/<id>/rights.json`, built by pipeline/src/rights.mjs from C-13):
 * one line per source with its holders and licence, verbatim. A missing holder or licence stays
 * `null` and the screen says it is not listed — nothing is filled in here.
 */
export interface PackRightsLine {
  id: string;
  collection: string;
  holders: string[] | null;
  licence: { name: string; url?: string } | null;
  url?: string | null;
}

export function parsePackRights(data: unknown): PackRightsLine[] {
  const sources = (data as { sources?: unknown } | null)?.sources;
  if (!Array.isArray(sources)) return [];
  const out: PackRightsLine[] = [];
  for (const s of sources as Record<string, unknown>[]) {
    if (!s || typeof s.id !== 'string' || typeof s.collection !== 'string') continue;
    const holders =
      Array.isArray(s.holders) && s.holders.every((h) => typeof h === 'string') && s.holders.length
        ? (s.holders as string[])
        : null;
    const lic = s.licence as { name?: unknown; url?: unknown } | null | undefined;
    const licence =
      lic && typeof lic.name === 'string' && lic.name
        ? { name: lic.name, url: typeof lic.url === 'string' ? lic.url : undefined }
        : null;
    out.push({
      id: s.id,
      collection: s.collection,
      holders,
      licence,
      url: typeof s.url === 'string' ? s.url : null,
    });
  }
  return out;
}

/** The holder and licence of one pack line, or null when either is not listed. */
export function packLineParts(
  line: PackRightsLine | undefined,
): { holder: string; licence: string } | null {
  if (!line?.holders || !line.licence) return null;
  return { holder: line.holders.join(', '), licence: line.licence.name };
}
