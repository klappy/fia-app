// Page side of the C-07 protocol: one store for the Downloads screen, the sheets and the version
// banner. Rewritten from the PoC `OfflineController` (POC-REFERENCE § 7: KNOWLEDGE) against the
// ported worker with pack ids. Works without a worker (dev, tests, unsupported browser): every
// action then reports `unavailable` honestly instead of pretending to save.
import type { OfflineRequest, PackStatus } from './engine';
import type { NarrationMode, Tier } from './manifest';
import { readStorage, requestPersist, type StorageFacts } from './storage';

export interface Progress {
  packId: string;
  bytes: number;
  total: number;
  files: number;
  /** Files in the pack (m of "n of m"). */
  count?: number;
}

export interface OfflineState {
  supported: boolean;
  ready: boolean;
  online: boolean;
  packs: PackStatus[];
  progress: Progress | null;
  saving: string | null;
  error: string;
  /** A new app version is installed and waiting for the person's Reload (R-704). */
  updateReady: boolean;
  storage: StorageFacts;
  /** packId → revision the person declined (R-310 "remembered per revision"). */
  declined: Record<string, string>;
}

interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
}
interface RegistrationLike {
  active?: WorkerLike | null;
  waiting?: WorkerLike | null;
  installing?: (WorkerLike & EventTarget & { state?: string }) | null;
  addEventListener(type: 'updatefound', fn: () => void): void;
  update?: () => Promise<unknown>;
}
export interface ContainerLike {
  register(url: string, opts?: RegistrationOptions): Promise<RegistrationLike>;
  controller?: WorkerLike | null;
  addEventListener(type: string, fn: (e: MessageEvent) => void): void;
}

/** R-310: offer a content update only when its live revision was not declined ("Keep"). */
export function offersUpdate(
  p: Pick<PackStatus, 'packId' | 'updateAvailable' | 'liveRevision'>,
  declined: Record<string, string>,
): boolean {
  return !!p.updateAvailable && !(p.packId && declined[p.packId] === p.liveRevision);
}

const DECLINED_KEY = 'fia.offline.declined.v1';
function loadDeclined(): Record<string, string> {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(DECLINED_KEY) ?? '{}') as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}
function storeDeclined(v: Record<string, string>) {
  try {
    globalThis.localStorage?.setItem(DECLINED_KEY, JSON.stringify(v));
  } catch {
    /* storage failure is a status, not an error */
  }
}

export class OfflineClient {
  state: OfflineState;
  private listeners = new Set<() => void>();
  private reg: RegistrationLike | null = null;
  private jobId: string | null = null;
  private container?: ContainerLike;
  private storageManager?: StorageManager;
  private reload: () => void;

