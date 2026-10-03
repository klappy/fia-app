import { expect, test } from '@playwright/test';

// Kit fonts unit (cookbook work/active/2026-10-02-fia-kit-fonts-offline, DoD 3): the vendored kit
// self-hosts its Noto scripture faces. No load calls Google; five faces ride in the offline shell
// and render offline; Noto Serif TC (Han, ~6 MB) stays out of the shell and loads only on demand.
const GOOGLE = /fonts\.(googleapis|gstatic)\.com/;

for (const scheme of ['light', 'dark'] as const) {
  test(`shell and S14 make no Google font request (${scheme})`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: scheme });
    const page = await context.newPage();
    const google: string[] = [];
    page.on('request', (r) => {
      if (GOOGLE.test(r.url())) google.push(r.url());
    });
    for (const path of ['/library', '/settings']) {
      await page.goto(path, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
    }
    expect(google).toEqual([]);
    await context.close();
  });
}

test('the shell precaches the Noto faces except TC, and Hebrew renders offline', async ({
  page,
  context,
}) => {
  await page.goto('/library');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r));
  });
  const shellPaths = async () =>
    page.evaluate(async () => {
      const meta = await caches.open('fia-meta-v1');
      const r = await meta.match('/__fia_shell__');
      return r
        ? ((await r.json()) as { entries: { path: string }[] }).entries.map((e) => e.path)
        : [];
    });
  await expect.poll(async () => (await shellPaths()).length).toBeGreaterThan(1);
  const paths = await shellPaths();
  expect(paths.filter((p) => /\/noto-serif-hebrew-.*\.woff2$/.test(p)).length).toBeGreaterThan(0);
  expect(paths.filter((p) => p.includes('noto-serif-tc'))).toEqual([]);

  await context.setOffline(true);
  await page.reload();
  const loaded = await page.evaluate(
    async () => (await document.fonts.load('400 20px "Noto Serif Hebrew"', 'בְּרֵאשִׁית')).length,
  );
  expect(loaded).toBeGreaterThan(0);
  await context.setOffline(false);
});
