// Offline engine (C-07), ported from the PoC `public/sw.js` (POC-REFERENCE § 7: PORT) and
// generalised from the two hard-wired slots (ACTIVE/SPA) to one record per pack id. Every
// browser global is injected so the same code runs in the service worker and in vitest.
//
// Invariants (C-07 § Protocol, tested in tests/offline.engine.test.ts):
// - SAVE stages into `fia-stage-<revision>-<uuid>`, verifies MIME + bytes + sha256 on write and
//   again after all writes, then commits by swapping one META record; the previous pack's cache
//   is deleted only after that commit.
// - An integrity or commit failure deletes the stage and leaves the previous pack untouched.
//   An interruption (network, cancel, quota) keeps the verified files as a partial stage so
//   Resume fetches only what is missing (R-309 "partial (n of m)"); the active pack is still
//   untouched.
// - STATUS re-verifies every entry and compares the live revision (update-available, R-310).
// - DELETE is explicit and refused during a save. There is no sweeper (R-311).
// - Fetch serves only verified bytes and cross-checks `?fia-sha256=`; video is never packaged.
import {
  checkManifest,
  offlineManifestFromPack,
  revisionOf,
  sha256Hex,
  totalBytes,
  updateBytes,
  NARRATION_MODES,
  PACK_ID,
  TIERS,
  type ContentPack,
  type NarrationMode,
  type OfflineEntry,
  type OfflineManifest,
  type SaveState,
  type Tier,
} from './manifest';

export const META = 'fia-meta-v1';
export const SHELL_KEY = '/__fia_shell__';
export const SHELL_NEXT_KEY = '/__fia_shell_next__';
export const PACK_PREFIX = '/__fia_pack__/';
export const PARTIAL_PREFIX = '/__fia_partial__/';
export const SHELL_MANIFEST = '/offline-shell.json';

export interface CacheLike {
  match(key: string): Promise<Response | undefined>;
  put(key: string, value: Response): Promise<void>;
  delete(key: string): Promise<boolean>;
  keys?(): Promise<ReadonlyArray<Request | string>>;
}
export interface CachesLike {
  open(name: string): Promise<CacheLike>;
  delete(name: string): Promise<boolean>;
}
export interface PortLike {
  postMessage(value: unknown): void;
}
export interface EngineEnv {
  caches: CachesLike;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  origin: string;
  /** Where `/packs/<packId>/manifest.json` (C-02) lives; defaults to the app origin. */
  contentBase?: string;
  broadcast?: (message: Record<string, unknown>) => Promise<void> | void;
  uuid?: () => string;
  skipWaiting?: () => Promise<void> | void;
  appVersion?: string;
}

export interface PackRecord {
  packId: string;
  cache: string;
  revision: string;
  tier: Tier;
  narration: NarrationMode;
  appVersion?: string;
  entries: OfflineEntry[];
  savedAt?: string;
}
export interface ShellRecord {
  cache: string;
  revision: string;
  appVersion?: string;
  entries: OfflineEntry[];
}

export interface PackStatus {
  done: true;
  packId?: string;
  state: SaveState;
  saved: boolean;
  updateAvailable: boolean;
  corrupt: boolean;
  error?: string;
  revision?: string;
  bytes?: number;
  files?: number;
  savedFiles?: number;
  tier?: Tier;
  narration?: NarrationMode;
  liveRevision?: string;
  updateBytes?: number;
  liveBytes?: number;
}

export interface OfflineRequest {
  type: 'SAVE' | 'STATUS' | 'DELETE' | 'CANCEL' | 'MEDIA_VARIANTS' | 'SKIP_WAITING';
  packId?: string;
  tier?: Tier;
  narration?: NarrationMode;
  clientFetch?: boolean;
  id?: string;
  originalSha256?: string;
}

export class IntegrityError extends Error {}

const EMPTY = {
  done: true as const,
  state: 'none' as SaveState,
  saved: false,
  updateAvailable: false,
  corrupt: false,
};
const json = (v: unknown) =>
  new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } });
const keyOf = (k: Request | string) => (typeof k === 'string' ? k : new URL(k.url).pathname);

export async function verified(response: Response | undefined, entry: OfflineEntry) {
  if (!response?.ok) throw new IntegrityError(`Missing required file: ${entry.path}`);
  const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const jsAlias = entry.mime === 'text/javascript' && mime === 'application/javascript';
  if (mime !== entry.mime && !jsAlias) throw new IntegrityError(`Wrong file type: ${entry.path}`);
  const bytes = await response.clone().arrayBuffer();
  if (bytes.byteLength !== entry.bytes || (await sha256Hex(bytes)) !== entry.sha256)
    throw new IntegrityError(`Integrity failed: ${entry.path}`);
  return response;
}

