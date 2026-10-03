import { expect, test, type Page } from '@playwright/test';

// F6-S13 Downloads / offline in glass (nodded mock cookbook design/alpha-v2-screens/13-downloads.html; v1
// spec design/alpha-screens/13-downloads-offline.md as the wireframe): Layer frame with the one labelled
// way back in the glass header, the saved pack on a kit GlassSurface card with the kit SyncBadge, quiet
// kit GlassButton actions, Remove only after the confirm naming the consequence (R-311), the catalog row.
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

test.describe('F6-S13 downloads in glass', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('empty: layer header way back, empty line, catalog row, one primary', async ({ page }) => {
    await page.goto('/downloads');
    const screen = page.locator('[data-screen="S13"]');
    await expect(screen).toBeVisible();
    await expect(screen.locator('.fia-header .fia-close-back')).toHaveText('Back');
    await expect(screen.locator('.fia-lang, .fia-explore')).toHaveCount(0);
    await expect(screen.getByText('Nothing saved yet.', { exact: false })).toBeVisible();
    await expect(screen.getByTestId('catalog-row')).toHaveText('Catalog + text (all languages) ✓');
    await expect(screen.locator('[data-role="primary"]')).toHaveCount(1);
    await expect(screen.locator('[data-role="primary"]')).toContainText('Save a passage');
    // the way back with no history goes to the library
    await screen.locator('.fia-close-back').click();
    await expect(page.locator('[data-screen="S02"]')).toBeVisible();
  });

  test('saved: glass card, Saved badge, quiet Remove asks first; nothing past 390 px', async ({
    page,
  }) => {
    await savePack(page);
    await page.goto(`/downloads?from=${PACK}`);
    const screen = page.locator('[data-screen="S13"]');
    await expect(screen.locator('.fia-close-back')).toHaveText('Volver a MRK 1:1–13');
    const card = screen.locator('.fia-dl__pack').first();
    await expect(card).toContainText('MRK 1:1–13 · Texto · 0.3 MB');
    await expect(card.getByText('Guardado ✓')).toBeVisible();
    // kit GlassSurface: backdrop blur on the card itself
    expect(await card.evaluate((el) => getComputedStyle(el).backdropFilter)).toContain('blur');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw).toBeLessThanOrEqual(390);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.screenshot({ path: `screenshots/f6-s13/s13-downloads.${scheme}.png` });
    }
    await page.emulateMedia({ colorScheme: 'light' });

    // Remove → the confirm names the consequence; Keep leaves the pack saved (R-311).
    await card.getByRole('button', { name: 'Quitar' }).click();
    const confirm = card.getByRole('alertdialog');
    await expect(confirm).toContainText('MRK 1:1–13 no funcionará sin conexión. ¿Quitar 0.3 MB?');
    await confirm.getByRole('button', { name: 'Conservar' }).click();
    await expect(card.getByRole('alertdialog')).toHaveCount(0);
    await expect(card.getByText('Guardado ✓')).toBeVisible();
  });
});
