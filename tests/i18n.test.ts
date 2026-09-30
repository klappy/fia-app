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
