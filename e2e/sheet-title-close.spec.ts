import { expect, test } from '@playwright/test';

// Design-lens dl-sh32-02 (PR #32 HOLD): on SH-5 and SH-4 quota the long title wrapped below the
// logo and ran under the Close X. The logo and title stay on one row; the title box never meets
// the Close button's box, at 390 and at 320 wide.
test.use({ serviceWorkers: 'block' });

const sheets = [
  ['SH-5 forward-jump guard', '/sheet/jump'],
  ['SH-4 quota', '/sheet/storage?variant=quota'],
] as const;

for (const width of [390, 320]) {
  for (const [name, path] of sheets) {
    test(`${name} title clears the Close button at ${width} wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(path);
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();
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
    });
  }
}
