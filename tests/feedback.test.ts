import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BACKOFF_BASE_MS,
  DEFAULT_FEEDBACK_ENDPOINT,
  FEEDBACK_ENDPOINT,
  Outbox,
  OUTBOX_KEY,
  OUTBOX_LIMIT,
  backoffMs,
  defaultTransport,
  feedbackEndpoint,
  fetchTransport,
  startFeedbackFlusher,
  type FlusherEnv,
} from '../src/feedback/outbox';
import {
  buildFeedback,
  contactOk,
  refOf,
  userAgentClass,
  validateFeedback,
  type FeedbackContextInput,
} from '../src/feedback/payload';
import { appVersion, UNSTAMPED } from '../src/feedback/version';
import { memoryStore } from '../src/settings/storage';

const ctx: FeedbackContextInput = {
  appVersion: '0.2.0+abc1234',
  uiLanguage: 'spa',
  contentLanguage: 'spa',
  packId: 'spa.MRK-1-1-13',
  unitId: 'S02-U004',
  screen: 'S05',
  theme: 'light',
  textSize: 'large',
  offline: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36',
};
const ID = '6f1d2c3e-9a8b-4c7d-8e6f-0a1b2c3d4e5f';

describe('C-16 feedback payload', () => {
  it('builds a valid payload; anonymous by default (contact null)', () => {
    const r = buildFeedback({ text: '  El audio se detuvo.  ' }, ctx, { id: ID });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toMatchObject({
      schemaVersion: 1,
      text: 'El audio se detuvo.',
      contact: null,
      userAgentClass: 'android-chrome',
      offline: true,
    });
    expect(validateFeedback(r.payload).ok).toBe(true);
  });
  it('empty text → need-text', () => {
    const r = buildFeedback({ text: '   ' }, ctx);
    expect(r).toMatchObject({ ok: false, reason: 'need-text' });
  });
  it('over-long text and bad contact are invalid, never silently changed', () => {
    expect(buildFeedback({ text: 'x'.repeat(4001) }, ctx).ok).toBe(false);
    expect(buildFeedback({ text: 'hi', contact: 'not a contact' }, ctx).ok).toBe(false);
    expect(buildFeedback({ text: 'hi', contact: 'ana@example.org' }, ctx).ok).toBe(true);
    expect(buildFeedback({ text: 'hi', contact: '+52 55 1234 5678' }, ctx).ok).toBe(true);
  });
  it('screenshot over 2 MB is dropped; the text still sends', () => {
    const r = buildFeedback(
      { text: 'hi', screenshot: { mime: 'image/png', bytes: 3_000_000, sha256: 'a'.repeat(64) } },
      ctx,
    );
    expect(r.ok && r.dropped).toEqual(['screenshot']);
    expect(r.ok && r.payload.screenshot).toBeUndefined();
  });
  it('generates a uuid id and a 4-char reference', () => {
    const r = buildFeedback({ text: 'hi' }, ctx);
    expect(r.ok && r.payload.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(refOf(ID)).toBe('6f1d');
  });
  it('classifies user agents coarsely', () => {
    expect(userAgentClass('')).toBe('other');
    expect(
      userAgentClass(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('ios-safari');
    expect(userAgentClass('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128')).toBe('desktop');
  });
  it('appVersion falls back to an unstamped build that still matches C-16', () => {
    expect(appVersion(undefined)).toBe(UNSTAMPED);
    expect(UNSTAMPED).toMatch(/^\d+\.\d+\.\d+\+0000000$/);
    const doc = { querySelector: () => ({ getAttribute: () => '0.2.3+a1b2c3d' }) };
    expect(appVersion(doc as unknown as Document)).toBe('0.2.3+a1b2c3d');
  });
});

describe('feedback outbox', () => {
  const payload = () => {
    const r = buildFeedback({ text: 'hi' }, ctx, { id: ID });
    if (!r.ok) throw new Error('fixture');
    return r.payload;
  };
  it('queues idempotently by id', () => {
    const box = new Outbox(memoryStore());
    expect(box.enqueue(payload())).toBe(true);
    expect(box.enqueue(payload())).toBe(true);
    expect(box.list()).toHaveLength(1);
    expect(box.counts()).toEqual({ sent: 0, waiting: 1 });
  });
  it('null transport (endpoint turned off) sends nothing', async () => {
    const box = new Outbox(memoryStore());
    box.enqueue(payload());
    expect(await box.flush(null)).toBe(0);
    expect(box.waiting()).toHaveLength(1);
  });
  it('received only on 2xx; failures and throws stay waiting', async () => {
    const box = new Outbox(memoryStore());
    box.enqueue(payload());
    expect(await box.flush(async () => 503)).toBe(0);
    expect(
      await box.flush(async () => {
        throw new Error('offline');
      }),
    ).toBe(0);
    expect(box.list()[0].attempts).toBe(2);
    expect(await box.flush(async () => 202)).toBe(1);
    expect(box.recent()[0].status).toBe('received');
    expect(await box.flush(async () => 202)).toBe(0);
  });
  it('storage denied → cannot queue', () => {
    const box = new Outbox(null);
    expect(box.persistent).toBe(false);
    expect(box.enqueue(payload())).toBe(false);
  });
  it('refuses an invalid payload', () => {
    const store = memoryStore();
    const box = new Outbox(store);
    expect(box.enqueue({ ...payload(), text: '' })).toBe(false);
    expect(store.dump()[OUTBOX_KEY]).toBeUndefined();
  });
});

describe('review fia-app#5 fixes', () => {
  it('contact must be an email or phone (C-16); a name alone is refused on the field', () => {
    expect(contactOk('')).toBe(true);
    expect(contactOk('ana@example.org')).toBe(true);
    expect(contactOk('+57 300 123 4567')).toBe(true);
    expect(contactOk('Ana')).toBe(false);
    const r = buildFeedback({ text: 'hi', contact: 'Ana' }, ctx, { id: ID });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad-contact');
    expect(buildFeedback({ text: 'hi', contact: 'ana@example.org' }, ctx, { id: ID }).ok).toBe(
      true,
    );
  });
  it('outbox never drops unsent items: full → refuse; only received items are trimmed', async () => {
    const mk = (i: number) => {
      const id = `6f1d2c3e-9a8b-4c7d-8e6f-${i.toString(16).padStart(12, '0')}`;
      const r = buildFeedback({ text: `m${i}` }, ctx, { id });
      if (!r.ok) throw new Error('fixture');
      return r.payload;
    };
    const box = new Outbox(memoryStore());
    for (let i = 0; i < OUTBOX_LIMIT; i++) expect(box.enqueue(mk(i))).toBe(true);
    expect(box.full()).toBe(true);
    expect(box.enqueue(mk(999))).toBe(false);
    expect(box.waiting()).toHaveLength(OUTBOX_LIMIT);
    expect(box.list()[0].payload.text).toBe('m0');
    // once one is received, a new item fits by trimming the received one, not a waiting one
    let first = true;
    await box.flush(async () => (first ? ((first = false), 202) : 503));
    expect(box.full()).toBe(false);
    expect(box.enqueue(mk(1000))).toBe(true);
    expect(box.list()).toHaveLength(OUTBOX_LIMIT);
    expect(box.waiting()).toHaveLength(OUTBOX_LIMIT);
    expect(box.list().every((i) => i.status === 'waiting')).toBe(true);
  });
});

describe('feedback transport + flush (R-705, mocked fetch)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const payload = (id = ID) => {
    const r = buildFeedback({ text: 'hi' }, ctx, { id });
    if (!r.ok) throw new Error('fixture');
    return r.payload;
  };
  const respond = (status: number, type = 'application/json') =>
    new Response(status === 204 ? null : '{}', { status, headers: { 'content-type': type } });
  const mockFetch = (impl: () => Promise<Response>) => {
    const f = vi.fn(impl);
    vi.stubGlobal('fetch', f);
    return f;
  };

  it('endpoint comes from build config; default is same-origin /api/feedback; "off" disables', () => {
    expect(DEFAULT_FEEDBACK_ENDPOINT).toBe('/api/feedback');
    expect(FEEDBACK_ENDPOINT).toBe('/api/feedback');
    expect(defaultTransport).not.toBeNull();
    expect(feedbackEndpoint({})).toBe('/api/feedback');
    expect(feedbackEndpoint({ VITE_FEEDBACK_ENDPOINT: 'https://x.test/fb' })).toBe(
      'https://x.test/fb',
    );
    expect(feedbackEndpoint({ VITE_FEEDBACK_ENDPOINT: 'off' })).toBeNull();
  });

  it('POSTs the C-16 JSON to the endpoint', async () => {
    const f = mockFetch(async () => respond(202));
    const p = payload();
    expect(await fetchTransport('/api/feedback')(p)).toBe(202);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/feedback');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual(p);
    expect(validateFeedback(body).ok).toBe(true);
  });

  it('2xx → received', async () => {
    mockFetch(async () => respond(201));
    const box = new Outbox(memoryStore());
    box.enqueue(payload());
    expect(await box.flush(fetchTransport('/api/feedback'))).toBe(1);
    expect(box.get(ID)).toMatchObject({ status: 'received', attempts: 1 });
    expect(box.get(ID)?.receivedAt).toBeTruthy();
  });

  it('5xx → waiting with backoff; throw (offline) → waiting', async () => {
    const t0 = new Date('2026-10-01T12:00:00Z');
    mockFetch(async () => respond(503));
    const box = new Outbox(memoryStore());
    box.enqueue(payload());
    expect(await box.flush(fetchTransport('/api/feedback'), { now: () => t0 })).toBe(0);
    expect(box.get(ID)).toMatchObject({ status: 'waiting', attempts: 1 });
    expect(Date.parse(box.get(ID)!.nextAttemptAt!)).toBe(t0.getTime() + BACKOFF_BASE_MS);
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await box.flush(fetchTransport('/api/feedback'), { now: () => t0 })).toBe(0);
    expect(box.get(ID)).toMatchObject({ status: 'waiting', attempts: 2 });
    expect(backoffMs(2)).toBe(2 * BACKOFF_BASE_MS);
    expect(backoffMs(99)).toBe(5 * 60_000);
  });

  it('200 duplicate → received; 400/413/415 → failed, never retried; 403/404 stay waiting', async () => {
    mockFetch(async () => respond(200));
    const dup = new Outbox(memoryStore());
    dup.enqueue(payload());
    expect(await dup.flush(fetchTransport('/api/feedback'))).toBe(1);
    expect(dup.get(ID)?.status).toBe('received');
    for (const code of [400, 413, 415]) {
      const f = mockFetch(async () => respond(code));
      const box = new Outbox(memoryStore());
      box.enqueue(payload());
      expect(await box.flush(fetchTransport('/api/feedback'))).toBe(0);
      expect(box.get(ID)).toMatchObject({ status: 'failed', failedStatus: code, attempts: 1 });
      expect(box.counts()).toEqual({ sent: 0, waiting: 0 });
      expect(await box.flush(fetchTransport('/api/feedback'))).toBe(0);
      expect(f).toHaveBeenCalledTimes(1);
    }
    for (const code of [403, 404, 500]) {
      mockFetch(async () => respond(code));
      const box = new Outbox(memoryStore());
      box.enqueue(payload());
      await box.flush(fetchTransport('/api/feedback'));
      expect(box.get(ID)?.status).toBe('waiting');
    }
  });

  it('a 2xx HTML page (SPA fallback, not the endpoint) is never counted as received', async () => {
    mockFetch(async () => respond(200, 'text/html; charset=utf-8'));
    const box = new Outbox(memoryStore());
    box.enqueue(payload());
    expect(await box.flush(fetchTransport('/api/feedback'))).toBe(0);
    expect(box.get(ID)?.status).toBe('waiting');
  });

  it('duplicate id → one POST (enqueue twice, overlapping flushes, then re-flush)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const f = mockFetch(async () => {
      await gate;
      return respond(202);
    });
    const store = memoryStore();
    const a = new Outbox(store);
    const b = new Outbox(store);
    a.enqueue(payload());
    a.enqueue(payload());
    const t = fetchTransport('/api/feedback');
    const p1 = a.flush(t);
    const p2 = b.flush(t);
    release();
    expect((await p1) + (await p2)).toBe(1);
    expect(await a.flush(t)).toBe(0);
    expect(f).toHaveBeenCalledTimes(1);
    expect(a.list()).toHaveLength(1);
    expect(a.get(ID)?.status).toBe('received');
  });

  it('due flush skips items still backing off; Send/online flush tries them', async () => {
    const t0 = new Date('2026-10-01T12:00:00Z');
    const box = new Outbox(memoryStore());
    box.enqueue(payload());
    await box.flush(async () => 500, { now: () => t0 });
    const calls = vi.fn(async () => 202);
    expect(await box.flush(calls, { now: () => t0, due: true })).toBe(0);
    expect(calls).not.toHaveBeenCalled();
    const later = new Date(t0.getTime() + BACKOFF_BASE_MS);
    expect(await box.flush(calls, { now: () => later, due: true })).toBe(1);
  });

  it('flusher: sends on app open, on `online`, and retries on the backoff timer', async () => {
    const listeners: Record<string, () => void> = {};
    const timers: (() => void)[] = [];
    const env: FlusherEnv = {
      addEventListener: (k, f) => void (listeners[k] = f),
      removeEventListener: (k) => void delete listeners[k],
      navigator: { onLine: true },
      setTimeout: (f) => timers.push(f),
      clearTimeout: () => {},
    };
    const store = memoryStore();
    const box = new Outbox(store);
    box.enqueue(payload());
    box.enqueue(payload('6f1d2c3e-9a8b-4c7d-8e6f-0a1b2c3d4e60'));
    let status = 503;
    const transport = vi.fn(async () => status);
    const stop = startFeedbackFlusher(box, transport, env);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2)); // app open
    await vi.waitFor(() => expect(timers.length).toBeGreaterThanOrEqual(1)); // retry scheduled
    expect(box.waiting()).toHaveLength(2);
    status = 202;
    listeners.online();
    await vi.waitFor(() => expect(box.waiting()).toHaveLength(0)); // online flush
    expect(box.counts()).toEqual({ sent: 2, waiting: 0 });
    stop();
    expect(listeners.online).toBeUndefined();
  });

  it('overlapping Send + flush never POSTs one id twice (status re-checked before POST)', async () => {
    const B = '6f1d2c3e-9a8b-4c7d-8e6f-0a1b2c3d4e61';
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const posted: string[] = [];
    const transport = vi.fn(async (p: { id: string }) => {
      posted.push(p.id);
      if (p.id === ID) await gate; // A is slow
      return 201;
    });
    const store = memoryStore();
    const box = new Outbox(store);
    box.enqueue(payload());
    box.enqueue(payload(B));
    const background = box.flush(transport); // A in flight, B next in its snapshot
    expect(box.nextDue()).toBe(0); // B waits; A (in flight) is not counted → no timer spin
    expect(await new Outbox(store).flush(transport, { ids: [B] })).toBe(1); // Send posts B
    release();
    expect(await background).toBe(1); // only A; B was settled meanwhile
    expect(posted.filter((x) => x === B)).toHaveLength(1);
    expect(box.counts()).toEqual({ sent: 2, waiting: 0 });
  });

  it('nextDue leaves out in-flight items (no setTimeout(0) spin)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const box = new Outbox(memoryStore());
    box.enqueue(payload());
    const p = box.flush(async () => (await gate, 201));
    expect(box.nextDue()).toBeUndefined();
    release();
    await p;
  });

  it('flusher re-arms the backoff timer after an online Send fails', async () => {
    const delays: number[] = [];
    const env: FlusherEnv = {
      addEventListener: () => {},
      removeEventListener: () => {},
      navigator: { onLine: true },
      setTimeout: (_f, ms) => delays.push(ms),
      clearTimeout: () => {},
    };
    const box = new Outbox(memoryStore());
    const stop = startFeedbackFlusher(box, async () => 201, env);
    await Promise.resolve();
    delays.length = 0; // nothing waiting at app open
    box.enqueue(payload());
    // S16 Send: online, the POST fails with 503
    await box.flush(async () => 503, { ids: [ID] });
    const last = delays[delays.length - 1];
    expect(last).toBeGreaterThan(BACKOFF_BASE_MS - 1000);
    expect(last).toBeLessThanOrEqual(BACKOFF_BASE_MS);
    stop();
  });

  it('flusher does nothing while offline or without storage', async () => {
    const transport = vi.fn(async () => 202);
    const env: FlusherEnv = {
      addEventListener: () => {},
      removeEventListener: () => {},
      navigator: { onLine: false },
      setTimeout: () => 0,
      clearTimeout: () => {},
    };
    const box = new Outbox(memoryStore());
    box.enqueue(payload());
    startFeedbackFlusher(box, transport, env)();
    startFeedbackFlusher(new Outbox(null), transport, { ...env, navigator: { onLine: true } })();
    await Promise.resolve();
    expect(transport).not.toHaveBeenCalled();
  });
});
