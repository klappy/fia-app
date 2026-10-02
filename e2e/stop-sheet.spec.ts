import { expect, test } from '@playwright/test';

// J-A1 friction (persona rerun3): at the first discussion stop the SH-2 primary sat under the
// v1 dock, so a tap hit Resources. v2 has no bottom bar (RULING 2026-10-01 21:23 ET (a)); the
// sheet's primary must sit inside the viewport and be the element hit at its centre.
for (const width of [360, 375, 412]) {
  test(`SH-2 primary is on screen and tappable at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    await page.addInitScript(() => {
      localStorage.setItem(
        'fia.flow.current.v1',
        JSON.stringify({ language: 'eng', book: 'MRK', packId: 'eng.MRK-1-1-13' }),
      );
      // F5: the guide now plays the PoC's AI clips; "Recorded only" (C-10) keeps every part silent,
      // so the big button steps part to part to the stop as before, with no network.
      localStorage.setItem(
        'fia.settings.v1',
        JSON.stringify({ schemaVersion: 1, narrationMode: 'source-only' }),
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
    expect(box.y + box.height).toBeLessThanOrEqual(640);
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
