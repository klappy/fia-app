import { expect, test, type Locator, type Page } from '@playwright/test';

// Design-lens dl-sh32-02 (PR #32 HOLD): on SH-5 and SH-4 quota the long title wrapped below the
// logo and ran under the Close X. The logo and title stay on one row; the title box never meets
// the Close button's box, at 390 and at 320 wide.
test.use({ serviceWorkers: 'block' });

const sheets = [
  ['SH-5 forward-jump guard', '/sheet/jump'],
  ['SH-4 quota', '/sheet/storage?variant=quota'],
] as const;

async function expectTitleClearsClose(dialog: Locator) {
  const title = (await dialog.locator('.fia-sheet-brand > span').boundingBox())!;
  const logo = (await dialog.locator('.fia-sheet-brand > .fia-logo').boundingBox())!;
  const close = (await dialog.locator('.fia-sheet__close').boundingBox())!;
  const overlaps =
    title.x < close.x + close.width &&
    close.x < title.x + title.width &&
    title.y < close.y + close.height &&
    close.y < title.y + title.height;
  expect(overlaps, JSON.stringify({ title, close })).toBe(false);
  // One row: the title sits beside the logo, never below it.
  expect(title.x).toBeGreaterThanOrEqual(logo.x + logo.width);
  expect(title.x + title.width).toBeLessThanOrEqual(close.x);
}

async function seedPack(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'fia.flow.current.v1',
      JSON.stringify({ language: 'eng', book: 'MRK', packId: 'eng.MRK-1-1-13' }),
    );
  });
}

for (const width of [390, 320]) {
  for (const [name, path] of sheets) {
    test(`${name} title clears the Close button at ${width} wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(path);
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();
      await expectTitleClearsClose(dialog);
    });
  }

  // rev32b-1420 note 2, v2 (F6-S24, mock 24): the multi-stop jump has no Close (its quiet "Stay here"
  // is the way out); its title stays on the logo's row and the brand row reserves no Close padding.
  test(`SH-5 multi-stop forward-jump title stays beside the logo at ${width} wide`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await seedPack(page);
    await page.goto('/overview');
    // F6-S07 Whole guide map: open the last step and tap its last part; the jump passes many talks.
    const steps = page.locator('[data-screen="S07"] .s07-step');
    await expect(steps.first()).toBeVisible();
    await steps.last().click();
    await page.locator('[data-screen="S07"] .s07-part').last().click();
    const dialog = page.locator('[role="dialog"].fia-sheet--stop');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.fia-sheet-brand > span')).toHaveText(
      /^Jump to step \d+, part \d+\?$/,
    );
    await expect(dialog).toContainText(/You would skip \d+ talks\./);
    await expect(dialog.locator('.fia-sheet__close')).toHaveCount(0);
    const title = (await dialog.locator('.fia-sheet-brand > span').boundingBox())!;
    const logo = (await dialog.locator('.fia-sheet-brand > .fia-logo').boundingBox())!;
    expect(title.x).toBeGreaterThanOrEqual(logo.x + logo.width);
    expect(title.x + title.width).toBeLessThanOrEqual(width);
  });
}

// rev32b-1420 note 1: only a sheet that renders Close reserves the Close button's box; Explore
// has no Close, so its brand row keeps the full width.
test('Explore brand row reserves no Close padding', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPack(page);
  await page.goto('/guide');
  await page.locator('.fia-explore').click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.fia-sheet__close')).toHaveCount(0);
  const brand = dialog.locator('.fia-sheet-brand');
  await expect(brand).not.toHaveClass(/fia-sheet-brand--close/);
  expect(await brand.evaluate((el) => getComputedStyle(el).paddingInlineEnd)).toBe('0px');
});
