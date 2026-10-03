// C-07 offline pack manifest: derivation from a C-02 content pack, canonical revision, and the
// safety checks the service worker applies before it stores anything. Pure; runs in the page,
// the service worker and vitest alike (Web Crypto only).

export type Tier = 'text' | 'phone' | 'medium' | 'original';
export type NarrationMode = 'source-fallback' | 'source-only' | 'generated-only';
export type SaveState = 'none' | 'partial' | 'saved' | 'update-available' | 'corrupt' | 'removing';

export const TIERS: readonly Tier[] = ['text', 'phone', 'medium', 'original'];
export const NARRATION_MODES: readonly NarrationMode[] = [
  'source-fallback',
  'source-only',
  'generated-only',
];
export const PACK_ID = /^[a-z]{3}(-[A-Za-z]{2,8})?\.[1-3A-Z]{3}(-\d{1,3}){2,4}$/;
const HEX64 = /^[a-f0-9]{64}$/;

export interface OfflineEntry {
  path: string;
  bytes: number;
  sha256: string;
  mime: string;
  group: 'shell' | 'pack';
  fetchUrl?: string;
  derivative?: Record<string, unknown>;
}

export interface OfflineManifest {
  schemaVersion: 1;
  packId: string;
  tier: Tier;
  narration: NarrationMode;
  appVersion?: string;
  revision: string;
  entries: OfflineEntry[];
}

/** C-02 subset this lane reads (`tiers.<tier>.files[]`). */
export interface ContentPackFile {
  path: string;
  bytes: number;
  sha256: string;
  mime: string;
}
export interface ContentPack {
  packId: string;
  tiers: Partial<Record<Tier, { bytes: number; files: ContentPackFile[] }>>;
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const buf =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  const digest = await crypto.subtle.digest('SHA-256', buf as BufferSource);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Canonical JSON: object keys sorted, no whitespace; arrays keep their order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** C-07: `revision` = sha256 over the canonical JSON of `entries`; changes iff entries change. */
export const revisionOf = (entries: OfflineEntry[]) => sha256Hex(canonicalJson(entries));

/**
 * Tiers are cumulative (text ⊂ phone ⊂ medium ⊂ original, C-02 "text tier is mandatory"): a
 * Phone save carries the text files plus the Phone files. A tier the pack does not publish
 * contributes nothing (the pipeline has only built `text` so far — Bide).
 */
export function tierFiles(pack: ContentPack, tier: Tier): ContentPackFile[] {
  const seen = new Set<string>();
  const out: ContentPackFile[] = [];
  for (const t of TIERS.slice(0, TIERS.indexOf(tier) + 1)) {
    for (const f of pack.tiers[t]?.files ?? []) {
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      out.push(f);
    }
  }
  return out;
}

/** Tiers this pack publishes (`tiers.<tier>` present), in order. */
export const publishedTiers = (pack: Pick<ContentPack, 'tiers'>): Tier[] =>
  TIERS.filter((t) => !!pack.tiers[t]);

/**
 * The tier a save of `tier` actually holds: the highest published tier at or below it (tiers are
 * cumulative). A Phone request on a text-only pack saves — and is stamped — Text (R-309 honesty).
 */
export function effectiveTier(pack: Pick<ContentPack, 'tiers'>, tier: Tier): Tier {
  const upTo = TIERS.slice(0, TIERS.indexOf(tier) + 1).filter((t) => !!pack.tiers[t]);
  return upTo[upTo.length - 1] ?? tier;
}

/** Bytes a save of `tier` downloads: the cumulative, de-duplicated tier files (R-307). */
export const tierDownloadBytes = (pack: ContentPack, tier: Tier): number =>
  tierFiles(pack, tier).reduce((n, f) => n + f.bytes, 0);

export async function offlineManifestFromPack(
  pack: ContentPack,
  tier: Tier,
  narration: NarrationMode,
  opts: { appVersion?: string; contentBase?: string } = {},
): Promise<OfflineManifest> {
  const entries: OfflineEntry[] = tierFiles(pack, tier)
    .map((f) => ({
      path: f.path,
      bytes: f.bytes,
      sha256: f.sha256,
      mime: f.mime,
      group: 'pack' as const,
      ...(opts.contentBase ? { fetchUrl: new URL(f.path, opts.contentBase).href } : {}),
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (!entries.length) throw new Error(`Pack ${pack.packId} has no files for the ${tier} tier.`);
  return {
    schemaVersion: 1,
    packId: pack.packId,
    tier: effectiveTier(pack, tier),
    narration,
    ...(opts.appVersion ? { appVersion: opts.appVersion } : {}),
    revision: await revisionOf(entries),
    entries,
  };
}

/** Why an entry is refused before any byte is stored, or null. Video is never packaged (R-506). */
export function unsafeEntry(e: OfflineEntry): string | null {
  if (!e.path.startsWith('/') || e.path.startsWith('//') || e.path.includes('..'))
    return `Unsupported offline path: ${e.path}`;
  if (/\.(mp4|webm)(?:$|\?)/i.test(e.path) || /^video\//.test(e.mime))
    return `Video is never saved offline: ${e.path}`;
  if (!HEX64.test(e.sha256) || !Number.isInteger(e.bytes) || e.bytes < 0)
    return `Bad checksum record: ${e.path}`;
  if (e.fetchUrl) {
    try {
      const u = new URL(e.fetchUrl);
      if (u.protocol !== 'https:' || u.username || u.password)
        return `Unapproved offline source: ${e.path}`;
    } catch {
      return `Unapproved offline source: ${e.path}`;
    }
  }
  return null;
}

export async function checkManifest(m: OfflineManifest, packId?: string): Promise<void> {
  if (m?.schemaVersion !== 1 || !Array.isArray(m.entries) || !m.entries.length)
    throw new Error('Unexpected offline manifest.');
  if (packId && m.packId !== packId) throw new Error('Offline manifest is for another pack.');
  if (!PACK_ID.test(m.packId)) throw new Error('Unexpected pack id.');
  for (const e of m.entries) {
    const why = unsafeEntry(e);
    if (why) throw new Error(why);
  }
  if ((await revisionOf(m.entries)) !== m.revision)
    throw new Error('Offline manifest revision does not match its entries.');
}

/** Bytes a person must download to move from `old` to `next` (R-310 size delta). */
export function updateBytes(old: OfflineEntry[], next: OfflineEntry[]): number {
  const have = new Set(old.map((e) => `${e.path}:${e.sha256}`));
  return next.filter((e) => !have.has(`${e.path}:${e.sha256}`)).reduce((n, e) => n + e.bytes, 0);
}

export const totalBytes = (entries: OfflineEntry[]) => entries.reduce((n, e) => n + e.bytes, 0);
