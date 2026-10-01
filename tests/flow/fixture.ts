// Checked-in L1 sample (alpha/l1-pipeline @76ec277): a C-03 manifest cut to eng/spa/arb × Mark 1
// and James 1, and the full eng Mark 1:1–13 pack guide (the R-409 regression sample).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCatalog, type FetchJson } from '../../src/flow/catalog';

const root = join(process.cwd(), 'tests/fixtures/flow');

export const fixtureFetch: FetchJson = async (url) => {
  const path = url.replace(/^\/data\//, '');
  const file =
    path === 'catalog/manifest.json' ? 'catalog-manifest.json' : path.replace(/^packs\//, '');
  return JSON.parse(readFileSync(join(root, file), 'utf8'));
};

export const fixtureCatalog = () => createCatalog('/data', fixtureFetch);
export const PACK = 'eng.MRK-1-1-13';
