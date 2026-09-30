// Feedback outbox (R-705). Items are queued locally, idempotent by C-16 `id`, and marked
// `received` only on a 2xx from a transport. STUB: there is no feedback endpoint yet (C-16
// owner Otto), so the default transport never sends — every item stays `waiting` and S16 shows
// the honest "Queued" band. C-16 names IndexedDB for the outbox; this train keeps it in the
// KeyValueStore seam (localStorage) until L2's storage layer lands.
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
}

/** A transport returns the HTTP status (or throws when offline). */
export type Transport = (p: FeedbackPayload) => Promise<number>;

/** No feedback endpoint yet (C-16 owner: Otto) — stub. `null` = nothing leaves the phone. */
export const FEEDBACK_ENDPOINT: string | null = null;

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

  private write(items: OutboxItem[]): boolean {
    if (!this.store) return false;
    try {
      this.store.setItem(OUTBOX_KEY, JSON.stringify(items.slice(-OUTBOX_LIMIT)));
      return true;
    } catch {
      return false;
    }
  }

  /** Queue a validated payload. Same id twice → one item. `false` = cannot queue (storage denied). */
  enqueue(p: FeedbackPayload, now = new Date()): boolean {
    if (!validateFeedback(p).ok) return false;
    const items = this.list();
    if (items.some((i) => i.payload.id === p.id)) return true;
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

  /** Try every waiting item; mark `received` only on 2xx. Without a transport nothing is sent. */
  async flush(transport: Transport | null, now = () => new Date()): Promise<number> {
    if (!transport) return 0;
    const items = this.list();
    let delivered = 0;
    for (const it of items) {
      if (it.status !== 'waiting') continue;
      it.attempts += 1;
      try {
        const status = await transport(it.payload);
        if (status >= 200 && status < 300) {
          it.status = 'received';
          it.receivedAt = now().toISOString();
          delivered += 1;
        }
      } catch {
        /* offline or network error: stays waiting */
      }
    }
    this.write(items);
    return delivered;
  }
}

/** Default transport: none until FEEDBACK_ENDPOINT exists (stub). */
export const defaultTransport: Transport | null = null;
