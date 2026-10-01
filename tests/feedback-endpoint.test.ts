// POST /api/feedback (worker/index.ts) — C-16 endpoint, R-705. Same-origin, validated, idempotent.
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import worker from '../worker/index';
import {
  FEEDBACK_PATH,
  MAX_BODY_BYTES,
  canonicalId,
  feedbackKey,
  handleFeedback,
  type Env,
  type FeedbackBucket,
} from '../worker/feedback';
import { buildFeedback } from '../src/feedback/payload';
import c16 from '../contracts/c16-feedback.schema.json';

const ORIGIN = 'https://dev.fiaguide.app';
const URL_ = `${ORIGIN}${FEEDBACK_PATH}`;
const ID = '6f1d2c3e-9a8b-4c7d-8e6f-0a1b2c3d4e5f';
const valid = () => structuredClone(c16.examples[0]) as Record<string, unknown>;

/** In-memory R2 slice: honours `onlyIf: If-None-Match: *` (create-only) like R2 does. */
function memoryBucket(opts: { headGate?: Promise<void> } = {}) {
  const objects = new Map<string, { value: string; meta?: Record<string, string> }>();
  let puts = 0;
  const bucket: FeedbackBucket = {
    head: async (k) => {
      const seen = objects.has(k);
      await opts.headGate;
      return seen ? { key: k } : null;
    },
    put: async (k, value, o) => {
      if (o?.onlyIf?.get('if-none-match') === '*' && objects.has(k)) return null;
      puts++;
      objects.set(k, { value, meta: o?.customMetadata });
      return { key: k };
    },
  };
  return { bucket, objects, puts: () => puts };
}