export function createEngine(env: EngineEnv) {
  let job: {
    id: string;
    packId: string;
    controller: AbortController;
    removing?: boolean;
  } | null = null;
  const uuid = env.uuid ?? (() => crypto.randomUUID());
  const base = env.contentBase ?? env.origin;

  const meta = () => env.caches.open(META);
  async function read<T>(key: string): Promise<T | null> {
    const r = await (await meta()).match(key);
    return r ? ((await r.json()) as T) : null;
  }
  async function write(key: string, value: unknown) {
    await (await meta()).put(key, json(value));
  }
  async function drop(key: string) {
    await (await meta()).delete(key);
  }
  async function metaKeys(prefix: string): Promise<string[]> {
    const m = await meta();
    const keys = m.keys ? await m.keys() : [];
    return keys.map(keyOf).filter((k) => k.startsWith(prefix));
  }

  async function liveManifest(
    packId: string,
    tier: Tier,
    narration: NarrationMode,
    signal?: AbortSignal,
  ): Promise<OfflineManifest> {
    const url = new URL(`/packs/${packId}/manifest.json`, base).href;
    const res = await env.fetch(url, { cache: 'no-store', signal });
    if (!res.ok) throw new Error('Offline manifest unavailable.');
    const pack = (await res.json()) as ContentPack;
    if (pack.packId !== packId) throw new Error('Offline manifest is for another pack.');
    const m = await offlineManifestFromPack(pack, tier, narration, {
      appVersion: env.appVersion,
      contentBase:
        env.contentBase && new URL(env.contentBase).origin !== env.origin ? base : undefined,
    });
    await checkManifest(m, packId);
    return m;
  }

  async function countVerified(cacheName: string, entries: OfflineEntry[]) {
    const cache = await env.caches.open(cacheName);
    let n = 0;
    for (const e of entries) {
      try {
        await verified(await cache.match(e.path), e);
        n++;
      } catch {
        /* not yet saved */
      }
    }
    return n;
  }

  async function status(packId: string, opts: { live?: boolean } = {}): Promise<PackStatus> {
    if (job?.packId === packId && job.removing) return { ...EMPTY, packId, state: 'removing' };
    const active = await read<PackRecord>(PACK_PREFIX + packId);
    const partial = await read<PackRecord>(PARTIAL_PREFIX + packId);
    if (!active) {
      if (!partial) return { ...EMPTY, packId };
      const savedFiles = await countVerified(partial.cache, partial.entries);
      return {
        ...EMPTY,
        packId,
        state: 'partial',
        revision: partial.revision,
        tier: partial.tier,
        narration: partial.narration,
        bytes: totalBytes(partial.entries),
        files: partial.entries.length,
        savedFiles,
      };
    }
    const common = {
      packId,
      revision: active.revision,
      tier: active.tier,
      narration: active.narration,
      bytes: totalBytes(active.entries),
      files: active.entries.length,
    };
    try {
      const cache = await env.caches.open(active.cache);
      for (const e of active.entries) await verified(await cache.match(e.path), e);
    } catch (e) {
      const error = (e as Error).message;
      await env.broadcast?.({ type: 'CACHE_ERROR', packId, error });
      const savedFiles = await countVerified(active.cache, active.entries);
      return { ...EMPTY, ...common, state: 'corrupt', corrupt: true, error, savedFiles };
    }
    const out: PackStatus = {
      ...EMPTY,
      ...common,
      state: 'saved',
      saved: true,
      savedFiles: active.entries.length,
    };
    if (opts.live !== false) {
      try {
        const live = await liveManifest(packId, active.tier, active.narration);
        if (live.revision !== active.revision) {
          out.state = 'update-available';
          out.updateAvailable = true;
          out.liveRevision = live.revision;
          out.updateBytes = updateBytes(active.entries, live.entries);
          out.liveBytes = totalBytes(live.entries);
        }
      } catch {
        /* offline or unpublished: the saved copy stays authoritative */
      }
    }
    return out;
  }

  async function list(): Promise<PackStatus[]> {
    const ids = new Set(
      [...(await metaKeys(PACK_PREFIX)), ...(await metaKeys(PARTIAL_PREFIX))].map((k) =>
        k.replace(PACK_PREFIX, '').replace(PARTIAL_PREFIX, ''),
      ),
    );
    const out: PackStatus[] = [];
    for (const id of [...ids].sort()) out.push(await status(id));
    return out;
  }

  async function save(port: PortLike, req: OfflineRequest): Promise<PackStatus> {
    const { packId = '', tier = 'text', narration = 'source-fallback' } = req;
    if (job) throw new Error('Another save is already running.');
    if (!PACK_ID.test(packId)) throw new Error('Unexpected pack id.');
    if (!TIERS.includes(tier)) throw new Error('Unknown tier.');
    if (!NARRATION_MODES.includes(narration)) throw new Error('Unknown narration preference.');
    const id = req.id ?? uuid();
    const controller = new AbortController();
    job = { id, packId, controller };
    const signal = controller.signal;
    const aborted = () => {
      if (signal.aborted) throw new Error('Save canceled.');
    };
    let stage: string | undefined;
    let committed = false;
    try {
      const manifest = await liveManifest(packId, tier, narration, signal);
      const previousPartial = await read<PackRecord>(PARTIAL_PREFIX + packId);
      if (previousPartial && previousPartial.revision === manifest.revision) {
        stage = previousPartial.cache; // resume
      } else {
        if (previousPartial) await env.caches.delete(previousPartial.cache).catch(() => false);
        stage = `fia-stage-${manifest.revision}-${id}`;
      }
      const record: PackRecord = {
        packId,
        cache: stage,
        revision: manifest.revision,
        tier,
        narration,
        appVersion: manifest.appVersion,
        entries: manifest.entries,
      };
      await write(PARTIAL_PREFIX + packId, record);
      const cache = await env.caches.open(stage);
      const total = totalBytes(manifest.entries);
      let bytes = 0;
      let files = 0;
      for (const entry of manifest.entries) {
        aborted();
        let have = false;
        try {
          await verified(await cache.match(entry.path), entry);
          have = true;
        } catch {
          /* fetch it */
        }
        if (!have) {
          const res = await env.fetch(entry.fetchUrl ?? new URL(entry.path, base).href, {
            cache: 'no-store',
            signal,
          });
          await verified(res, entry);
          aborted();
          await cache.put(entry.path, res);
        }
        bytes += entry.bytes;
        files++;
        port.postMessage({
          progress: true,
          bytes,
          total,
          files,
          count: manifest.entries.length,
          packId,
        });
      }
      // Verify again after all writes, then commit by one META swap.
      for (const entry of manifest.entries) await verified(await cache.match(entry.path), entry);
      aborted();
      const previous = await read<PackRecord>(PACK_PREFIX + packId);
      await write(PACK_PREFIX + packId, { ...record, savedAt: new Date().toISOString() });
      committed = true;
      await drop(PARTIAL_PREFIX + packId).catch(() => undefined);
      if (previous && previous.cache !== stage)
        await env.caches.delete(previous.cache).catch(() => false);
      return await status(packId, { live: false });
    } catch (e) {
      let error = signal.aborted ? 'Save canceled.' : (e as Error).message;
      if (!committed && stage && e instanceof IntegrityError) {
        // Rollback: the stage is discarded; the previous pack (if any) is untouched.
        await env.caches.delete(stage).catch(() => false);
        await drop(PARTIAL_PREFIX + packId).catch(() => undefined);
      }
      if (committed) error = `${error}; the new pack is saved.`;
      const now = await status(packId, { live: false });
      return { ...now, error };
    } finally {
      job = null;
    }
  }

  async function remove(packId: string): Promise<PackStatus> {
    if (job) throw new Error('Cancel the current save before removing this passage.');
    job = { id: uuid(), packId, controller: new AbortController(), removing: true };
    try {
      const active = await read<PackRecord>(PACK_PREFIX + packId);
      const partial = await read<PackRecord>(PARTIAL_PREFIX + packId);
      await drop(PACK_PREFIX + packId);
      await drop(PARTIAL_PREFIX + packId);
      if (active) await env.caches.delete(active.cache);
      if (partial && partial.cache !== active?.cache) await env.caches.delete(partial.cache);
      return { ...EMPTY, packId };
    } finally {
      job = null;
    }
  }

  async function mediaVariants(sha: string): Promise<string[]> {
    const found = new Set<string>();
    for (const key of await metaKeys(PACK_PREFIX)) {
      const rec = await read<PackRecord>(key);
      if (!rec) continue;
      const cache = await env.caches.open(rec.cache);
      for (const e of rec.entries) {
        const src = (e.derivative as { sourceSha256?: string } | undefined)?.sourceSha256;
        if (e.sha256 !== sha && src !== sha) continue;
        try {
          await verified(await cache.match(e.path), e);
          found.add(e.sha256);
        } catch {
          /* unusable copy */
        }
      }
    }
    return [...found];
  }

  async function handleMessage(req: OfflineRequest, port?: PortLike): Promise<void> {
    if (req?.type === 'CANCEL') {
      if (job && (!req.id || job.id === req.id)) job.controller.abort();
      return;
    }
    if (req?.type === 'SKIP_WAITING') {
      await env.skipWaiting?.();
      return;
    }
    if (!port) return;
    try {
      let value: Record<string, unknown>;
      if (req.type === 'SAVE') value = { ...(await save(port, req)) };
      else if (req.type === 'STATUS')
        value = req.packId ? { ...(await status(req.packId)) } : { ...EMPTY, packs: await list() };
      else if (req.type === 'DELETE') value = { ...(await remove(req.packId ?? '')) };
      else if (req.type === 'MEDIA_VARIANTS')
        value = { ...EMPTY, sha256: await mediaVariants(req.originalSha256 ?? '') };
      else throw new Error('Unknown offline request.');
      port.postMessage(value);
    } catch (e) {
      port.postMessage({ ...EMPTY, packId: req.packId, error: (e as Error).message });
    }
  }

  // ---- shell (R-702): staged at install, committed at activate, so a waiting worker never
  // swaps the assets under a running session (R-704).
  async function installShell(): Promise<ShellRecord | null> {
    let res: Response;
    try {
      res = await env.fetch(new URL(SHELL_MANIFEST, env.origin).href, { cache: 'no-store' });
    } catch {
      return null;
    }
    if (!res.ok) return null; // dev server: no shell manifest, nothing to precache
    const doc = (await res.json()) as { appVersion?: string; entries: OfflineEntry[] };
    const entries = doc.entries.filter((e) => e.group === 'shell');
    const revision = await revisionOf(entries);
    const name = `fia-shell-${revision}`;
    const cache = await env.caches.open(name);
    try {
      for (const e of entries) {
        let have = false;
        try {
          await verified(await cache.match(e.path), e);
          have = true;
        } catch {
          /* fetch */
        }
        if (have) continue;
        const r = await env.fetch(new URL(e.path, env.origin).href, { cache: 'no-store' });
        await verified(r, e);
        await cache.put(e.path, r);
      }
    } catch (e) {
      await env.caches.delete(name).catch(() => false);
      throw e;
    }
    const rec: ShellRecord = { cache: name, revision, appVersion: doc.appVersion, entries };
    await write(SHELL_NEXT_KEY, rec);
    return rec;
  }

  async function activateShell(): Promise<void> {
    const next = await read<ShellRecord>(SHELL_NEXT_KEY);
    if (!next) return;
    const prev = await read<ShellRecord>(SHELL_KEY);
    await write(SHELL_KEY, next);
    await drop(SHELL_NEXT_KEY);
    if (prev && prev.cache !== next.cache) await env.caches.delete(prev.cache).catch(() => false);
  }

  /** Returns a Response to serve, or null to let the network handle the request untouched. */
  async function handleFetch(request: {
    url: string;
    method: string;
    mode?: string;
  }): Promise<Response | null> {
    if (request.method !== 'GET') return null;
    const url = new URL(request.url);
    const local = url.origin === env.origin;
    const navigate = request.mode === 'navigate';
    if (local && (url.pathname === '/sw.js' || url.pathname === SHELL_MANIFEST)) return null;
    if (/^\/packs\/[^/]+\/manifest\.json$/.test(url.pathname)) return null;
    if (navigate) {
      try {
        const live = await env.fetch(request.url, { cache: 'no-store' });
        if (live.ok) return live;
      } catch {
        /* offline: fall back to the cached shell */
      }
    }
    const path = navigate ? '/index.html' : url.pathname;
    const wanted = url.searchParams.get('fia-sha256');
    const records: Array<{ cache: string; entries: OfflineEntry[]; packId?: string }> = [];
    const shell = await read<ShellRecord>(SHELL_KEY);
    if (shell) records.push(shell);
    for (const key of await metaKeys(PACK_PREFIX)) {
      const r = await read<PackRecord>(key);
      if (r) records.push(r);
    }
    for (const rec of records) {
      const entry = rec.entries.find((e) =>
        local ? e.path === path : e.fetchUrl === `${url.origin}${url.pathname}`,
      );
      if (!entry || (wanted && wanted !== entry.sha256)) continue;
      try {
        return await verified(await (await env.caches.open(rec.cache)).match(entry.path), entry);
      } catch (e) {
        await env.broadcast?.({
          type: 'CACHE_ERROR',
          packId: rec.packId,
          path: entry.path,
          error: (e as Error).message,
        });
        break;
      }
    }
    return null;
  }

  return {
    handleMessage,
    handleFetch,
    installShell,
    activateShell,
    status,
    list,
    save,
    remove,
    get busy() {
      return job !== null;
    },
  };
}

export type OfflineEngine = ReturnType<typeof createEngine>;
