// POST /api/feedback (R-705, C-16): takes a C-16 payload from the same origin, validates it
// against every shipped major, and stores it once per `id`. Routed by worker/index.ts.
import { validateV1, type StandaloneValidate } from './c16-validators.generated.js';

/** The slice of an R2 bucket this Worker uses (R2Bucket in @cloudflare/workers-types). */
export interface FeedbackBucket {
  head(key: string): Promise<unknown | null>;
  /** With `onlyIf` and a failed precondition, R2 returns null instead of the object. */
  put(
    key: string,
    value: string,
    options?: {
      onlyIf?: Headers;
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown | null>;
}

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** R2 bucket per environment (wrangler.jsonc). Absent → 503, the client keeps its outbox. */
  FEEDBACK?: FeedbackBucket;
}

export const FEEDBACK_PATH = '/api/feedback';
/** C-16 text ≤ 4000 code points (≤ 16 000 UTF-8 bytes) + contact ≤ 200 + context fields. */
export const MAX_BODY_BYTES = 32 * 1024;
const MAX_ERRORS = 10;
/** R2 caps customMetadata at 2 KiB in total; each value is cut well below that. */
const META_MAX = 64;
const STORAGE_DOWN = { error: 'storage-unavailable' };

/** Every C-16 major ever shipped, keyed by `schemaVersion` (queued items may be weeks old). */
const VALIDATORS: Record<number, StandaloneValidate> = { 1: validateV1 };

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...extra } });
}

/**
 * Same-origin only: no CORS headers are ever sent, and a request a browser marks as coming from
 * another origin is refused before the body is read. Browsers always send Origin on POST fetch.
 */
function sameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin');
  if (origin !== url.origin) return false;
  const site = request.headers.get('sec-fetch-site');
  return site === null || site === 'same-origin';
}

/** Read at most `limit` bytes; null when the body is larger (Content-Length may be absent). */
async function readCapped(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(buf);
}

/**
 * One id → one key. The C-16 `uuid` format (ajv-formats) is case-insensitive and also accepts an
 * optional `urn:uuid:` prefix, so both are normalized away: bare, lower-case uuid.
 */
export function canonicalId(id: string): string {
  return id.replace(/^urn:uuid:/i, '').toLowerCase();
}

export function feedbackKey(id: string): string {
  return `feedback/v1/${canonicalId(id)}.json`;
}

export async function handleFeedback(request: Request, env: Env, now = new Date()) {
  const url = new URL(request.url);
  if (!sameOrigin(request, url)) return json(403, { error: 'cross-origin' });
  if (request.method !== 'POST') return json(405, { error: 'method' }, { allow: 'POST' });

  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return json(415, { error: 'content-type' });

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return json(413, { error: 'too-large', max: MAX_BODY_BYTES });

  let raw: string | null;
  try {
    raw = await readCapped(request, MAX_BODY_BYTES);
  } catch {
    return json(400, { error: 'encoding' });
  }
  if (raw === null) return json(413, { error: 'too-large', max: MAX_BODY_BYTES });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json(400, { error: 'json' });
  }

  const major =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as { schemaVersion?: unknown }).schemaVersion
      : undefined;
  const validate = typeof major === 'number' ? VALIDATORS[major] : undefined;
  if (!validate) return json(400, { error: 'schemaVersion', accepted: Object.keys(VALIDATORS) });
  if (!validate(payload)) {
    // Paths and keywords only — never echo the submitted values (contact, text) back.
    const errors = (validate.errors ?? [])
      .slice(0, MAX_ERRORS)
      .map((e) => ({ path: e.instancePath, keyword: e.keyword }));
    return json(400, { error: 'invalid', errors });
  }

  const bucket = env.FEEDBACK;
  if (!bucket) return json(503, STORAGE_DOWN, { 'retry-after': '3600' });

  const p = payload as { id: string; schemaVersion: number; appVersion: string };
  const id = canonicalId(p.id);
  const key = feedbackKey(id);
  const duplicate = () => json(200, { id, status: 'duplicate' });
  const receivedAt = now.toISOString();
  try {
    // Fast path: a resend after reconnect finds the stored object and writes nothing.
    if (await bucket.head(key)) return duplicate();
    // Race-safe path: create-only put (If-None-Match: *). Two first sends of one id can both
    // miss head(); R2 lets exactly one put win and returns null to the other → duplicate.
    // Stored: the payload as validated + receive time. No IP, no user agent, no headers (R-905).
    const stored = await bucket.put(key, JSON.stringify({ receivedAt, payload }), {
      onlyIf: new Headers({ 'if-none-match': '*' }),
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        receivedAt,
        schemaVersion: String(p.schemaVersion),
        appVersion: p.appVersion.slice(0, META_MAX),
      },
    });
    if (stored === null) return duplicate();
  } catch {
    // R2 failure: a JSON 503 the client retries later, never an unhandled 500.
    return json(503, STORAGE_DOWN, { 'retry-after': '60' });
  }
  return json(201, { id, status: 'stored' });
}
