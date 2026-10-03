import { expect, test, type Page } from '@playwright/test';

// F6 sheet 23 Storage warning in glass (nodded mock cookbook design/alpha-v2-screens/23-sheet-storage-warning.html;
// v1 spec design/alpha-screens/23-sheet-storage-warning.md as the wireframe): the shared Sheet with the FIA
// lockup, the largest saved packs on one glass well with a quiet Remove that asks first (R-311: never
// deletes by itself), one dark KitPrimary with a glyph.
const PACK = 'spa.MRK-1-1-13';

// Picking Español on S01 sets the guide and the menus (SB-3), so the labels below are Spanish.
async function savePack(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-screen="S01"]')).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r));
  });
  await page.getByText('Español').click();
  await page.locator('[data-role="primary"]').click();
  await page.locator('[data-book="MRK"]').click();
  await page.locator(`[data-pack-id="${PACK}"]`).click();
  await page.getByTestId('save-row').getByTestId('save-button').click();
  await expect(page.getByTestId('save-row').getByTestId('save-badge')).toBeVisible({
    timeout: 20_000,
  });
}

test.use({ viewport: { width: 390, height: 844 } });

test('nothing saved: the empty line and Choose Text tier', async ({ page }) => {
  await page.goto('/sheet/storage?variant=space&needed=23068672');
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog.locator('.fia-sheet-brand > span')).toContainText('Not enough space');
  await expect(dialog.getByText(/^This save needs \d+(\.\d)? MB\. About/)).toBeVisible();
  await expect(
    dialog.getByText('Nothing saved yet takes space here.', { exact: false }),
  ).toBeVisible();
  await expect(dialog.getByText('Nothing is deleted automatically.')).toBeVisible();
  const primary = dialog.locator('[data-role="primary"]');
  await expect(primary).toHaveClass(/fia-kit-primary/);
  await expect(primary).toHaveText('Choose Text tier');
});

test('largest packs on a glass well; Remove asks first and Keep keeps it', async ({ page }) => {
  await savePack(page);
  await page.goto('/sheet/storage?variant=space&needed=23068672');
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  const well = dialog.getByTestId('largest-packs');
  await expect(well).toContainText('MRK 1:1–13 · Texto 0.3 MB');
  expect(await well.evaluate((el) => getComputedStyle(el).backdropFilter)).toContain('blur');
  await expect(dialog.locator('[data-role="primary"]')).toHaveText('Administrar descargas');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: `screenshots/f6-sh23/sh23-storage.${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await well.getByRole('button', { name: 'Quitar' }).click();
  const confirm = well.getByRole('alertdialog');
  await expect(confirm).toContainText('MRK 1:1–13 no funcionará sin conexión. ¿Quitar 0.3 MB?');
  await confirm.getByRole('button', { name: 'Conservar' }).click();
  await expect(well.getByRole('alertdialog')).toHaveCount(0);
  await expect(well).toContainText('MRK 1:1–13 · Texto 0.3 MB');
});

test('persist denied: Install on this phone, quiet Continue anyway', async ({ page }) => {
  await page.goto('/sheet/storage?variant=persist');
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog.locator('.fia-sheet-brand > span')).toContainText(
    'Saved files may be cleared',
  );
  await expect(dialog.locator('[data-role="primary"]')).toHaveText('Install on this phone');
  await expect(dialog.locator('.fia-quiet')).toHaveText('Continue anyway');
});
