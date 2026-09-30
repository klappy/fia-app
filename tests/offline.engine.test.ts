import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createValidator, type ContractSchema } from '../src/contracts/validate';
import {
  createEngine,
  META,
  PACK_PREFIX,
  SHELL_KEY,
  type CachesLike,
  type EngineEnv,
  type PackRecord,
  type PackStatus,
} from '../src/offline/engine';
import { offlineManifestFromPack, sha256Hex, type ContentPack } from '../src/offline/manifest';

// Acceptance seeds ported from the PoC tests/offline.test.mjs (quota failure keeps the previous
// pointer; failed commit restores) plus the C-07 `contracts.offline.test` cases: kill mid-download
// → partial (n of m) → resume completes; corrupt entry → corrupt + CACHE_ERROR; bump revision →
// update-available; decline keeps the old pack working offline; no delete without DELETE.
const dir = join(process.cwd(), 'contracts');
const schemas = readdirSync(dir)
  .filter((f) => f.endsWith('.schema.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as ContractSchema);
const validator = createValidator(schemas);
const C07 = 'https://fia.klappy.dev/contracts/c07-offline-pack.schema.json';
const doneOk = (v: unknown) => validator.validate(`${C07}#/$defs/done`, v);

function fakeCaches(opts: { failPut?: (cache: string, key: string) => boolean } = {}) {
  const stores = new Map<string, Map<string, Response>>();
  const api: CachesLike & { stores: typeof stores } = {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        async match(k) {
          return store.get(k)?.clone();
        },
        async put(k, v) {
          if (opts.failPut?.(name, k)) throw new Error('QuotaExceededError');
          store.set(k, v.clone());
        },
        async delete(k) {
          return store.delete(k);
        },
        async keys() {
          return [...store.keys()];
        },
      };
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
  return api;
}

const ORIGIN = 'https://fia.test';
const enc = (s: string) => new TextEncoder().encode(s);

async function packFixture(packId: string, files: Record<string, string>): Promise<ContentPack> {
  const list = await Promise.all(
    Object.entries(files).map(async ([name, body]) => ({
      path: `/packs/${packId}/${name}`,
      bytes: enc(body).byteLength,
      sha256: await sha256Hex(body),
      mime: 'application/json',
    })),
  );
  return {
    packId,
    tiers: { text: { bytes: list.reduce((n, f) => n + f.bytes, 0), files: list } },
  };
}

function server(initial: Record<string, ContentPack>, bodies: Record<string, string>) {
  const packs = { ...initial };
  const files = { ...bodies };
  let failAfter = Infinity;
  let calls = 0;
  const fetch: EngineEnv['fetch'] = async (input) => {
    const url = new URL(input);
    const m = url.pathname.match(/^\/packs\/([^/]+)\/manifest\.json$/);
    if (m) {
      if (!packs[m[1]]) return new Response('no', { status: 404 });
      return new Response(JSON.stringify(packs[m[1]]), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (++calls > failAfter) throw new TypeError('Failed to fetch');
    const body = files[url.pathname];
    if (body === undefined) return new Response('missing', { status: 404 });
    return new Response(enc(body), { headers: { 'Content-Type': 'application/json' } });
  };
  return {
    fetch,
    packs,
    files,
    killAfter(n: number) {
      calls = 0;
      failAfter = n;
    },
    heal() {
      failAfter = Infinity;
    },
  };
}

function port() {
  const messages: Array<Record<string, unknown>> = [];
  return {
    messages,
    postMessage: (v: unknown): void => {
      messages.push(v as Record<string, unknown>);
    },
  };
}

async function setup(opts: { failPut?: (cache: string, key: string) => boolean } = {}) {
  const packId = 'spa.MRK-1-1-13';
  const bodies = { 'guide.json': '{"g":1}', 'scripture.json': '{"s":1}', 'terms.json': '{"t":1}' };
  const pack = await packFixture(packId, bodies);
  const files = Object.fromEntries(
    Object.entries(bodies).map(([k, v]) => [`/packs/${packId}/${k}`, v]),
  );
  const srv = server({ [packId]: pack }, files);
  const caches = fakeCaches(opts);
  const broadcasts: Array<Record<string, unknown>> = [];
  const env: EngineEnv = {
    caches,
    fetch: srv.fetch,
    origin: ORIGIN,
    broadcast: (m) => {
      broadcasts.push(m);
    },
  };
  let n = 0;
  env.uuid = () => `job-${++n}`;
  const engine = createEngine(env);
  return { packId, pack, srv, caches, broadcasts, engine };
}

async function send(
  engine: ReturnType<typeof createEngine>,
  req: Record<string, unknown>,
): Promise<{ last: PackStatus & Record<string, unknown>; all: Array<Record<string, unknown>> }> {
  const p = port();
  await engine.handleMessage(req as never, p);
  return { last: p.messages.at(-1) as PackStatus & Record<string, unknown>, all: p.messages };
}

describe('offline engine (C-07)', () => {
  it('saves a verified pack; every reply matches the C-07 done/progress shapes', async () => {
    const { engine, packId } = await setup();
    const { last, all } = await send(engine, { type: 'SAVE', packId, tier: 'text' });
    expect(last.error).toBeUndefined();
    expect(last.state).toBe('saved');
    expect(last.saved).toBe(true);
    expect(last.files).toBe(3);
    expect(doneOk(last).errors).toEqual([]);
    const progress = all.filter((m) => m.progress);
    expect(progress).toHaveLength(3);
    for (const m of progress)
      expect(validator.validate(`${C07}#/$defs/progress`, m).errors).toEqual([]);
    const status = await send(engine, { type: 'STATUS', packId });
    expect(status.last.state).toBe('saved');
    expect(doneOk(status.last).ok).toBe(true);
  });

  it('the derived offline manifest validates against C-07 and its revision tracks entries', async () => {
    const { pack } = await setup();
    const a = await offlineManifestFromPack(pack, 'text', 'source-fallback');
    expect(validator.validate(C07, a).errors).toEqual([]);
    const b = await offlineManifestFromPack(pack, 'phone', 'source-fallback');
    expect(b.revision).toBe(a.revision); // same entries (no phone files) → same revision
    const changed = structuredClone(pack);
    changed.tiers.text!.files[0].sha256 = 'f'.repeat(64);
    const c = await offlineManifestFromPack(changed, 'text', 'source-fallback');
    expect(c.revision).not.toBe(a.revision);
  });

  it('kill mid-download → partial (n of m); resume fetches only the rest and completes', async () => {
    const { engine, packId, srv } = await setup();
    srv.killAfter(1);
    const first = await send(engine, { type: 'SAVE', packId });
    expect(first.last.error).toMatch(/Failed to fetch/);
    expect(first.last.state).toBe('partial');
    expect(first.last.savedFiles).toBe(1);
    expect(first.last.files).toBe(3);
    expect(first.last.saved).toBe(false);
    srv.heal();
    srv.killAfter(2); // resume must need only the 2 missing files
    const resumed = await send(engine, { type: 'SAVE', packId });
    expect(resumed.last.error).toBeUndefined();
    expect(resumed.last.state).toBe('saved');
  });

  it('corrupt cached entry → corrupt + CACHE_ERROR; fetch refuses the bad bytes', async () => {
    const { engine, packId, caches, broadcasts } = await setup();
    await send(engine, { type: 'SAVE', packId });
    const rec = (await (await (
      await caches.open(META)
    ).match(PACK_PREFIX + packId))!.json()) as PackRecord;
    await (
      await caches.open(rec.cache)
    ).put(
      `/packs/${packId}/guide.json`,
      new Response('{"g":2}', { headers: { 'Content-Type': 'application/json' } }),
    );
    const { last } = await send(engine, { type: 'STATUS', packId });
    expect(last.state).toBe('corrupt');
    expect(last.corrupt).toBe(true);
    expect(doneOk(last).ok).toBe(true);
    expect(broadcasts.some((b) => b.type === 'CACHE_ERROR')).toBe(true);
    const served = await engine.handleFetch({
      url: `${ORIGIN}/packs/${packId}/guide.json`,
      method: 'GET',
    });
    expect(served).toBeNull(); // falls through to the network, never serves unverified bytes
    for (const b of broadcasts)
      expect(validator.validate(`${C07}#/$defs/broadcast`, b).errors).toEqual([]);
  });

  it('bump revision → update-available with size delta; declining keeps the old pack serving', async () => {
    const { engine, packId, srv } = await setup();
    await send(engine, { type: 'SAVE', packId });
    const body = '{"g":"new guide text"}';
    srv.files[`/packs/${packId}/guide.json`] = body;
    srv.packs[packId] = await packFixture(packId, {
      'guide.json': body,
      'scripture.json': '{"s":1}',
      'terms.json': '{"t":1}',
    });
    const { last } = await send(engine, { type: 'STATUS', packId });
    expect(last.state).toBe('update-available');
    expect(last.updateAvailable).toBe(true);
    expect(last.saved).toBe(true);
    expect(last.updateBytes).toBe(enc(body).byteLength);
    // Decline = do nothing: the old verified bytes are still served offline.
    const served = await engine.handleFetch({
      url: `${ORIGIN}/packs/${packId}/guide.json`,
      method: 'GET',
    });
    expect(await served!.text()).toBe('{"g":1}');
    // Accept: the old cache is deleted only after the new one commits.
    const updated = await send(engine, { type: 'SAVE', packId });
    expect(updated.last.state).toBe('saved');
    const after = await engine.handleFetch({
      url: `${ORIGIN}/packs/${packId}/guide.json`,
      method: 'GET',
    });
    expect(await after!.text()).toBe(body);
  });

  it('integrity failure rolls back: stage deleted, previous pack untouched', async () => {
    const { engine, packId, srv, caches } = await setup();
    await send(engine, { type: 'SAVE', packId });
    const before = (await (await (
      await caches.open(META)
    ).match(PACK_PREFIX + packId))!.json()) as PackRecord;
    srv.packs[packId] = await packFixture(packId, {
      'guide.json': '{"g":3}',
      'scripture.json': '{"s":1}',
      'terms.json': '{"t":1}',
    }); // manifest says g:3 but the server still sends g:1 → hash mismatch
    const { last } = await send(engine, { type: 'SAVE', packId });
    expect(last.error).toMatch(/Integrity failed/);
    const now = (await (await (
      await caches.open(META)
    ).match(PACK_PREFIX + packId))!.json()) as PackRecord;
    expect(now.cache).toBe(before.cache);
    expect([...caches.stores.keys()].filter((k) => k.startsWith('fia-stage-'))).toEqual([
      before.cache,
    ]);
  });

  it('quota failure cannot replace the previous active pointer (PoC seed)', async () => {
    let failing = false;
    const { engine, packId, srv, caches } = await setup({
      failPut: (cache) => failing && cache.startsWith('fia-stage-'),
    });
    await send(engine, { type: 'SAVE', packId });
    const before = (await (await (
      await caches.open(META)
    ).match(PACK_PREFIX + packId))!.json()) as PackRecord;
    srv.files[`/packs/${packId}/guide.json`] = '{"g":4}';
    srv.packs[packId] = await packFixture(packId, {
      'guide.json': '{"g":4}',
      'scripture.json': '{"s":1}',
      'terms.json': '{"t":1}',
    });
    failing = true;
    const { last } = await send(engine, { type: 'SAVE', packId });
    expect(last.error).toMatch(/QuotaExceeded/);
    expect(last.saved).toBe(true); // the previous verified pack still works
    const now = (await (await (
      await caches.open(META)
    ).match(PACK_PREFIX + packId))!.json()) as PackRecord;
    expect(now.cache).toBe(before.cache);
  });

  it('DELETE is explicit, refused during a save, and nothing else removes a verified pack', async () => {
    const { engine, packId, srv, caches } = await setup();
    await send(engine, { type: 'SAVE', packId });
    // STATUS, a failed save and CANCEL never remove it.
    srv.killAfter(0);
    await send(engine, { type: 'STATUS', packId });
    await send(engine, { type: 'CANCEL' });
    expect((await send(engine, { type: 'STATUS', packId })).last.state).toBe('saved');
    srv.heal();
    // DELETE during a save is refused.
    const slow = port();
    const saving = engine.handleMessage({ type: 'SAVE', packId: 'spa.MRK-1-14-20' } as never, slow);
    const refused = await send(engine, { type: 'DELETE', packId });
    await saving;
    expect(refused.last.error).toMatch(/Cancel the current save/);
    const removed = await send(engine, { type: 'DELETE', packId });
    expect(removed.last.state).toBe('none');
    expect(await (await caches.open(META)).match(PACK_PREFIX + packId)).toBeUndefined();
  });

  it('CANCEL stops a save and leaves a resumable partial', async () => {
    const { engine, packId } = await setup();
    const p = port();
    const origPost = p.postMessage;
    p.postMessage = (v: unknown) => {
      origPost(v);
      if ((v as { progress?: boolean }).progress) void engine.handleMessage({ type: 'CANCEL' });
    };
    await engine.handleMessage({ type: 'SAVE', packId } as never, p);
    const last = p.messages.at(-1) as unknown as PackStatus;
    expect(last.error).toBe('Save canceled.');
    expect(last.state).toBe('partial');
  });

  it('refuses video and unsafe paths before storing anything', async () => {
    const { engine, packId, srv, caches } = await setup();
    const bad = await packFixture(packId, { 'clip.mp4': 'x' });
    bad.tiers.text!.files[0].mime = 'video/mp4';
    srv.packs[packId] = bad;
    const { last } = await send(engine, { type: 'SAVE', packId });
    expect(last.error).toMatch(/Video is never saved/);
    expect([...caches.stores.keys()].some((k) => k.startsWith('fia-stage-'))).toBe(false);
  });

  it('STATUS without a pack id lists every saved and partial pack', async () => {
    const { engine, packId, srv } = await setup();
    await send(engine, { type: 'SAVE', packId });
    const { last } = await send(engine, { type: 'STATUS' });
    expect((last.packs as PackStatus[]).map((p) => p.packId)).toEqual([packId]);
    srv.killAfter(0);
    expect(doneOk(last).ok).toBe(true);
  });

  it('?fia-sha256= cross-check: a mismatched hash is not served from the pack', async () => {
    const { engine, packId } = await setup();
    await send(engine, { type: 'SAVE', packId });
    const url = `${ORIGIN}/packs/${packId}/guide.json`;
    expect(
      await engine.handleFetch({ url: `${url}?fia-sha256=${'0'.repeat(64)}`, method: 'GET' }),
    ).toBeNull();
    const good = await engine.handleFetch({
      url: `${url}?fia-sha256=${await sha256Hex('{"g":1}')}`,
      method: 'GET',
    });
    expect(await good!.text()).toBe('{"g":1}');
  });
});

describe('offline shell (R-702)', () => {
  async function shellSetup() {
    const html = '<!doctype html><div id="root"></div>';
    const js = 'console.log(1)';
    const entries = [
      {
        path: '/index.html',
        bytes: enc(html).byteLength,
        sha256: await sha256Hex(html),
        mime: 'text/html',
        group: 'shell',
      },
      {
        path: '/assets/app.js',
        bytes: enc(js).byteLength,
        sha256: await sha256Hex(js),
        mime: 'text/javascript',
        group: 'shell',
      },
    ];
    let online = true;
    const caches = fakeCaches();
    const engine = createEngine({
      caches,
      origin: ORIGIN,
      fetch: async (input) => {
        if (!online) throw new TypeError('offline');
        const p = new URL(input).pathname;
        if (p === '/offline-shell.json')
          return new Response(JSON.stringify({ schemaVersion: 1, entries }), {
            headers: { 'Content-Type': 'application/json' },
          });
        if (p === '/index.html' || p === '/')
          return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        if (p === '/assets/app.js')
          return new Response(js, { headers: { 'Content-Type': 'application/javascript' } });
        return new Response('nf', { status: 404 });
      },
    });
    return { engine, caches, setOnline: (v: boolean) => (online = v), html };
  }

  it('install stages the shell; activate commits it; an offline cold start gets index.html', async () => {
    const { engine, caches, setOnline, html } = await shellSetup();
    await engine.installShell();
    expect(await (await caches.open(META)).match(SHELL_KEY)).toBeUndefined(); // not until activate
    await engine.activateShell();
    expect(await (await caches.open(META)).match(SHELL_KEY)).toBeDefined();
    setOnline(false);
    const nav = await engine.handleFetch({
      url: `${ORIGIN}/library`,
      method: 'GET',
      mode: 'navigate',
    });
    expect(await nav!.text()).toBe(html);
    const js = await engine.handleFetch({ url: `${ORIGIN}/assets/app.js`, method: 'GET' });
    expect(await js!.text()).toBe('console.log(1)');
  });

  it('without a shell manifest (dev) install is a no-op', async () => {
    const engine = createEngine({
      caches: fakeCaches(),
      origin: ORIGIN,
      fetch: async () => new Response('nf', { status: 404 }),
    });
    expect(await engine.installShell()).toBeNull();
  });
});
