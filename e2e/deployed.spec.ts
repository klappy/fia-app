import { expect, test } from '@playwright/test';

// Build stamp check. Runs locally against vite preview too (shape only); against a deployed
// env (BASE_URL) with EXPECT_COMMIT set it proves the env serves that commit.
test('version.json carries the build stamp', async ({ request }) => {
  const res = await request.get(`/version.json?t=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache' },
  });
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('json');
  const stamp = await res.json();
  expect(typeof stamp.version).toBe('string');
  expect(typeof stamp.commit).toBe('string');
  expect(typeof stamp.branch).toBe('string');
  expect(Number.isNaN(Date.parse(stamp.builtAt))).toBe(false);
  if (process.env.EXPECT_COMMIT) expect(stamp.commit).toBe(process.env.EXPECT_COMMIT);
});

// Pipeline data must ship with the build. A missing file falls through to the SPA fallback and
// returns index.html with 200 — so assert a JSON content-type and a parse, never just `ok`.
async function getJson(request: import('@playwright/test').APIRequestContext, path: string) {
  const res = await request.get(path);
  expect(res.status(), path).toBe(200);
  expect(res.headers()['content-type'], path).toContain('json');
  return res.json();
}

test('catalog manifest, rights and a pack manifest are served as JSON', async ({ request }) => {
  const catalog = await getJson(request, '/data/catalog/manifest.json');
  expect(typeof catalog).toBe('object');
  const rights = await getJson(request, '/data/rights/records.json');
  expect(rights).toBeTruthy();
  const packId = 'eng.MRK-1-1-13';
  const pack = await getJson(request, `/packs/${packId}/manifest.json`);
  expect(pack.packId).toBe(packId);
  const guide = await getJson(request, `/data/packs/${packId}/guide-units.json`);
  expect(guide.packId).toBe(packId);
});
