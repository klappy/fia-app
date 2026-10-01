import { expect, test } from '@playwright/test';

// R-702 Accept: airplane-mode cold start reaches the app shell. Runs against `vite preview`
// (production build), where src/offline/register.ts registers /sw.js.
test('offline cold start: the shell opens from the verified cache', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('[data-screen="S01"]')).toBeVisible();
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r));
    return reg.active?.state;
  });
  // The shell record is committed at activate; wait until it lists index.html.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const meta = await caches.open('fia-meta-v1');
        const r = await meta.match('/__fia_shell__');
        return r ? ((await r.json()) as { entries: { path: string }[] }).entries.length : 0;
      }),
    )
    .toBeGreaterThan(1);
  await context.setOffline(true);
  await page.goto('/downloads');
  await expect(page.locator('[data-screen="S13"]')).toBeVisible();
  await expect(page.getByText('Nothing saved yet.', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-screen="S13"]')).toBeVisible();
  await context.setOffline(false);
});

test('install guide renders steps for the platform', async ({ page }) => {
  await page.goto('/install');
  await expect(page.locator('[data-screen="S17"]')).toBeVisible();
  await expect(page.locator('[data-role="primary"]')).toHaveCount(1);
});
