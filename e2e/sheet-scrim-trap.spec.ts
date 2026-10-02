import { expect, test, type Page } from '@playwright/test';

// Ticket 2026-10-02 fia-sheet-scrim-and-trap (found by verify-focus-f4-1124 at 390 × 844):
// 1. a tap on the scrim outside the sheet must close it below 640 px (the kit GlassSheet's
//    full-height wrapper used to take the tap); 2. focus must not leave the aria-modal sheet on
//    click-then-Shift+Tab (it landed on the screen's Play button behind the scrim).
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });

async function openGuide(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'fia.flow.current.v1',
      JSON.stringify({ language: 'eng', book: 'MRK', packId: 'eng.MRK-1-1-13' }),
    );
    // F5: "Recorded only" (C-10) keeps every part silent, so the big button steps to the stop.
    localStorage.setItem(
      'fia.settings.v1',
      JSON.stringify({ schemaVersion: 1, narrationMode: 'source-only' }),
    );
  });
  await page.goto('/guide');
}

async function openExplore(page: Page) {
  await openGuide(page);
  await page.locator('.fia-explore').click();
  const sheet = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(sheet).toBeVisible();
  return sheet;
}

test('scrim tap above the Explore sheet closes it at phone width', async ({ page }) => {
  const sheet = await openExplore(page);
  const box = (await sheet.boundingBox())!;
  expect(box.y).toBeGreaterThan(4);
  await page.mouse.click(195, box.y / 2);
  await expect(sheet).toBeHidden();
});

test('scrim tap above the SH-2 stop sheet closes it at phone width', async ({ page }) => {
  await openGuide(page);
  const sheet = page.locator('[role="dialog"].fia-sheet--stop');
  const primary = page.locator('[data-screen="S05"] > .fia-primary-slot [data-role="primary"]');
  for (let i = 0; i < 40 && !(await sheet.isVisible()); i++) {
    await primary.click();
    await page.waitForTimeout(50);
  }
  await expect(sheet).toBeVisible();
  await page.mouse.click(195, 40);
  await expect(sheet).toBeHidden();
});

test('a tap inside the sheet does not close it', async ({ page }) => {
  const sheet = await openExplore(page);
  const box = (await sheet.boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + 30);
  await expect(sheet).toBeVisible();
});

for (const key of ['Shift+Tab', 'Tab']) {
  test(`focus stays in the sheet on click-then-${key}`, async ({ page }) => {
    const sheet = await openExplore(page);
    const box = (await sheet.boundingBox())!;
    // The grab handle / title area: not focusable, so the click drops focus to <body>.
    await page.mouse.click(box.x + box.width / 2, box.y + 6);
    await expect(sheet).toBeVisible();
    await page.keyboard.press(key);
    const inside = await sheet.evaluate((el) => el.contains(document.activeElement));
    expect(inside).toBe(true);
  });
}

// PR #22 deferred line: a failed save of "system" removes data-theme (settings/apply.ts:18) but
// leaves the old theme in storage; the kit mirror must still follow the phone.
test('follow-the-phone mirrors a dark phone even when the stored theme is stale', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    localStorage.setItem('fia.settings.v1', JSON.stringify({ theme: 'light' }));
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
