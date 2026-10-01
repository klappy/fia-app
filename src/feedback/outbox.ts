// Feedback outbox (R-705, C-16). Items are queued locally, idempotent by C-16 `id`, and marked
// `received` only on a 2xx from the feedback endpoint. Send posts at once when online; anything
// still `waiting` is flushed on the `online` event, on app open, and on a backoff timer.
// C-16 names IndexedDB for the outbox; this train keeps it in the KeyValueStore seam
// (localStorage) until L2's storage layer lands.
import type { KeyValueStore } from '../settings/storage';
import { validateFeedback, type FeedbackPayload } from './payload';

export const OUTBOX_KEY = 'fia.feedback-outbox.v1';
export const OUTBOX_LIMIT = 50;

export interface OutboxItem {
  payload: FeedbackPayload;
  status: 'waiting' | 'received';
  queuedAt: string;
  receivedAt?: string;
  attempts: number;
  /** Earliest time an automatic (timer) retry may try again; Send / online / app open ignore it. */
  nextAttemptAt?: string;
}

/** A transport returns the HTTP status (or throws when offline). */
export type Transport = (p: FeedbackPayload) => Promise<number>;

/** Same-origin Worker route (C-16 endpoint, owner Otto). */
export const DEFAULT_FEEDBACK_ENDPOINT = '/api/feedback';

/**
 * Endpoint from build config: `VITE_FEEDBACK_ENDPOINT` (absolute URL or path); unset → the
 * same-origin default; `off` → no endpoint (nothing leaves the phone, every item stays waiting).
 */
export function feedbackEndpoint(
  env: Record<string, unknown> | undefined = import.meta.env,
): string | null {
  const v = env?.VITE_FEEDBACK_ENDPOINT;
  if (typeof v !== 'string' || !v.trim()) return DEFAULT_FEEDBACK_ENDPOINT;
  return v.trim() === 'off' ? null : v.trim();
}

export const FEEDBACK_ENDPOINT: string | null = feedbackEndpoint();

export const SEND_TIMEOUT_MS = 15_000;
export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

/** Delay before automatic retry `attempts + 1`: 5 s, 10 s, 20 s … capped at 5 min. */
export const backoffMs = (attempts: number) =>
  Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));

/**
 * POST the C-16 payload as JSON. The status is returned as-is, except that a 2xx HTML page (an
 * SPA fallback, not the endpoint) is reported as 404 so it is never counted as received.
 */
