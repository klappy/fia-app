// C-03: catalog entries[].sourceRevision === sha256(JSON.stringify(pack.sourceRevisions)) for every committed pack (reviewer fia-app#2, finding 1)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const manifest = JSON.parse(readFileSync(path.join(DATA, 'catalog/manifest.json'), 'utf8'));
const byId = new Map(manifest.entries.map((e) => [e.packId, e]));

test('every proof pack sourceRevisions hashes to its catalog sourceRevision', () => {
  const packs = readdirSync(path.join(DATA, 'packs'));
  assert.ok(packs.length >= 5);
  for (const packId of packs) {
    const pack = JSON.parse(readFileSync(path.join(DATA, 'packs', packId, 'manifest.json'), 'utf8'));
    const entry = byId.get(packId);
    assert.ok(entry, `catalog entry for ${packId}`);
    const h = createHash('sha256').update(JSON.stringify(pack.sourceRevisions)).digest('hex');
    assert.equal(h, entry.sourceRevision, `${packId}: pack pins ${Object.keys(pack.sourceRevisions).join(',')}`);
  }
});
