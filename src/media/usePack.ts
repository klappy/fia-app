import { useEffect, useState } from 'react';

// Pack loader for the media screens. Packs are pipeline output (L1) served from the content
// origin (POC-REFERENCE A14), not the source tree. Base defaults to the app origin, so packs are
// read at their C-02 paths (`/packs/<id>/…`, shipped by the build from `data/packs/`); override
// with VITE_CONTENT_BASE. L2 (offline) serves the same URLs from the verified pack cache.
export const CONTENT_BASE: string = (import.meta.env.VITE_CONTENT_BASE as string | undefined) ?? '';

export const DEFAULT_PACK = 'eng.MRK-1-1-13';

export type Load<T> =
  { status: 'loading' } | { status: 'error'; retry: () => void } | { status: 'ready'; data: T };

export function packUrl(packId: string, file: string) {
  return `${CONTENT_BASE}/packs/${encodeURIComponent(packId)}/${file}.json`;
}

export function usePackFile<T>(packId: string, file: string): Load<T> {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<Load<T>>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    fetch(packUrl(packId, file))
      .then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => live && setState({ status: 'ready', data }))
      .catch(() => live && setState({ status: 'error', retry: () => setNonce((n) => n + 1) }));
    return () => {
      live = false;
    };
  }, [packId, file, nonce]);
  return state;
}

// Moved to src/offline/useOnline.ts (R-702); re-exported so screens keep their import.
export { useOnline } from '../offline/useOnline';

/** Language code from a pack id (`spa.MRK-1-1-13` → `spa`). */
export const packLanguage = (packId: string) => packId.split('.')[0];
