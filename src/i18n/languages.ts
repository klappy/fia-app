// The 17 Aquifer FIA languages (ALPHA-PRD R-103 / R-607). Autonym first, always; no flags.
// Codes are Aquifer three-letter codes (contracts: ^[a-z]{3}(-[A-Za-z]{2,8})?$).
export type Script = 'latin' | 'cyrillic' | 'devanagari' | 'arabic' | 'cjk-sc' | 'cjk-tc';

export interface Language {
  code: string;
  autonym: string;
  english: string;
  script: Script;
  dir: 'ltr' | 'rtl';
  /** BCP-47 tag for `lang` attributes and Intl APIs. */
  bcp47: string;
}

export const LANGUAGES: readonly Language[] = [
  { code: 'eng', autonym: 'English', english: 'English', script: 'latin', dir: 'ltr', bcp47: 'en' },
  { code: 'spa', autonym: 'Español', english: 'Spanish', script: 'latin', dir: 'ltr', bcp47: 'es' },
  {
    code: 'por',
    autonym: 'Português',
    english: 'Portuguese',
    script: 'latin',
    dir: 'ltr',
    bcp47: 'pt',
  },
  { code: 'fra', autonym: 'Français', english: 'French', script: 'latin', dir: 'ltr', bcp47: 'fr' },
  {
    code: 'ind',
    autonym: 'Bahasa Indonesia',
    english: 'Indonesian',
    script: 'latin',
    dir: 'ltr',
    bcp47: 'id',
  },
  {
    code: 'swh',
    autonym: 'Kiswahili',
    english: 'Swahili',
    script: 'latin',
    dir: 'ltr',
    bcp47: 'sw',
  },
  {
    code: 'tpi',
    autonym: 'Tok Pisin',
    english: 'Tok Pisin',
    script: 'latin',
    dir: 'ltr',
    bcp47: 'tpi',
  },
  { code: 'bis', autonym: 'Bislama', english: 'Bislama', script: 'latin', dir: 'ltr', bcp47: 'bi' },
  { code: 'hau', autonym: 'Hausa', english: 'Hausa', script: 'latin', dir: 'ltr', bcp47: 'ha' },
  {
    code: 'rus',
    autonym: 'Русский',
    english: 'Russian',
    script: 'cyrillic',
    dir: 'ltr',
    bcp47: 'ru',
  },
  {
    code: 'hin',
    autonym: 'हिन्दी',
    english: 'Hindi',
    script: 'devanagari',
    dir: 'ltr',
    bcp47: 'hi',
  },
  {
    code: 'nep',
    autonym: 'नेपाली',
    english: 'Nepali',
    script: 'devanagari',
    dir: 'ltr',
    bcp47: 'ne',
  },
  { code: 'arb', autonym: 'العربية', english: 'Arabic', script: 'arabic', dir: 'rtl', bcp47: 'ar' },
  { code: 'fas', autonym: 'فارسی', english: 'Persian', script: 'arabic', dir: 'rtl', bcp47: 'fa' },
  {
    code: 'apd',
    autonym: 'عربي سوداني',
    english: 'Sudanese Arabic',
    script: 'arabic',
    dir: 'rtl',
    bcp47: 'apd',
  },
  {
    code: 'zhs',
    autonym: '中文（简体）',
    english: 'Chinese (Simplified)',
    script: 'cjk-sc',
    dir: 'ltr',
    bcp47: 'zh-Hans',
  },
  {
    code: 'zht',
    autonym: '中文（繁體）',
    english: 'Chinese (Traditional)',
    script: 'cjk-tc',
    dir: 'ltr',
    bcp47: 'zh-Hant',
  },
];

export const languageByCode = (code: string): Language | undefined =>
  LANGUAGES.find((l) => l.code === code);
