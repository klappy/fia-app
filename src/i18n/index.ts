// String catalog loader. Keys are `s.<screen>.<key>` (cookbook design/alpha-screens/README.md).
// English is the source catalog (src/i18n/en.json, generated). Other UI languages are loaded
// lazily and are AI translations of the English until a human translation lands
// (`s.common.ui-lang-ai`); a missing key falls back to English, then to the key itself.
import en from './en.json';
import { languageByCode } from './languages';

export type Catalog = Record<string, string>;
export type Values = Record<string, string | number>;

const strip = (doc: Record<string, unknown>): Catalog =>
  Object.fromEntries(
    Object.entries(doc).filter(([k, v]) => k.startsWith('s.') && typeof v === 'string'),
  ) as Catalog;

export const EN: Catalog = strip(en as Record<string, unknown>);

const catalogs = new Map<string, Catalog>([['eng', EN]]);

/** Translated UI catalogs, each its own lazy chunk (AI translations of en.json, `s.common.ui-lang-ai`). */
const LOADERS: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  spa: () => import('./spa.json'),
};

/** True when `code` has its own UI catalog (English, or a lazy translated one). */
export const hasCatalog = (code: string): boolean => code === 'eng' || code in LOADERS;

/** Load a UI language catalog: `eng` is bundled, `spa` loads lazily; others resolve to English. */
export async function loadCatalog(code: string): Promise<Catalog> {
  const cached = catalogs.get(code);
  if (cached) return cached;
  const load = LOADERS[code];
  const catalog = load ? strip((await load()).default) : EN;
  catalogs.set(code, catalog);
  return catalog;
}

/** Intl locale for a UI language (plural rules): the BCP-47 tag from languages.ts, else English. */
export const localeFor = (code: string): string => languageByCode(code)?.bcp47 ?? 'en';

const PLURAL = /\{(\w+),\s*plural,\s*((?:[^{}]|\{[^{}]*\})*)\}/g;
const CLAUSE = /(\w+)\s*\{([^}]*)\}/g;

/** Minimal ICU: `{name}` substitution and `{n, plural, one {...} other {...}}` (English rules). */
export function format(template: string, values: Values = {}, locale = 'en'): string {
  let out = template.replace(PLURAL, (_m, name: string, clauses: string) => {
    const n = Number(values[name] ?? 0);
    const rules = new Intl.PluralRules(locale);
    const cat = rules.select(n);
    const table: Record<string, string> = {};
    for (const c of clauses.matchAll(CLAUSE)) table[c[1]] = c[2];
    const pick = table[`=${n}`] ?? table[cat] ?? table.other ?? '';
    return pick.replace(/#/g, String(n));
  });
  out = out.replace(/\{(\w+)\}/g, (m, name: string) => (name in values ? String(values[name]) : m));
  return out;
}

export interface Translator {
  (key: string, values?: Values, fallback?: string): string;
  has(key: string): boolean;
  lang: string;
}

export function makeT(catalog: Catalog, lang = 'eng', locale = 'en'): Translator {
  const t = ((key: string, values?: Values, fallback?: string) => {
    const raw = catalog[key] ?? EN[key] ?? fallback ?? key;
    return format(raw, values, locale);
  }) as Translator;
  t.has = (key) => key in catalog || key in EN;
  t.lang = lang;
  return t;
}

// The active UI language. Screens import `t` once; it reads whichever catalog is active now, and
// the app re-renders on a switch (App.tsx subscribes to `subscribeUiLanguage`).
let active: Translator = makeT(EN);
const listeners = new Set<() => void>();

/** The active UI language code (`eng` until a catalog is switched in). */
export const uiLanguage = (): string => active.lang;

export function subscribeUiLanguage(f: () => void): () => void {
  listeners.add(f);
  return () => void listeners.delete(f);
}

/**
 * Switch the UI language. A language with no catalog of its own shows English (the fallback),
 * so it switches to `eng` rather than claiming an AI translation that does not exist.
 */
export async function setUiLanguage(code: string): Promise<string> {
  const lang = hasCatalog(code) ? code : 'eng';
  const catalog = await loadCatalog(lang);
  if (active.lang !== lang) {
    active = makeT(catalog, lang, localeFor(lang));
    for (const f of listeners) f();
  }
  return lang;
}

export const t: Translator = Object.defineProperty(
  ((key: string, values?: Values, fallback?: string) =>
    active(key, values, fallback)) as Translator,
  'lang',
  { get: () => active.lang },
);
t.has = (key) => active.has(key);