export function fetchTransport(endpoint: string, timeoutMs = SEND_TIMEOUT_MS): Transport {
  return async (p) => {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : undefined;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : undefined;
    try {
      const r = await globalThis.fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(p),
        credentials: 'omit',
        cache: 'no-store',
        signal: ctrl?.signal,
      });
      const html = /text\/html/i.test(r.headers?.get?.('content-type') ?? '');
      return r.ok && html ? 404 : r.status;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

/** Default transport: fetch to FEEDBACK_ENDPOINT; `null` when the build turned it `off`. */
export const defaultTransport: Transport | null = FEEDBACK_ENDPOINT
  ? fetchTransport(FEEDBACK_ENDPOINT)
  : null;

/** Ids being posted right now (any Outbox instance): the same id is never posted twice at once. */
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

/** Called after every outbox write (S16 re-renders "Your feedback"). Returns unsubscribe. */
export function onOutboxChange(f: () => void): () => void {
  listeners.add(f);
  return () => void listeners.delete(f);
}

/** Keep at most OUTBOX_LIMIT items by dropping the oldest `received` ones; `waiting` stay. */
function trimReceived(items: OutboxItem[]): OutboxItem[] {
  let extra = items.length - OUTBOX_LIMIT;
  if (extra <= 0) return items;
  return items.filter((i) => !(i.status === 'received' && extra-- > 0));
}

export class Outbox {
  constructor(private store: KeyValueStore | null) {}

  get persistent() {
    return this.store !== null;
  }

  list(): OutboxItem[] {
    if (!this.store) return [];
    try {
      const v = JSON.parse(this.store.getItem(OUTBOX_KEY) ?? '[]');
      return Array.isArray(v) ? (v as OutboxItem[]) : [];
    } catch {
      return [];
    }
  }

  get(id: string): OutboxItem | undefined {
    return this.list().find((i) => i.payload.id === id);
  }

  private write(items: OutboxItem[]): boolean {
    if (!this.store) return false;
    try {
      this.store.setItem(OUTBOX_KEY, JSON.stringify(trimReceived(items)));
    } catch {
      return false;
    }
    listeners.forEach((f) => f());
    return true;
  }

  /** Read-modify-write one item by id (synchronous, so concurrent flushes never clobber). */
  private patch(id: string, f: (i: OutboxItem) => void) {
    const items = this.list();
    const it = items.find((i) => i.payload.id === id);
    if (!it) return;
    f(it);
    this.write(items);
  }

  /** True when OUTBOX_LIMIT items are still waiting: nothing more can be queued until some send. */
  full(): boolean {
    return this.waiting().length >= OUTBOX_LIMIT;
  }

  /**
   * Queue a validated payload. Same id twice → one item. `false` = not queued (storage denied,
   * invalid, or the outbox is `full()`); an unsent item is never dropped to make room.
   */
  enqueue(p: FeedbackPayload, now = new Date()): boolean {
    if (!validateFeedback(p).ok) return false;
    const items = this.list();
    if (items.some((i) => i.payload.id === p.id)) return true;
    if (items.filter((i) => i.status === 'waiting').length >= OUTBOX_LIMIT) return false;
    items.push({ payload: p, status: 'waiting', queuedAt: now.toISOString(), attempts: 0 });
    return this.write(items);
  }

  waiting(): OutboxItem[] {
    return this.list().filter((i) => i.status === 'waiting');
  }

  /** Last `n` rows, newest first, for the S16 `yours` list and S15 `feedback-row`. */
  recent(n = 10): OutboxItem[] {
    return this.list().slice(-n).reverse();
  }

  counts() {
    const l = this.list();
    const sent = l.filter((i) => i.status === 'received').length;
    return { sent, waiting: l.length - sent };
  }

  /** When the next automatic retry is due (ms epoch), or `undefined` when nothing waits. */
  nextDue(): number | undefined {
    const due = this.waiting().map((i) => (i.nextAttemptAt ? Date.parse(i.nextAttemptAt) : 0));
    return due.length ? Math.min(...due) : undefined;
  }

  /**
   * Try waiting items, one POST per id; mark `received` only on 2xx, anything else stays
   * `waiting` with a backoff. `due: true` (the retry timer) skips items still backing off;
   * Send, `online` and app open try every waiting item. Without a transport nothing is sent.
   */
  async flush(
    transport: Transport | null,
    opts: { now?: () => Date; due?: boolean; ids?: string[] } = {},
  ): Promise<number> {
    if (!transport) return 0;
    const now = opts.now ?? (() => new Date());
    let delivered = 0;
    for (const it of this.waiting()) {
      const id = it.payload.id;
      if (opts.ids && !opts.ids.includes(id)) continue;
      if (inFlight.has(id)) continue;
      if (opts.due && it.nextAttemptAt && Date.parse(it.nextAttemptAt) > now().getTime()) continue;
      inFlight.add(id);
      let ok = false;
      try {
        const status = await transport(it.payload);
        ok = status >= 200 && status < 300;
      } catch {
        /* offline or network error: stays waiting */
      } finally {
        inFlight.delete(id);
      }
      this.patch(id, (i) => {
        i.attempts += 1;
        if (ok) {
          i.status = 'received';
          i.receivedAt = now().toISOString();
          delete i.nextAttemptAt;
        } else if (i.status === 'waiting') {
          i.nextAttemptAt = new Date(now().getTime() + backoffMs(i.attempts)).toISOString();
        }
      });
      if (ok) delivered += 1;
    }
    return delivered;
  }
}

export interface FlusherEnv {
  addEventListener(type: 'online' | 'offline', f: () => void): void;
  removeEventListener(type: 'online' | 'offline', f: () => void): void;
  navigator?: { onLine?: boolean };
  setTimeout(f: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

/**
 * Flush the outbox on app open and on every `online` event, then retry what is still waiting on
 * the backoff schedule while online. Returns a stop function.
 */
export function startFeedbackFlusher(
  outbox: Outbox,
  transport: Transport | null = defaultTransport,
  env: FlusherEnv = globalThis as unknown as FlusherEnv,
): () => void {
  if (!transport || !outbox.persistent) return () => {};
  let timer: unknown;
  let stopped = false;
  const isOnline = () => env.navigator?.onLine !== false;
  const schedule = () => {
    if (timer !== undefined) env.clearTimeout(timer);
    timer = undefined;
    const due = outbox.nextDue();
    if (stopped || due === undefined || !isOnline()) return;
    timer = env.setTimeout(() => void run(true), Math.max(0, due - Date.now()));
  };
  const run = async (due: boolean) => {
    if (stopped || !isOnline()) return;
    await outbox.flush(transport, { due });
    schedule();
  };
  const onOnline = () => void run(false);
  env.addEventListener('online', onOnline);
  void run(false);
  return () => {
    stopped = true;
    env.removeEventListener('online', onOnline);
    if (timer !== undefined) env.clearTimeout(timer);
  };
}
