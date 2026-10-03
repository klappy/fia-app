import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCatalog } from '../src/flow/catalog';
import { packUrl } from '../src/media/usePack';
import { tierFiles, type ContentPack } from '../src/offline/manifest';
import { DATA_PATHS } from '../src/settings/data';

// GAP-OFFLINE: what S04–S08 read for a passage must be exactly what a Text save stores (C-02
// `tiers.text.files[].path`), or the saved passage dead-ends offline. One path per pack file.
const PACKS = join(process.cwd(), 'data/packs');
const ids = readdirSync(PACKS).sort();
const pack = (id: string) =>
  JSON.parse(readFileSync(join(PACKS, id, 'manifest.json'), 'utf8')) as ContentPack;

describe.each(ids)('%s: every passage read is in its Text save', (id) => {
  const saved = new Set(tierFiles(pack(id), 'text').map((f) => f.path));

  it('the guide (S04–S07, S18) reads guide.json and guide-units.json at their C-02 paths', async () => {
    const asked: string[] = [];
    const catalog = createCatalog('/data', async (url) => {
      asked.push(url);
      return JSON.parse(readFileSync(join(PACKS, url.replace(/^\/packs\//, '')), 'utf8'));
    });
    const guide = await catalog.guide(id);
    expect(guide.packId).toBe(id);
    expect(asked.sort()).toEqual([`/packs/${id}/guide-units.json`, `/packs/${id}/guide.json`]);
    for (const url of asked) expect(saved.has(url), url).toBe(true);
  });

  it('the media screens (S08 scripture + narration, resources) and the rights line read saved files', () => {
    for (const url of [
      packUrl(id, 'scripture'),
      packUrl(id, 'narration'),
      packUrl(id, 'resources'),
      DATA_PATHS.packRights(id),
    ])
      expect(saved.has(url), url).toBe(true);
  });
});
