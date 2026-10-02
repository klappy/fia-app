import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  POC_KEYS,
  SETTINGS_KEY,
  TEXT_STEPS,
  applyEasyMode,
  loadSettings,
  normalizeSettings,
  saveSettings,
  validateSettings,
} from '../src/settings/settings';
import { memoryStore } from '../src/settings/storage';

// contracts.settings.test (ALPHA-CONTRACTS C-10 § Test) + S14 persistence (R-706).
describe('C-10 settings', () => {
  it('defaults validate; narration source-fallback; telemetry off', () => {
    expect(validateSettings(DEFAULT_SETTINGS).ok).toBe(true);
    expect(DEFAULT_SETTINGS.narrationMode).toBe('source-fallback');
    expect(DEFAULT_SETTINGS.telemetryOptIn).toBe(false);
  });
  it('unknown enum value → default with a status line', () => {
    const r = normalizeSettings({
      narrationMode: 'aquifer-only',
      theme: 'neon',
      textSize: 'giant',
    });
    expect(r.settings.narrationMode).toBe('source-fallback');
    expect(r.settings.theme).toBe('system');
    expect(r.settings.textSize).toBe('system');
    expect(r.notes).toHaveLength(3);
    expect(r.notes[0]).toMatch(/narrationMode: unknown value "aquifer-only"/);
    expect(validateSettings(r.settings).ok).toBe(true);
  });
  it('rejects two-letter language tags, keeps Aquifer codes', () => {
    const r = normalizeSettings({ contentLanguage: 'es', uiLanguage: 'zhs' });
    expect(r.settings.contentLanguage).toBe('eng');
    expect(r.settings.uiLanguage).toBe('zhs');
    expect(r.notes.join()).toMatch(/contentLanguage/);
  });
  it('save → load round-trips through fia.settings.v1 and stamps savedAt', () => {
    const store = memoryStore();
    const s = {
      ...DEFAULT_SETTINGS,
      narrationMode: 'source-only' as const,
      theme: 'dark' as const,
    };
    const saved = saveSettings(store, s, () => new Date('2026-10-01T12:00:00Z'));
    expect(saved.ok).toBe(true);
    const back = loadSettings(store);
    expect(back.notes).toEqual([]);
    expect(back.settings).toMatchObject({ narrationMode: 'source-only', theme: 'dark' });
    expect(back.settings.savedAt).toBe('2026-10-01T12:00:00.000Z');
    expect(JSON.parse(store.dump()[SETTINGS_KEY]).schemaVersion).toBe(1);
  });
  it('refuses to persist an invalid record (save-failed path)', () => {
    const store = memoryStore();
    const bad = { ...DEFAULT_SETTINGS, mediaTier: 'ultra' } as unknown as typeof DEFAULT_SETTINGS;
    const r = saveSettings(store, bad);
    expect(r.ok).toBe(false);
    expect(store.dump()[SETTINGS_KEY]).toBeUndefined();
  });
  it('storage denied → defaults, save reports failure, app continues', () => {
    expect(loadSettings(null).settings).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(null, DEFAULT_SETTINGS).ok).toBe(false);
  });
  it('corrupt JSON → defaults with a status line', () => {
    const r = loadSettings(memoryStore({ [SETTINGS_KEY]: '{nope' }));
    expect(r.settings.narrationMode).toBe('source-fallback');
    expect(r.notes[0]).toMatch(/not JSON/);
  });
  it('migrates PoC keys once (mapping table), then removes them', () => {
    const store = memoryStore({
      [POC_KEYS.narration]: 'ai-only',
      [POC_KEYS.mediaQuality]: 'medium',
      [POC_KEYS.contentLanguage]: 'spa',
      [POC_KEYS.disclosures]: '["ai-narration","bogus"]',
    });
    const r = loadSettings(store);
    expect(r.migrated).toBe(true);
    expect(r.settings).toMatchObject({
      narrationMode: 'generated-only',
      mediaTier: 'medium',
      contentLanguage: 'spa',
      disclosuresPresented: ['ai-narration'],
    });
    for (const k of Object.values(POC_KEYS)) expect(store.dump()[k]).toBeUndefined();
    expect(loadSettings(store).migrated).toBe(false);
    expect(loadSettings(store).settings.narrationMode).toBe('generated-only');
  });
  it('text-size stepper has one target per C-10 enum value', () => {
    expect(TEXT_STEPS).toEqual(['system', 'large', 'max', 'huge']);
  });
  it('Easy mode steps text up at once and sets lowLiteracy', () => {
    const on = applyEasyMode(DEFAULT_SETTINGS, true);
    expect(on).toMatchObject({ lowLiteracy: true, textSize: 'large' });
    expect(applyEasyMode({ ...DEFAULT_SETTINGS, textSize: 'max' }, true).textSize).toBe('max');
  });
});

describe('startup applies saved display settings (review fia-app#5 finding 3)', () => {
  it('main.tsx applies loaded settings before the first render', async () => {
    const fs = await import('node:fs');
    const main = fs.readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
    const apply = main.indexOf('applyToDocument(loadSettings(browserStore()).settings)');
    expect(apply).toBeGreaterThan(-1);
    expect(apply).toBeLessThan(main.indexOf('createRoot('));
  });
  it('a saved dark / max / Easy setting lands on the root element', async () => {
    const { applyToDocument } = await import('../src/settings/apply');
    const store = memoryStore();
    saveSettings(store, { ...DEFAULT_SETTINGS, theme: 'dark', textSize: 'max', lowLiteracy: true });
    const attrs = new Map<string, string>();
    const root = {
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      removeAttribute: (k: string) => void attrs.delete(k),
      toggleAttribute: (k: string, on: boolean) => void (on ? attrs.set(k, '') : attrs.delete(k)),
    } as unknown as HTMLElement;
    applyToDocument(loadSettings(store).settings, root);
    expect(attrs.get('data-theme')).toBe('dark');
    expect(attrs.get('data-text-step')).toBe('x200');
    expect(attrs.has('data-low-literacy')).toBe(true);
  });
});
