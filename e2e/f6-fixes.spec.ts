import { expect, test } from '@playwright/test';

// F6 follow-ups from fresh reviews of #24, #25, #26 (non-blocking findings).
test.use({ serviceWorkers: 'block' });

test('primary slot grows to 72 px at every large text step (x150/x200/x310)', async ({ page }) => {
  await page.goto('/feedback');
  const primary = page.locator('.fia-primary').first();
  await expect(primary).toBeVisible();
  for (const step of ['x150', 'x200', 'x310']) {
    await page.evaluate((s) => document.documentElement.setAttribute('data-text-step', s), step);
    const h = await primary.evaluate((el) => parseFloat(getComputedStyle(el).minHeight));
    expect(h, step).toBeGreaterThanOrEqual(72);
  }
});

test('pressing a selected reason chip deselects it instead of re-adding its word', async ({
  page,
}) => {
  await page.goto('/feedback');
  const field = page.locator('#fia-feedback-text');
  const chip = page.locator('.fia-feedback__reasons button', { hasText: 'confusing' });
  await chip.click();
  await expect(field).toHaveValue('confusing: ');
  await field.fill('confusing: the verse order');
  await chip.click();
  await expect(field).toHaveValue('the verse order');
  await expect(field).not.toHaveValue(/confusing: confusing/);
});

test.describe('install guide opened cold', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  test('"Not now" with no history falls back to home', async ({ page }) => {
    await page.goto('/install');
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$|\/$/);
    await expect(page.locator('[data-screen="S17"]')).toHaveCount(0);
  });

  test('"Save anyway" with no history falls back to home', async ({ page }) => {
    await page.goto('/install?from=passage');
    await page.getByRole('button', { name: 'Skip and save anyway' }).click();
    await page.getByRole('button', { name: 'Save anyway' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
