import { expect, test } from '@playwright/test';

// J-A1 step 1: S01 opens and shows the language list (17 rows, autonym first). F6-S01: the kit picker
// starts on the phone's language (here English), so the one primary is live from the start.
test('S01 opens with the language list', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-screen="S01"]')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose your language');
  const rows = page.getByRole('radio');
  await expect(rows).toHaveCount(17);
  await expect(page.getByText('Español')).toBeVisible();
  await expect(page.getByText('العربية')).toBeVisible();
  // one primary per screen (primary-button.md test), naming the chosen language
  const primary = page.locator('[data-role="primary"]');
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveText(/Continue in English/);
  await page.getByText('Español').click();
  await expect(primary).toHaveText(/Continue in Español/);
  await primary.click();
  await expect(page.locator('[data-screen="S02"]')).toBeVisible();
});
