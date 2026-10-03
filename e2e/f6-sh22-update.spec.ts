import { expect, test } from '@playwright/test';

// F6 sheet 22 Update notice in glass (nodded mock cookbook design/alpha-v2-screens/22-sheet-update-notice.html;
// v1 spec design/alpha-screens/22-sheet-update-notice.md as the wireframe): the shared Sheet with the FIA
// lockup, Keep / Later as the shared QuietAction, one dark KitPrimary with a glyph; offline the primary
// reads "— needs connection" and cannot be tapped (22 States `content update, offline`).
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

test('content update: lockup, quiet Keep, kit primary with the download glyph', async ({
  page,
}) => {
  await page.goto('/sheet/update?variant=content&pack=spa.MRK-1-1-13');
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.fia-sheet-brand > .fia-logo')).toBeVisible();
  await expect(dialog.locator('.fia-sheet-brand > span')).toHaveText('Update available');
  await expect(
    dialog.getByText('Your saved copy keeps working offline', { exact: false }),
  ).toBeVisible();
  await expect(dialog.locator('.fia-quiet')).toHaveText('Keep the current version');
  const primary = dialog.locator('[data-role="primary"]');
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveClass(/fia-kit-primary/);
  await expect(primary).toContainText('Update (');
  await expect(primary).toBeEnabled();
  await expect(primary.locator('svg')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: `screenshots/f6-sh22/sh22-update.${scheme}.png` });
  }
});

test('content update offline: the primary says it needs a connection and is disabled', async ({
  page,
  context,
}) => {
  await page.goto('/sheet/update?variant=content&pack=spa.MRK-1-1-13');
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  await context.setOffline(true);
  const primary = page.locator('[role="dialog"] [data-role="primary"]');
  await expect(primary).toContainText('— needs connection');
  await expect(primary).toBeDisabled();
  await context.setOffline(false);
});

test('app update: Reload now primary and a quiet Later that closes', async ({ page }) => {
  await page.goto('/downloads');
  await page.goto('/sheet/update?variant=app');
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog.locator('.fia-sheet-brand > span')).toHaveText('New app version');
  await expect(dialog.getByText('Reload to use it. Nothing you saved is affected.')).toBeVisible();
  await expect(dialog.locator('[data-role="primary"]')).toHaveText('Reload now');
  await dialog.locator('.fia-quiet', { hasText: 'Later' }).click();
  await expect(page.locator('[data-screen="S13"]')).toBeVisible();
});
