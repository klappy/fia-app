import { describe, expect, it } from 'vitest';
import { Outbox, OUTBOX_KEY, defaultTransport } from '../src/feedback/outbox';
import {
  buildFeedback,
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

describe('feedback outbox (stub transport)', () => {
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
  it('no endpoint yet: default transport is null and nothing is marked received', async () => {
    expect(defaultTransport).toBeNull();
    const box = new Outbox(memoryStore());
    box.enqueue(payload());
    expect(await box.flush(defaultTransport)).toBe(0);
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
