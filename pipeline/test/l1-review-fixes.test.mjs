// fia-app#2 L1 review follow-ups: single-ref index_reference, no retry on 404, memoized HEAD with User-Agent. Network-free (fetch stubbed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const cacheDir = mkdtempSync(path.join(tmpdir(), 'fia-pipeline-test-'));
process.env.FIA_PIPELINE_CACHE = cacheDir;
const { fetchPinned, headPinned, indexReferenceMatches, isRetryableStatus, parsePericope, pericopeId, USER_AGENT } = await import('../src/lib.mjs');
test.after(() => rmSync(cacheDir, { recursive: true, force: true }));

const sources = { rawBase: 'https://raw.example.test/{repo}/{sha}/{path}' };
const SHA = 'a'.repeat(40);
function stubFetch(responses) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (r instanceof Error) throw r;
    return new Response(r.body ?? null, { status: r.status });
  };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}

test('single-ref index_reference round-trips to a pack lookup', () => {
  for (const [ref, id] of [['54006002', '1TI-6-2-2'], ['03007028', 'LEV-7-28-28']]) {
    assert.equal(pericopeId(ref), id);
    const { start, end } = parsePericope(id);
    assert.ok(indexReferenceMatches(ref, start, end), `${ref} matches ${id}`);
  }
  const { start, end } = parsePericope('MRK-1-1-13');
  assert.ok(indexReferenceMatches('41001001-41001013', start, end));
  assert.ok(!indexReferenceMatches('41001001', start, end));
});

test('isRetryableStatus: 5xx and 429 only', () => {
  for (const s of [500, 502, 503, 429]) assert.ok(isRetryableStatus(s), String(s));
  for (const s of [400, 401, 403, 404, 410]) assert.ok(!isRetryableStatus(s), String(s));
});

test('fetchPinned does not retry a 404', async () => {
  const f = stubFetch([{ status: 404 }]);
  try { await assert.rejects(fetchPinned(sources, 'R', SHA, 'no-retry-404.json'), /HTTP 404/); }
  finally { f.restore(); }
  assert.equal(f.calls.length, 1);
});

test('fetchPinned retries a 503 then succeeds', async () => {
  const f = stubFetch([{ status: 503 }, { status: 200, body: '{}' }]);
  try { const r = await fetchPinned(sources, 'R', SHA, 'retry-503.json'); assert.equal(r.status, 200); }
  finally { f.restore(); }
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].opts.headers['user-agent'], USER_AGENT);
});

test('headPinned sends a User-Agent and caches per URL', async () => {
  const f = stubFetch([{ status: 200 }]);
  try {
    assert.equal(await headPinned(sources, 'R', SHA, 'x/01.content.json'), true);
    assert.equal(await headPinned(sources, 'R', SHA, 'x/01.content.json'), true);
  } finally { f.restore(); }
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].opts.method, 'HEAD');
  assert.equal(f.calls[0].opts.headers['user-agent'], USER_AGENT);
});

test('headPinned: 404 is false without retry; 403 throws without retry', async () => {
  const f = stubFetch([{ status: 404 }]);
  try { assert.equal(await headPinned(sources, 'R', SHA, 'x/99.content.json'), false); } finally { f.restore(); }
  assert.equal(f.calls.length, 1);
  const g = stubFetch([{ status: 403 }]);
  try { await assert.rejects(headPinned(sources, 'R', SHA, 'x/98.content.json'), /403/); } finally { g.restore(); }
  assert.equal(g.calls.length, 1);
});
