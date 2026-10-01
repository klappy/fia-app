import { useSyncExternalStore } from 'react';

// R-702: connectivity as the browser reports it — `navigator.onLine` plus the window
// `online` / `offline` events. No probing beyond those events (6B: bide). Without a
// navigator (tests, server render) the app counts as online.
export function onlineNow(nav: { onLine?: boolean } | undefined = globalThis.navigator): boolean {
  return nav?.onLine ?? true;
}

export function subscribeOnline(
  onChange: () => void,
  target: EventTarget | undefined = globalThis.window,
): () => void {
  if (!target) return () => undefined;
  target.addEventListener('online', onChange);
  target.addEventListener('offline', onChange);
  return () => {
    target.removeEventListener('online', onChange);
    target.removeEventListener('offline', onChange);
  };
}

const subscribe = (onChange: () => void) => subscribeOnline(onChange);
const snapshot = () => onlineNow();

/** True while the browser reports a connection; re-renders on `online` / `offline`. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Pack ids saved on this phone (C-07 `STATUS`); everything else needs a connection offline. */
export function savedPackIds(packs: { packId?: string; saved: boolean }[]): Set<string> {
  return new Set(packs.filter((p) => p.saved && p.packId).map((p) => p.packId as string));
}
