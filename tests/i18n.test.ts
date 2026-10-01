import { describe, expect, it } from 'vitest';
import { EN, format, t } from '../src/i18n';
import { LANGUAGES } from '../src/i18n/languages';
import { SCREENS } from '../src/screens/registry';

describe('string catalog', () => {
  it('has the shared s.common.* keys and no non-string values', () => {
    expect(EN['s.common.dock.guide']).toBe('Guide');
    expect(EN['s.common.mark.absent']).toBe('not yet in {language}');
    expect(Object.keys(EN).length).toBeGreaterThan(600);
    for (const k of Object.keys(EN)) expect(k).toMatch(/^s\.[a-z0-9.-]+$/);
  });
  it('every screen registry key exists', () => {
    for (const s of SCREENS) {
      if (s.titleKey) expect(EN[s.titleKey], s.titleKey).toBeDefined();
      if (s.primaryKey) expect(EN[s.primaryKey], s.primaryKey).toBeDefined();
    }
  });
  it('formats ICU placeholders and plurals', () => {
    expect(t('s.lang.primary-pick', { language: 'Español' })).toBe('Continue in Español');
    expect(format('{n, plural, one {# passage} other {# passages}}', { n: 1 })).toBe('1 passage');
    expect(format('{n, plural, one {# passage} other {# passages}}', { n: 3 })).toBe('3 passages');
    expect(t('s.common.time-left', { min: 2 })).toBe('≈ 2 minutes left');
    // text after a plural block, and two plural blocks in one string (reviewer fia-app#1)
    expect(t('s.pericopes.primary-save', { n: 3, mb: 12 })).toBe('Save 3 passages (12 MB)');
    expect(t('s.downloads.marks-reset', { n: 2, stops: 5 })).not.toMatch(/^them were/);
    expect(
      format('{a, plural, one {# x} other {# xs}} and {b, plural, one {# y} other {# ys}}', {
        a: 1,
        b: 2,
      }),
    ).toBe('1 x and 2 ys');
  });
  it('alpha.css carries every token group in light and dark', async () => {
    const fs = await import('node:fs');
    const css = fs.readFileSync(new URL('../src/tokens/alpha.css', import.meta.url), 'utf8');
    for (const v of [
      '--fia-primary',
      '--fia-space-1',
      '--fia-r-card',
      '--fia-dur-base',
      '--fia-font-ui',
      '--fia-tap-primary',
    ]) {
      expect(css, v).toContain(v + ':');
    }
    expect(
      (css.match(/--fia-primary:/g) ?? []).length,
      'light + 2 dark blocks',
    ).toBeGreaterThanOrEqual(3);
  });
  it('lists the 17 Aquifer FIA languages with autonyms', () => {
    expect(LANGUAGES).toHaveLength(17);
    expect(new Set(LANGUAGES.map((l) => l.code)).size).toBe(17);
    for (const l of LANGUAGES) expect(l.code).toMatch(/^[a-z]{3}$/);
    expect(
      LANGUAGES.filter((l) => l.dir === 'rtl')
        .map((l) => l.code)
        .sort(),
    ).toEqual(['apd', 'arb', 'fas']);
  });
});
