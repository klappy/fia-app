// Spanish UI catalog (cookbook work/active/2026-10-03-fia-spanish-ui-strings, DoD 1–3):
// key parity, placeholder parity and plural-clause parity with the English source, and the lazy
// switch of the active UI language.
import { afterAll, describe, expect, it } from 'vitest';
import { EN, hasCatalog, loadCatalog, setUiLanguage, t, uiLanguage } from '../src/i18n';
import spaDoc from '../src/i18n/spa.json';

const SPA = Object.fromEntries(
  Object.entries(spaDoc as Record<string, unknown>).filter(([k]) => k.startsWith('s.')),
) as Record<string, string>;

const PLURAL = /\{(\w+),\s*plural,\s*((?:[^{}]|\{[^{}]*\})*)\}/g;
const CLAUSE = /(=?\w+)\s*\{/g;

/** `{name}` placeholders outside plural blocks plus plural-block names, as a sorted multiset. */
function placeholders(s: string): string[] {
  const names: string[] = [];
  const rest = s.replace(PLURAL, (_m, name: string) => {
    names.push(`${name}#plural`);
    return '';
  });
  for (const m of rest.matchAll(/\{(\w+)\}/g)) names.push(m[1]);
  return names.sort();
}

/** Each plural block as `name:clause,clause` (clause keywords in order), plus inner placeholders. */
function plurals(s: string): string[] {
  return [...s.matchAll(PLURAL)].map((m) => {
    const clauses = [...m[2].matchAll(CLAUSE)].map((c) => c[1]);
    const inner = [...m[2].replace(/\w+\s*\{/g, '').matchAll(/\{(\w+)\}/g)].map((c) => c[1]);
    return `${m[1]}:${clauses.join(',')}|${inner.sort().join(',')}`;
  });
}

describe('Spanish UI catalog (spa.json)', () => {
  afterAll(async () => {
    await setUiLanguage('eng');
  });

  it('has exactly the English keys, every value a non-empty string', () => {
    expect(Object.keys(SPA).sort()).toEqual(Object.keys(EN).sort());
    for (const [k, v] of Object.entries(SPA)) {
      expect(typeof v, k).toBe('string');
      expect(v.trim().length, k).toBeGreaterThan(0);
    }
  });

  it('keeps every {placeholder} of the English', () => {
    for (const k of Object.keys(EN)) expect(placeholders(SPA[k]), k).toEqual(placeholders(EN[k]));
  });

  it('keeps every ICU plural block, its clauses and the # marker', () => {
    for (const k of Object.keys(EN)) {
      expect(plurals(SPA[k]), k).toEqual(plurals(EN[k]));
      const hashes = (s: string) => (s.match(/#(?![a-z0-9{])/gi) ?? []).length;
      expect(hashes(SPA[k]) > 0, k).toBe(hashes(EN[k]) > 0);
    }
  });

  it('is a translation, not a copy of the English', () => {
    const same = Object.keys(EN).filter((k) => SPA[k] === EN[k]);
    // Pure-placeholder strings, units and names stay the same; prose must not.
    expect(same.length).toBeLessThan(Object.keys(EN).length * 0.1);
  });

  it('loads lazily and switches the active UI language, with Spanish plural rules', async () => {
    expect(hasCatalog('spa')).toBe(true);
    expect(hasCatalog('fra')).toBe(false);
    expect((await loadCatalog('spa'))['s.common.dock.guide']).toBe('Guía');
    expect(await setUiLanguage('spa')).toBe('spa');
    expect(uiLanguage()).toBe('spa');
    expect(t.lang).toBe('spa');
    expect(t('s.lang.primary-pick', { language: 'Español' })).toBe('Continuar en Español');
    expect(t('s.common.time-left', { min: 1 })).toBe('Quedan ≈ 1 minuto');
    expect(t('s.common.time-left', { min: 5 })).toBe('Quedan ≈ 5 minutos');
    // Intl 'es' puts 1 000 000 in `many`; the table falls back to `other`.
    expect(t('s.pericopes.parts', { n: 1000000 })).toBe('1000000 partes');
    expect(t('s.pericopes.primary-save', { n: 3, mb: 12 })).toBe('Guardar 3 pasajes (12 MB)');
  });

  it('a language with no catalog shows English menus (no false AI-translation claim)', async () => {
    expect(await setUiLanguage('fra')).toBe('eng');
    expect(t('s.common.dock.guide')).toBe('Guide');
  });
});
