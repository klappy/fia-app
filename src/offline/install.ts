// Install controller (R-701), ported from the PoC `src/lib/install.js` (POC-REFERENCE § 7: PORT)
// with its tests. Installation is browser evidence, separate from verified pack storage: there is
// no persistent "installed" flag; `standalone` is read from the display mode each launch.

export type Platform = 'ios' | 'android' | 'desktop';

export interface InstallState {
  available: boolean;
  pending: boolean;
  accepted: boolean;
  standalone: boolean;
  error?: string;
}

interface PromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallHost {
  addEventListener(type: string, fn: (e: Event) => void): void;
  removeEventListener(type: string, fn: (e: Event) => void): void;
  matchMedia?: (q: string) => MediaQueryList | EventTarget | undefined;
  navigator?: { standalone?: boolean; userAgent?: string; maxTouchPoints?: number };
}

export class InstallController {
  state: InstallState;
  private listeners = new Set<() => void>();
  private promptEvent: PromptEvent | null = null;
  private media?: (EventTarget & { matches?: boolean }) | undefined;
  private host: InstallHost;

  constructor(host: InstallHost) {
    this.host = host;
    this.media = host.matchMedia?.('(display-mode: standalone)') as
      (EventTarget & { matches?: boolean }) | undefined;
    this.state = {
      available: false,
      pending: false,
      accepted: false,
      standalone: this.isStandalone(),
    };
    host.addEventListener('beforeinstallprompt', this.offer);
    host.addEventListener('appinstalled', this.installed);
    this.media?.addEventListener('change', this.mode);
  }

  private isStandalone() {
    return !!(this.media?.matches || this.host.navigator?.standalone);
  }
  private offer = (e: Event) => {
    e.preventDefault();
    this.promptEvent = e as PromptEvent;
    this.emit({ available: true, accepted: false });
  };
  private installed = () => {
    this.promptEvent = null;
    this.emit({ available: false, pending: false, accepted: true });
  };
  private mode = () => this.emit({ standalone: this.isStandalone() });

  private emit(value: Partial<InstallState>) {
    this.state = { ...this.state, ...value };
    for (const fn of this.listeners) fn();
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;

  /** Fires the browser's install prompt once; a dismissal never claims installation. */
  async install() {
    const event = this.promptEvent;
    if (!event || this.state.pending) return;
    this.promptEvent = null;
    this.emit({ available: false, pending: true, error: '' });
    try {
      await event.prompt();
      const result = await event.userChoice;
      this.emit({ pending: false, accepted: result.outcome === 'accepted' });
    } catch {
      this.emit({ pending: false, error: 'prompt-failed' });
    }
  }

  dispose() {
    this.host.removeEventListener('beforeinstallprompt', this.offer);
    this.host.removeEventListener('appinstalled', this.installed);
    this.media?.removeEventListener('change', this.mode);
    this.listeners.clear();
  }
}

/** Which assisted-install steps to show (S17). iPadOS reports a Mac UA with touch points. */
export function detectPlatform(nav: { userAgent?: string; maxTouchPoints?: number }): Platform {
  const ua = nav.userAgent ?? '';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1))
    return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

// Capture install events from initial module load, not only after the guide opens.
export const appInstall: InstallController | null =
  typeof window === 'undefined' ? null : new InstallController(window as unknown as InstallHost);
