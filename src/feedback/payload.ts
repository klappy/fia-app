// C-16 feedback payload (contracts/c16-feedback.schema.json 1.1.0). Built from what the person
// typed plus app context; validated before it is queued. No personal data beyond what is typed
// (R-905); contact is optional and anonymous by default (M19 pending → default 1).
import { C16, contracts, errorsText } from '../settings/contracts';

export type UserAgentClass = 'android-chrome' | 'ios-safari' | 'desktop' | 'other';

export interface FeedbackPayload {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  appVersion: string;
  uiLanguage: string;
  contentLanguage: string;
  packId?: string;
  unitId?: string;
  screen?: string;
  theme?: 'light' | 'dark';
  textSize?: 'system' | 'large' | 'max';
  lowLiteracy?: boolean;
  offline: boolean;
  installed?: boolean;
  text: string;
  contact?: string | null;
  screenshot?: { mime: 'image/png' | 'image/webp'; bytes: number; sha256: string };
  userAgentClass?: UserAgentClass;
}

export interface FeedbackContextInput {
  appVersion: string;
  uiLanguage: string;
  contentLanguage: string;
  packId?: string;
  unitId?: string;
  screen?: string;
  theme?: 'light' | 'dark';
  textSize?: 'system' | 'large' | 'max';
  lowLiteracy?: boolean;
  offline: boolean;
  installed?: boolean;
  userAgent?: string;
}

export interface FeedbackInput {
  text: string;
  contact?: string;
  screenshot?: FeedbackPayload['screenshot'];
}

export const TEXT_MAX = 4000;
export const CONTACT_MAX = 200;
export const SCREENSHOT_MAX = 2_000_000;

export function userAgentClass(ua = ''): UserAgentClass {
  if (!ua) return 'other';
  if (/Android/i.test(ua) && /Chrome\//.test(ua)) return 'android-chrome';
  if (/iPhone|iPad|iPod/.test(ua) && /Safari\//.test(ua) && !/CriOS|FxiOS/.test(ua))
    return 'ios-safari';
  if (/Windows NT|Macintosh|X11|Linux x86_64/.test(ua) && !/Mobile|Android/.test(ua))
    return 'desktop';
  return 'other';
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Short human reference shown on S16 (`Reference #{ref}`): first 4 hex of the id. */
export const refOf = (id: string) => id.replace(/-/g, '').slice(0, 4);

export type BuildResult =
  | { ok: true; payload: FeedbackPayload; dropped: string[] }
  | { ok: false; reason: 'need-text' | 'invalid'; errors: string[] };

/**
 * Build + validate. Text is trimmed and required; an over-long text is invalid (never silently
 * cut). A screenshot over 2 MB is dropped with `screenshot-dropped` (the text still sends).
 * Empty contact → null (anonymous).
 */
export function buildFeedback(
  input: FeedbackInput,
  ctx: FeedbackContextInput,
  opts: { id?: string; now?: Date } = {},
): BuildResult {
  const text = input.text.trim();
  if (!text) return { ok: false, reason: 'need-text', errors: ['text is empty'] };
  const dropped: string[] = [];
  const contact = input.contact?.trim() ? input.contact.trim() : null;
  const payload: FeedbackPayload = {
    schemaVersion: 1,
    id: opts.id ?? newId(),
    createdAt: (opts.now ?? new Date()).toISOString(),
    appVersion: ctx.appVersion,
    uiLanguage: ctx.uiLanguage,
    contentLanguage: ctx.contentLanguage,
    offline: ctx.offline,
    text,
    contact,
    userAgentClass: userAgentClass(ctx.userAgent),
  };
  for (const k of [
    'packId',
    'unitId',
    'screen',
    'theme',
    'textSize',
    'lowLiteracy',
    'installed',
  ] as const) {
    if (ctx[k] !== undefined) (payload as unknown as Record<string, unknown>)[k] = ctx[k];
  }
  if (input.screenshot) {
    if (input.screenshot.bytes > SCREENSHOT_MAX) dropped.push('screenshot');
    else payload.screenshot = input.screenshot;
  }
  const v = validateFeedback(payload);
  if (!v.ok) return { ok: false, reason: 'invalid', errors: v.errors };
  return { ok: true, payload, dropped };
}

export function validateFeedback(p: unknown): { ok: boolean; errors: string[] } {
  const r = contracts().validate(C16, p);
  return { ok: r.ok, errors: errorsText(r.errors) };
}
