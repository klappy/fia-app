// R-307: catalog tierBytes match what a save downloads — the bytes the C-02 pack manifest lists per tier (±5%), for every built pack;
// and the catalog advertises a tier only when the pack publishes it (fia-app#17).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packTierBytes } from '../src/inventory.mjs';

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const manifest = JSON.parse(readFileSync(path.join(DATA, 'catalog/manifest.json'), 'utf8'));
const byId = new Map(manifest.entries.map((e) => [e.packId, e]));
const packs = readdirSync(path.join(DATA, 'packs'));

test('every built pack: catalog tierBytes == pack manifest bytes per tier (±5%), no unpublished tiers', () => {
  assert.ok(packs.length >= 1);
  for (const packId of packs) {
    const pack = JSON.parse(readFileSync(path.join(DATA, 'packs', packId, 'manifest.json'), 'utf8'));
    const entry = byId.get(packId);
    assert.ok(entry, `catalog entry for ${packId}`);
    const published = packTierBytes(pack);
    assert.deepEqual(Object.keys(entry.tierBytes).sort(), Object.keys(published).sort(), `${packId}: catalog tiers = pack tiers`);
    for (const [tier, bytes] of Object.entries(published)) {
      assert.equal(pack.tiers[tier].bytes, bytes, `${packId}.${tier}: manifest bytes = sum of its files`);
      const drift = Math.abs(entry.tierBytes[tier] - bytes) / bytes;
      assert.ok(drift <= 0.05, `${packId}.${tier}: catalog ${entry.tierBytes[tier]} vs pack ${bytes} (${(drift * 100).toFixed(1)}%)`);
    }
  }
});

test('no catalog entry advertises a tier the pack format does not publish', () => {
  const publishedTiers = new Set(packs.flatMap((id) => Object.keys(JSON.parse(readFileSync(path.join(DATA, 'packs', id, 'manifest.json'), 'utf8')).tiers)));
  for (const e of manifest.entries) for (const tier of Object.keys(e.tierBytes)) assert.ok(publishedTiers.has(tier), `${e.packId} advertises ${tier}`);
});

test('packTierBytes sums listed files per tier', () => {
  assert.deepEqual(packTierBytes({ tiers: { text: { bytes: 5, files: [{ bytes: 2 }, { bytes: 3 }] } } }), { text: 5 });
});
