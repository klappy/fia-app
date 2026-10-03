// C-10 Settings (contracts/c10-settings.schema.json, key `fia.settings.v1`).
// Load → migrate PoC keys once → coerce unknown enums to defaults with a status line →
// validate → persist. Enum values are the contract; UI labels are not (R-313).
import { DEFAULT_SUBTITLE_MODE, type SubtitleMode } from '../media/provenance';
import { C10, contracts, errorsText } from './contracts';
import type { KeyValueStore } from './storage';

export const SETTINGS_KEY = 'fia.settings.v1';

export const NARRATION_MODES = ['source-fallback', 'source-only', 'generated-only'] as const;
export const MEDIA_TIERS = ['text', 'phone', 'medium', 'original'] as const;
export const TEXT_SIZES = ['system', 'large', 'max', 'huge'] as const;
export const THEMES = ['system', 'light', 'dark'] as const;
/** C-10 1.1.0 `subtitleMode` (FS-2): AI pericope subtitles shown (`generated`) or hidden (`off`). */
export const SUBTITLE_MODES = ['generated', 'off'] as const satisfies readonly SubtitleMode[];
export const DISCLOSURES = [
  'ai-narration',
  'ai-translation',
  'storage-eviction',
  'telemetry',
] as const;

export type NarrationMode = (typeof NARRATION_MODES)[number];
export type MediaTier = (typeof MEDIA_TIERS)[number];
export type TextSize = (typeof TEXT_SIZES)[number];
export type Theme = (typeof THEMES)[number];
export type Disclosure = (typeof DISCLOSURES)[number];
export type { SubtitleMode };

export interface Settings {
  schemaVersion: 1;
  narrationMode: NarrationMode;
  /** C-10 1.1.0; optional in the contract, always filled by normalizeSettings (default `off`). */
  subtitleMode: SubtitleMode;
  mediaTier: MediaTier;
  contentLanguage: string;
  uiLanguage: string;
  textSize: TextSize;
  lowLiteracy: boolean;
  theme: Theme;
  disclosuresPresented: Disclosure[];
  telemetryOptIn: boolean;
  savedAt?: string;
}

const LANG = /^[a-z]{3}(-[A-Za-z]{2,8})?$/;

/** Defaults: narration source-fallback (M3, R-501); subtitles off (PoC a5); telemetry off (C-10 test). */
export const DEFAULT_SETTINGS: Settings = Object.freeze({
  schemaVersion: 1,
  narrationMode: 'source-fallback',
  subtitleMode: DEFAULT_SUBTITLE_MODE,
  mediaTier: 'phone',
  contentLanguage: 'eng',
  uiLanguage: 'eng',
  textSize: 'system',
  lowLiteracy: false,
  theme: 'system',
  disclosuresPresented: [],
  telemetryOptIn: false,
}) as Settings;

/** PoC keys read once then removed (C-10 § Version + migration). */
export const POC_KEYS = {
  narration: 'fia.narration.v1',
  mediaQuality: 'fia.media-quality.v1',
  contentLanguage: 'fia-content-language-v1',
  disclosures: 'fia-disclosures-v1',
} as const;

/** One-time mapping table: PoC narration enum → C-10 (drops the backend name, R-313). */
export const POC_NARRATION_MAP: Record<string, NarrationMode> = {
  'aquifer-fallback': 'source-fallback',
  'aquifer-only': 'source-only',
  'ai-only': 'generated-only',
};

export interface LoadResult {
  settings: Settings;
  /** Status lines for coerced values ("unknown enum → default with a status line"). */
  notes: string[];
  migrated: boolean;
}

const pick = <T extends string>(
  allowed: readonly T[],
  v: unknown,
  fallback: T,
  field: string,
  notes: string[],
): T => {
  if (v === undefined) return fallback;
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
  notes.push(`${field}: unknown value ${JSON.stringify(v)} → ${fallback}`);
  return fallback;
};

const bool = (v: unknown, fallback: boolean, field: string, notes: string[]): boolean => {
  if (v === undefined) return fallback;
  if (typeof v === 'boolean') return v;
  notes.push(`${field}: not a boolean → ${fallback}`);
  return fallback;
};

const lang = (v: unknown, fallback: string, field: string, notes: string[]): string => {
  if (v === undefined) return fallback;
  if (typeof v === 'string' && LANG.test(v)) return v;
  notes.push(`${field}: not an Aquifer language code ${JSON.stringify(v)} → ${fallback}`);
  return fallback;
};

