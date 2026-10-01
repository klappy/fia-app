import { expect, test } from '@playwright/test';

// J-A1 friction (persona rerun3): at the first discussion stop the SH-2 primary sat under the
// dock, so a tap hit Resources. 21-sheet-discussion-stop.md: the scrim does not cover the dock
// and the sheet's primary sits above it, fully tappable.
for (const width of [360, 375, 412]) {
  test(`SH-2 primary is above the dock and tappable at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    await page.addInitScript(() => {
      localStorage.setItem(
        'fia.flow.current.v1',
        JSON.stringify({ language: 'eng', book: 'MRK', packId: 'eng.MRK-1-1-13' }),
      );
    });
    await page.goto('/guide');
    const sheet = page.locator('[role="dialog"].fia-sheet--stop');
    const primary = page.locator('[data-screen="S05"] > .fia-primary-slot [data-role="primary"]');
    for (let i = 0; i < 40 && !(await sheet.isVisible()); i++) {
      await primary.click();
      await page.waitForTimeout(50);
    }
    await expect(sheet).toBeVisible();
    const button = sheet.locator('[data-role="primary"]');
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    const dock = (await page.locator('.fia-dock').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(dock.y);
    const hit = await button.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!at && (at === el || el.contains(at));
    });
    expect(hit).toBe(true);
    await button.click();
    await expect(page).toHaveURL(/\/guide$/);
    await expect(sheet).toBeHidden();
  });
}
