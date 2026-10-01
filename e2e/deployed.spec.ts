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