/** Coerce any stored object into a valid C-10 record; never throws. */
export function normalizeSettings(raw: unknown, base: Settings = DEFAULT_SETTINGS): LoadResult {
  const notes: string[] = [];
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (raw !== undefined && (raw === null || typeof raw !== 'object'))
    notes.push('settings: stored value is not an object → defaults');
  const disclosures = Array.isArray(r.disclosuresPresented)
    ? [
        ...new Set(
          r.disclosuresPresented.filter((d): d is Disclosure => {
            const ok = (DISCLOSURES as readonly unknown[]).includes(d);
            if (!ok) notes.push(`disclosuresPresented: dropped unknown ${JSON.stringify(d)}`);
            return ok;
          }),
        ),
      ]
    : [...base.disclosuresPresented];
  const settings: Settings = {
    schemaVersion: 1,
    narrationMode: pick(
      NARRATION_MODES,
      r.narrationMode,
      base.narrationMode,
      'narrationMode',
      notes,
    ),
    subtitleMode: pick(SUBTITLE_MODES, r.subtitleMode, base.subtitleMode, 'subtitleMode', notes),
    mediaTier: pick(MEDIA_TIERS, r.mediaTier, base.mediaTier, 'mediaTier', notes),
    contentLanguage: lang(r.contentLanguage, base.contentLanguage, 'contentLanguage', notes),
    uiLanguage: lang(r.uiLanguage, base.uiLanguage, 'uiLanguage', notes),
    textSize: pick(TEXT_SIZES, r.textSize, base.textSize, 'textSize', notes),
    lowLiteracy: bool(r.lowLiteracy, base.lowLiteracy, 'lowLiteracy', notes),
    theme: pick(THEMES, r.theme, base.theme, 'theme', notes),
    disclosuresPresented: disclosures,
    telemetryOptIn: bool(r.telemetryOptIn, false, 'telemetryOptIn', notes),
  };
  if (typeof r.savedAt === 'string' && !Number.isNaN(Date.parse(r.savedAt)))
    settings.savedAt = r.savedAt;
  return { settings, notes, migrated: false };
}

export function validateSettings(s: unknown): { ok: boolean; errors: string[] } {
  const r = contracts().validate(C10, s);
  return { ok: r.ok, errors: errorsText(r.errors) };
}

function readPoc(store: KeyValueStore): { patch: Record<string, unknown>; found: boolean } {
  const patch: Record<string, unknown> = {};
  let found = false;
  const narration = store.getItem(POC_KEYS.narration);
  if (narration !== null) {
    found = true;
    const v = narration.replace(/^"|"$/g, '');
    if (POC_NARRATION_MAP[v]) patch.narrationMode = POC_NARRATION_MAP[v];
  }
  const tier = store.getItem(POC_KEYS.mediaQuality);
  if (tier !== null) {
    found = true;
    const v = tier.replace(/^"|"$/g, '');
    if ((MEDIA_TIERS as readonly string[]).includes(v)) patch.mediaTier = v;
  }
  const cl = store.getItem(POC_KEYS.contentLanguage);
  if (cl !== null) {
    found = true;
    const v = cl.replace(/^"|"$/g, '');
    if (LANG.test(v)) patch.contentLanguage = v;
  }
  const disc = store.getItem(POC_KEYS.disclosures);
  if (disc !== null) {
    found = true;
    try {
      const v = JSON.parse(disc);
      if (Array.isArray(v)) patch.disclosuresPresented = v;
    } catch {
      /* unreadable PoC value: dropped, defaults stand */
    }
  }
  return { patch, found };
}

/** Load `fia.settings.v1`, migrating PoC keys once (read, then removed). Never throws. */
export function loadSettings(store: KeyValueStore | null): LoadResult {
  if (!store) return { settings: { ...DEFAULT_SETTINGS }, notes: [], migrated: false };
  let raw: unknown = undefined;
  let text: string | null = null;
  try {
    text = store.getItem(SETTINGS_KEY);
  } catch {
    text = null;
  }
  const notes: string[] = [];
  if (text !== null) {
    try {
      raw = JSON.parse(text);
    } catch {
      notes.push('settings: stored value is not JSON → defaults');
    }
  }
  const poc = text === null ? readPoc(store) : { patch: {}, found: false };
  const res = normalizeSettings(raw === undefined && poc.found ? poc.patch : raw);
  res.notes.unshift(...notes);
  if (poc.found) {
    res.migrated = true;
    for (const k of Object.values(POC_KEYS)) store.removeItem(k);
    saveSettings(store, res.settings);
  }
  return res;
}

export type SaveResult = { ok: true; settings: Settings } | { ok: false; errors: string[] };

/** Validate against C-10, stamp savedAt, persist. `ok:false` → S14 shows `s.settings.save-failed`. */
export function saveSettings(
  store: KeyValueStore | null,
  s: Settings,
  now: () => Date = () => new Date(),
): SaveResult {
  const next: Settings = { ...s, savedAt: now().toISOString() };
  const v = validateSettings(next);
  if (!v.ok) return { ok: false, errors: v.errors };
  if (!store) return { ok: false, errors: ['storage unavailable'] };
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch (e) {
    return { ok: false, errors: [String(e)] };
  }
  return { ok: true, settings: next };
}

/**
 * S14 Text size (PRD § 8.5; mock 14-settings): Follows phone · Larger · Largest · Huge, the
 * 100 / 150 / 200 / 310% steps. C-10 `textSize` system|large|max|huge, one target per value, so a
 * stored value always reads back as the target that set it (F6-S14 added `huge`; scales in apply.ts).
 */
export const TEXT_STEPS: readonly TextSize[] = TEXT_SIZES;

/** Easy mode on → text steps to +2 at once (S14 states: Easy mode on). */
export function applyEasyMode(s: Settings, on: boolean): Settings {
  return { ...s, lowLiteracy: on, textSize: on && s.textSize === 'system' ? 'large' : s.textSize };
}