function envWith(bucket?: FeedbackBucket): Env {
  return {
    ASSETS: { fetch: async () => new Response('<!doctype html>asset', { status: 200 }) },
    FEEDBACK: bucket,
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/feedback (C-16)', () => {
  it('valid payload → 201 stored once, with no headers/IP kept', async () => {
    const m = memoryBucket();
    const res = await worker.fetch(post(valid()), envWith(m.bucket));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: ID, status: 'stored' });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    const stored = JSON.parse(m.objects.get(feedbackKey(ID))!.value);
    expect(stored.payload).toEqual(valid());
    expect(Object.keys(stored)).toEqual(['receivedAt', 'payload']);
    expect(m.objects.get(feedbackKey(ID))!.meta).toMatchObject({ schemaVersion: '1' });
  });

  it('accepts what the shipped client builds (contact typed, sec-fetch-site same-origin)', async () => {
    const m = memoryBucket();
    const built = buildFeedback(
      { text: 'Se detuvo.', contact: 'ana@example.org' },
      {
        appVersion: '0.2.1+abc1234',
        uiLanguage: 'spa',
        contentLanguage: 'spa',
        offline: false,
      },
      { id: '11111111-2222-4333-8444-555555555555' },
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const res = await worker.fetch(
      post(built.payload, { 'sec-fetch-site': 'same-origin' }),
      envWith(m.bucket),
    );
    expect(res.status).toBe(201);
  });

  it('duplicate id → 200, no second object and no overwrite (resend after reconnect)', async () => {
    const m = memoryBucket();
    const env = envWith(m.bucket);
    expect((await worker.fetch(post(valid()), env)).status).toBe(201);
    const again = { ...valid(), id: ID.toUpperCase(), text: 'changed' };
    const res = await worker.fetch(post(again), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'duplicate' });
    expect(m.objects.size).toBe(1);
    expect(m.puts()).toBe(1);
    expect(JSON.parse(m.objects.get(feedbackKey(ID))!.value).payload.text).toBe(valid().text);
  });

  it('concurrent first sends of one id race past head(): one 201, one 200, one object', async () => {
    let open!: () => void;
    const m = memoryBucket({ headGate: new Promise<void>((r) => (open = r)) });
    const env = envWith(m.bucket);
    const a = worker.fetch(post(valid()), env);
    const b = worker.fetch(post({ ...valid(), text: 'second' }), env);
    await new Promise((r) => setTimeout(r, 10));
    open();
    const statuses = (await Promise.all([a, b])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 201]);
    expect(m.puts()).toBe(1);
    expect(m.objects.size).toBe(1);
  });

  it('id normalized: urn:uuid: prefix and upper case map to the same key', async () => {
    expect(canonicalId(`urn:uuid:${ID.toUpperCase()}`)).toBe(ID);
    const m = memoryBucket();
    const env = envWith(m.bucket);
    const first = await worker.fetch(post({ ...valid(), id: `urn:uuid:${ID}` }), env);
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ id: ID, status: 'stored' });
    expect([...m.objects.keys()]).toEqual([`feedback/v1/${ID}.json`]);
    expect(
      (await worker.fetch(post({ ...valid(), id: `URN:UUID:${ID.toUpperCase()}` }), env)).status,
    ).toBe(200);
    expect(m.objects.size).toBe(1);
  });

  it('R2 failures → 503 JSON, never an unhandled 500', async () => {
    const boom = async () => {
      throw new Error('r2 down');
    };
    for (const bucket of [
      { head: boom, put: async () => ({}) },
      { head: async () => null, put: boom },
    ] as FeedbackBucket[]) {
      const res = await worker.fetch(post(valid()), envWith(bucket));
      expect(res.status).toBe(503);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.json()).toEqual({ error: 'storage-unavailable' });
    }
  });

  it('customMetadata stays far under R2 2 KiB (long appVersion is cut)', async () => {
    const m = memoryBucket();
    const appVersion = `${'9'.repeat(5000)}.0.0+abc1234`;
    expect((await worker.fetch(post({ ...valid(), appVersion }), envWith(m.bucket))).status).toBe(
      201,
    );
    const meta = m.objects.get(feedbackKey(ID))!.meta!;
    const bytes = Object.entries(meta).reduce((n, [k, v]) => n + k.length + v.length, 0);
    expect(bytes).toBeLessThan(256);
  });

  it.each([
    ['missing required text', () => ({ ...valid(), text: undefined })],
    ['extra property', () => ({ ...valid(), ip: '1.2.3.4' })],
    ['bad uuid', () => ({ ...valid(), id: 'not-a-uuid' })],
    ['bad contact', () => ({ ...valid(), contact: 'call me maybe' })],
    ['text over 4000', () => ({ ...valid(), text: 'x'.repeat(4001) })],
    ['unknown major', () => ({ ...valid(), schemaVersion: 2 })],
    ['array body', () => [valid()]],
  ])('invalid (%s) → 400, nothing stored, values not echoed', async (_n, make) => {
    const m = memoryBucket();
    const res = await worker.fetch(post(make()), envWith(m.bucket));
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain('call me maybe');
    expect(m.objects.size).toBe(0);
  });

  it('malformed JSON → 400', async () => {
    const res = await worker.fetch(post('{"schemaVersion":1,'), envWith(memoryBucket().bucket));
    expect(res.status).toBe(400);
  });

  it('size limits → 413 by Content-Length and by streamed bytes', async () => {
    const big = JSON.stringify({ ...valid(), text: 'x'.repeat(MAX_BODY_BYTES) });
    const m = memoryBucket();
    expect((await worker.fetch(post(big), envWith(m.bucket))).status).toBe(413);
    const lying = post(big, { 'content-length': '10' });
    expect((await handleFeedback(lying, envWith(m.bucket))).status).toBe(413);
    expect(m.objects.size).toBe(0);
  });

  it('same-origin only: foreign or missing Origin → 403, no CORS headers', async () => {
    const m = memoryBucket();
    const noOrigin = new Request(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(valid()),
    });
    const cases: Request[] = [
      post(valid(), { origin: 'https://evil.example' }),
      post(valid(), { origin: 'null' }),
      post(valid(), { 'sec-fetch-site': 'cross-site' }),
      noOrigin,
    ];
    for (const req of cases) {
      const res = await worker.fetch(req, envWith(m.bucket));
      expect(res.status).toBe(403);
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    }
    const preflight = new Request(URL_, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect((await worker.fetch(preflight, envWith(m.bucket))).status).toBe(403);
    expect(m.objects.size).toBe(0);
  });

  it('wrong method → 405, wrong content-type → 415', async () => {
    const env = envWith(memoryBucket().bucket);
    const get = new Request(URL_, { headers: { origin: ORIGIN } });
    const r = await worker.fetch(get, env);
    expect(r.status).toBe(405);
    expect(r.headers.get('allow')).toBe('POST');
    expect((await worker.fetch(post(valid(), { 'content-type': 'text/plain' }), env)).status).toBe(
      415,
    );
  });

  it('no storage binding → 503 so the client keeps its outbox', async () => {
    expect((await worker.fetch(post(valid()), envWith(undefined))).status).toBe(503);
  });

  it('non-API paths go to static assets unchanged; unknown /api/* → 404', async () => {
    const env = envWith(memoryBucket().bucket);
    const page = await worker.fetch(new Request(`${ORIGIN}/library`), env);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('asset');
    expect((await worker.fetch(new Request(`${ORIGIN}/api/other`), env)).status).toBe(404);
  });

  it('entry module exports handlers only (workerd rejects other named exports)', async () => {
    expect(Object.keys(await import('../worker/index'))).toEqual(['default']);
  });

  it('generated standalone validator is fresh against contracts/c16', () => {
    const r = spawnSync(process.execPath, ['scripts/build-worker-validators.mjs', '--check'], {
      encoding: 'utf8',
    });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});
