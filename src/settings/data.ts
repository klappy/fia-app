// Where the shell reads pipeline output (L1 `data/`): catalog (C-03), per-language counts, rights
// (C-13). Base is configurable because the serving path is not settled yet (L1/L2 decide).
const BASE = (import.meta.env?.VITE_FIA_DATA_BASE as string | undefined) ?? '/data';

export const DATA_PATHS = {
  catalog: `${BASE}/catalog/manifest.json`,
  languageCounts: (code: string) => `${BASE}/catalog/${code}.json`,
  rights: `${BASE}/rights/records.json`,
};

export async function fetchJson(url: string, f: typeof fetch = fetch): Promise<unknown> {
  const res = await f(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}
