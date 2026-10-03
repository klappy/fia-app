import { expect, test, type Page } from '@playwright/test';

// F6-S12 Video player in glass on the built app (nodded mock design/alpha-v2-screens/12-video.html,
// Layer frame): the way back in the glass header while the primary plays, the video in the shared
// dark media well (never autoplays, R-407), the kind line "Video Bible Dictionary · streams" and
// the title (LayerHead), the source mark as a kit GlassChip → sheet 20. Offline: "Needs connection"
// in the well and the primary becomes the way back (R-506). v1 strings kept (12-video-player.md).
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

async function seed(page: Page, textSize = 'system') {
  await page.route(/s3\.amazonaws\.com/, (r) => r.abort());
  await page.addInitScript((size) => {
    localStorage.setItem(
      'fia.settings.v1',
      JSON.stringify({
        schemaVersion: 1,
        narrationMode: 'source-fallback',
        mediaTier: 'phone',
        contentLanguage: 'eng',
        uiLanguage: 'eng',
        textSize: size,
        lowLiteracy: false,
        theme: 'light',
        disclosuresPresented: [],
        telemetryOptIn: false,
      }),
    );
  }, textSize);
}

const URL = '/video?pack=eng.MRK-1-1-13&id=a13&unit=4';
const screen = (page: Page) => page.locator('[data-screen="S12"]');

test('online: header way back, video well, kind line, title, source chip, Play', async ({
  page,
}) => {
  await seed(page);
  await page.goto(URL);
  const s = screen(page);
  await expect(s.getByRole('heading', { level: 1 })).toHaveText('Jordan River');
  // the stream is cut in this test, so the well shows the <video> or its honest error, never a new tab
  await expect(s.locator('.fia-viewer--video')).toBeVisible();
  await expect(s.locator('.fia-layer-head__kind')).toHaveText('Video Bible Dictionary · streams');
  await expect(s.locator('.fia-layer-head__title')).toHaveText('Jordan River');
  await expect(s.getByRole('button', { name: 'source video · English' })).toBeVisible();
  await expect(s.locator('.fia-lang, .fia-explore')).toHaveCount(0);
  const back = s.locator('header').getByRole('button', { name: 'Close · back to unit 4' });
  await expect(back).toBeVisible();
  await expect(s.locator('.fia-primary-slot button')).toHaveText(/Play|Try again/);
  await back.click();
  await expect(page).toHaveURL(/\/guide\?pack=eng\.MRK-1-1-13&unit=4/);
});

test('offline: Needs connection in the well, the primary is the one way back', async ({
  page,
  context,
}) => {
  await seed(page);
  await page.goto(URL);
  await expect(screen(page).locator('.fia-layer-head__title')).toBeVisible();
  await context.setOffline(true);
  const s = screen(page);
  await expect(s.locator('.fia-viewer__frame-message')).toHaveText('⊘ Needs connection');
  await expect(s.locator('header .fia-close-back')).toHaveCount(0);
  await expect(s.locator('.fia-primary-slot button')).toHaveText(/Close · back to unit 4/);
  await context.setOffline(false);
});

test('the source chip opens the provenance sheet', async ({ page }) => {
  await seed(page);
  await page.goto(URL);
  await screen(page).getByRole('button', { name: 'source video · English' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

for (const size of ['x200', 'x310']) {
  test(`${size}: nothing passes 390 px and the primary stays in the viewport`, async ({ page }) => {
    await seed(page, size);
    await page.goto(URL);
    const s = screen(page);
    await expect(s.locator('.fia-layer-head__title')).toBeVisible();
    const over = await s.evaluate((root) =>
      [...root.querySelectorAll('*')]
        .filter((e) => e.getBoundingClientRect().right > 391)
        .map((e) => e.className),
    );
    expect(over).toEqual([]);
    await expect(s.locator('.fia-primary-slot button')).toBeInViewport();
  });
}