  constructor(
    opts: {
      container?: ContainerLike;
      storage?: StorageManager;
      online?: boolean;
      reload?: () => void;
    } = {},
  ) {
    this.container = opts.container;
    this.storageManager = opts.storage;
    this.reload = opts.reload ?? (() => globalThis.location?.reload());
    this.state = {
      supported: !!opts.container,
      ready: false,
      online: opts.online ?? true,
      packs: [],
      progress: null,
      saving: null,
      error: '',
      updateReady: false,
      storage: { supported: false },
      declined: loadDeclined(),
    };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  private emit(v: Partial<OfflineState>) {
    this.state = { ...this.state, ...v };
    for (const fn of this.listeners) fn();
  }

  setOnline(online: boolean) {
    this.emit({ online });
  }

  /** Production only (src/main.tsx): register `/sw.js` and watch for a waiting update. */
  async register(url = '/sw.js') {
    if (!this.container) return;
    try {
      const reg = await this.container.register(url, { scope: '/' });
      this.reg = reg;
      const watch = () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          // A waiting worker while a controller exists = a new version, not the first install.
          if (w.state === 'installed' && this.container?.controller)
            this.emit({ updateReady: true });
        });
      };
      if (reg.waiting && this.container.controller) this.emit({ updateReady: true });
      reg.addEventListener('updatefound', watch);
      watch(); // a worker already installing when register() resolved
      this.container.addEventListener('message', (e: MessageEvent) => {
        const d = e.data as { type?: string; packId?: string; error?: string } | undefined;
        if (d?.type === 'CACHE_ERROR') {
          this.emit({ error: d.error ?? 'CACHE_ERROR' });
          void this.refresh();
        }
      });
      let reloading = false;
      this.container.addEventListener('controllerchange', () => {
        if (reloading || !this.state.updateReady) return;
        reloading = true;
        this.reload();
      });
      this.emit({ ready: true });
      await this.refresh();
    } catch (e) {
      this.emit({ error: (e as Error).message });
    }
  }

  private worker(): WorkerLike | null {
    return this.container?.controller ?? this.reg?.active ?? null;
  }

  request(msg: OfflineRequest, onProgress?: (p: Progress) => void): Promise<PackStatus> {
    const worker = this.worker();
    if (!worker) return Promise.reject(new Error('unavailable'));
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (e: MessageEvent) => {
        const d = e.data as (PackStatus & { progress?: true }) | Progress;
        if ('progress' in d && d.progress === true) {
          onProgress?.(d as unknown as Progress);
          return;
        }
        channel.port1.close();
        resolve(d as PackStatus);
      };
      worker.postMessage(msg, [channel.port2]);
    });
  }

  async refresh() {
    const storage = await readStorage(this.storageManager);
    try {
      const all = (await this.request({ type: 'STATUS' })) as PackStatus & {
        packs?: PackStatus[];
      };
      this.emit({ packs: all.packs ?? [], storage });
    } catch {
      this.emit({ storage });
    }
  }

  async save(packId: string, tier: Tier, narration: NarrationMode): Promise<PackStatus | null> {
    if (this.state.saving) return null;
    await requestPersist(this.storageManager);
    const id = globalThis.crypto.randomUUID();
    this.jobId = id;
    this.emit({ saving: packId, progress: { packId, bytes: 0, total: 0, files: 0 }, error: '' });
    try {
      const done = await this.request({ type: 'SAVE', packId, tier, narration, id }, (p) =>
        this.emit({ progress: { ...p, packId } }),
      );
      this.emit({ error: done.error ?? '' });
      return done;
    } catch (e) {
      this.emit({ error: (e as Error).message });
      return null;
    } finally {
      this.jobId = null;
      // Stay in the saving (verifying) state until STATUS lands, so the row never flashes an
      // enabled Save between the last file and "✓ Saved".
      try {
        await this.refresh();
      } finally {
        this.emit({ saving: null, progress: null });
      }
    }
  }

  cancel() {
    this.worker()?.postMessage({ type: 'CANCEL', id: this.jobId ?? undefined });
  }

  /** Explicit removal only (R-311): called from a confirmed "Remove" tap, never automatically. */
  async remove(packId: string) {
    try {
      const done = await this.request({ type: 'DELETE', packId });
      this.emit({ error: done.error ?? '' });
    } finally {
      await this.refresh();
    }
  }

  decline(packId: string, revision: string) {
    const declined = { ...this.state.declined, [packId]: revision };
    storeDeclined(declined);
    this.emit({ declined });
  }

  /** R-704: apply the waiting version only on the person's tap; the page reloads on takeover. */
  applyUpdate() {
    const waiting = this.reg?.waiting;
    if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
    else this.reload();
  }
}

/** `spa.MRK-1-1-13` → `MRK 1:1–13`; `GEN-1-1-2-3` → `GEN 1:1–2:3`. Display fallback only. */
export function packRef(packId: string): string {
  const per = packId.split('.')[1] ?? packId;
  const [book, ...n] = per.split('-');
  if (n.length === 2) return `${book} ${n[0]}:${n[1]}`;
  if (n.length === 3) return `${book} ${n[0]}:${n[1]}–${n[2]}`;
  if (n.length === 4) return `${book} ${n[0]}:${n[1]}–${n[2]}:${n[3]}`;
  return per;
}

export const offline = new OfflineClient({
  container:
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? (navigator.serviceWorker as unknown as ContainerLike)
      : undefined,
  storage: typeof navigator !== 'undefined' ? navigator.storage : undefined,
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
});

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => offline.setOnline(true));
  window.addEventListener('offline', () => offline.setOnline(false));
}
