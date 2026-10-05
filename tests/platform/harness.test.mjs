import test from 'node:test';
import assert from 'node:assert/strict';
import {KEY, encode, decode, load, save} from '../../experiments/platform/shell/storage.js';
import {resolveSample} from '../../experiments/platform/sample.mjs';
import {probe} from '../../experiments/platform/probe-toolchain.mjs';
import {startServer} from '../../experiments/platform/serve.mjs';

const SHA = 'a'.repeat(64);
const memory = () => { const m = new Map(); return {getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, v), m}; };

test('progress round-trips under the isolated key', () => {
  const store = memory();
  assert.equal(save(store, {sampleSha256: SHA, position: 12.5, savedAt: 'x'}), true);
  assert.deepEqual([...store.m.keys()], [KEY]);
  assert.deepEqual(load(store, SHA), {record: {version: 1, sampleSha256: SHA, position: 12.5, savedAt: 'x'}, status: 'restored'});
});

test('storage loss and damage recover to a clean default, never throw', () => {
  const raw = encode({sampleSha256: SHA, position: 3, savedAt: 'x'});
  assert.equal(decode(null, SHA).status, 'empty');
  assert.equal(decode('{not json', SHA).status, 'recovered:parse');
  assert.equal(decode(raw.replace('"position\\":3', '"position\\":4'), SHA).status, 'recovered:checksum');
  assert.equal(decode(raw, 'b'.repeat(64)).status, 'recovered:other-sample');
  const bad = encode({sampleSha256: SHA, position: -1, savedAt: 'x'});
  assert.equal(decode(bad, SHA).status, 'recovered:position');
  const throwing = {getItem() { throw Error('SecurityError'); }, setItem() { throw Error('QuotaExceededError'); }};
  assert.equal(load(throwing, SHA).status, 'recovered:storage-unavailable');
  assert.equal(save(throwing, {sampleSha256: SHA, position: 1, savedAt: 'x'}), false);
  for (const r of [decode('{not json', SHA), load(throwing, SHA)]) assert.equal(r.record.position, 0);
});

test('borrowed sample matches its shipped manifest identity', () => {
  const s = resolveSample();
  assert.equal(s.id, 'S05-U018');
  assert.match(s.sha256, /^[0-9a-f]{64}$/);
  assert.equal(s.mime, 'audio/mpeg');
  assert.throws(() => resolveSample('no-such-sample'), /not in audio-manifest/);
});

test('toolchain probe reports targets without inventing readiness', () => {
  const r = probe();
  for (const t of ['android', 'ios']) assert.equal(r.ready[t], r.missing[t].length === 0);
  if (r.host.platform !== 'darwin') assert.equal(r.ready.ios, false);
});

test('server serves byte ranges of the verified sample and refuses other paths', async t => {
  const {server, url, sample} = await startServer();
  t.after(() => server.close());
  const head = await fetch(`${url}/sample.mp3`, {headers: {range: 'bytes=0-99'}});
  assert.equal(head.status, 206);
  assert.equal(head.headers.get('content-range'), `bytes 0-99/${sample.bytes}`);
  assert.equal((await head.arrayBuffer()).byteLength, 100);
  assert.equal((await fetch(`${url}/sample.mp3`, {headers: {range: `bytes=${sample.bytes}-`}})).status, 416);
  assert.equal((await fetch(`${url}/../package.json`)).status, 404);
  assert.equal((await fetch(`${url}/sample.json`).then(r => r.json())).sha256, sample.sha256);
});
