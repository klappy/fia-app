import { expect, test } from '@playwright/test';

// R-702 (J-A2 step 7): going offline shows `⊘ Offline` in the shared header and marks unsaved
// rows `needs connection`; coming back online clears both. Nothing is saved in a fresh context.
test('offline chip and needs-connection rows follow the connection', async ({ page, context }) => {
  await page.goto('/library');
  const screen = page.locator('[data-screen="S02"]');
  await expect(screen).toBeVisible();
  const rows = page.locator('[data-screen="S02"] button[data-book]');
  await expect(rows.first()).toBeVisible();
  const chip = page.locator('header [data-role="offline-chip"]');
  await expect(chip).toHaveCount(0);
  await expect(page.locator('[data-role="needs-connection"]')).toHaveCount(0);

  await context.setOffline(true);
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText('⊘ Offline');
  await expect(rows.first().locator('[data-role="needs-connection"]')).toHaveText(
    'not saved — needs connection',
  );

  // S03: the chip rides the shared header; unsaved pericopes carry the badge and stay tappable.
  await rows.first().click();
  await expect(page.locator('[data-screen="S03"]')).toBeVisible();
  await expect(page.locator('header [data-role="offline-chip"]')).toBeVisible();
  const pericope = page.locator('[data-screen="S03"] button[data-pack-id]').first();
  await expect(pericope.locator('[data-role="needs-connection"]')).toBeVisible();
  await expect(pericope).toBeEnabled();

  await context.setOffline(false);
  await expect(page.locator('header [data-role="offline-chip"]')).toHaveCount(0);
  await expect(page.locator('[data-role="needs-connection"]')).toHaveCount(0);
});
