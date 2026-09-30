// String catalog loader. Keys are `s.<screen>.<key>` (cookbook design/alpha-screens/README.md).
// English is the source catalog (src/i18n/en.json, generated). Other UI languages are loaded
// lazily and are AI translations of the English until a human translation lands
// (`s.common.ui-lang-ai`); a missing key falls back to English, then to the key itself.
import en from './en.json';

export type Catalog = Record<string, string>;
export type Values = Record<string, string | number>;

const strip = (doc: Record<string, unknown>): Catalog =>
  Object.fromEntries(
    Object.entries(doc).filter(([k, v]) => k.startsWith('s.') && typeof v === 'string'),
  ) as Catalog;

export const EN: Catalog = strip(en as Record<string, unknown>);

const catalogs = new Map<string, Catalog>([['eng', EN]]);

/** Load a UI language catalog. Only `eng` is bundled in this train; others resolve to English. */
export async function loadCatalog(code: string): Promise<Catalog> {
  const cached = catalogs.get(code);
  if (cached) return cached;
  // Follow-on lane: `import(`./${code}.json`)` once translated catalogs exist.
  catalogs.set(code, EN);
  return EN;
}

const PLURAL = /\{(\w+),\s*plural,\s*(.*)\}/s;
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

export const t = makeT(EN);
