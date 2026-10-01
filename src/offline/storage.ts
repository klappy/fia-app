// Storage facts for S13 / SH-4 (R-703, R-311): quota estimate, persist request, and the
// "largest packs" list. Nothing here ever deletes: removal is only ever a person's tap.
import type { PackStatus } from './engine';

export interface StorageFacts {
  supported: boolean;
  usage?: number;
  quota?: number;
  persisted?: boolean;
}

interface StorageManagerLike {
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}

export async function readStorage(storage: StorageManagerLike | undefined): Promise<StorageFacts> {
  if (!storage?.estimate) return { supported: false };
  try {
    const { usage, quota } = await storage.estimate();
    const persisted = storage.persisted ? await storage.persisted() : undefined;
    return { supported: true, usage, quota, persisted };
  } catch {
    return { supported: false };
  }
}

/** R-703: request persistence before a save; the outcome is logged (Accept: "persist request logged"). */
export async function requestPersist(
  storage: StorageManagerLike | undefined,
  log: (line: string) => void = (l) => console.info(l),
): Promise<boolean | undefined> {
  if (!storage?.persist) {
    log('[fia-offline] storage.persist unavailable; eviction risk disclosed');
    return undefined;
  }
  try {
    const granted = await storage.persist();
    log(`[fia-offline] storage.persist requested: ${granted ? 'granted' : 'denied'}`);
    return granted;
  } catch {
    log('[fia-offline] storage.persist request failed');
    return undefined;
  }
}

export const freeBytes = (f: StorageFacts) =>
  f.quota !== undefined ? Math.max(0, f.quota - (f.usage ?? 0)) : undefined;

export type StorageWarning = 'space' | 'persist' | 'quota' | null;

/** Which SH-4 variant (if any) a save of `needed` bytes should raise first. */
export function storageWarningFor(needed: number, facts: StorageFacts): StorageWarning {
  const free = freeBytes(facts);
  if (free !== undefined && needed > free) return 'space';
  if (facts.supported && facts.persisted === false) return 'persist';
  return null;
}

export const isQuotaError = (message?: string) =>
  !!message && /quota|QuotaExceeded|no space|storage full/i.test(message);

/** Largest saved packs first (SH-4 list); never auto-removed. */
export function largestPacks(packs: PackStatus[], n = 3): PackStatus[] {
  return packs
    .filter((p) => p.state === 'saved' || p.state === 'update-available' || p.state === 'corrupt')
    .sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))
    .slice(0, n);
}

/** One-decimal megabytes for the UI (`{size} MB`); 0.1 MB floor so tiny packs never read 0. */
export function mb(bytes: number | undefined): string {
  if (!bytes) return '0';
  const v = bytes / 1_000_000;
  return v < 0.1 ? '0.1' : v < 10 ? v.toFixed(1) : String(Math.round(v));
}
