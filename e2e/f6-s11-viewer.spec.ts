import { expect, test, type Page } from '@playwright/test';

// F6-S11 Image / map viewer in glass on the built app (nodded mock
// design/alpha-v2-screens/11-image-viewer.html, Layer frame): the image first in the shared dark
// media well, then the kind line and the title (LayerHead), the marks as kit GlassChips that open
// sheet 20, Describe (disabled while the description is not yet made), and the one primary — the
// way back to the exact unit. v1 strings kept (design/alpha-screens/11-image-map-viewer.md).
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

async function seed(page: Page, textSize = 'system', lang = 'eng') {
  await page.route(/s3\.amazonaws\.com/, (r) =>
    r.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="620"><rect width="1000" height="620" fill="#4f8a6b"/></svg>',
    }),
  );
  await page.addInitScript(
    ([size, l]) => {
      localStorage.setItem(
        'fia.settings.v1',
        JSON.stringify({
          schemaVersion: 1,
          narrationMode: 'source-fallback',
          mediaTier: 'phone',
          contentLanguage: l,
          uiLanguage: 'eng',
          textSize: size,
          lowLiteracy: false,
          theme: 'light',
          disclosuresPresented: [],
          telemetryOptIn: false,
        }),
      );
    },
    [textSize, lang],
  );
}

const URL = '/viewer?pack=eng.MRK-1-1-13&id=a112&unit=4';
const screen = (page: Page) => page.locator('[data-screen="S11"]');

test('image: well first, kind line, title, About this image chip, Describe, primary back', async ({
  page,
}) => {
  await seed(page);
  await page.goto(URL);
  const s = screen(page);
  await expect(s.getByRole('heading', { level: 1 })).toHaveText('Jordan River');
  await expect(s.getByRole('img', { name: 'Jordan River. Pinch to zoom.' })).toBeVisible();
  await expect(s.locator('.fia-layer-head__kind')).toHaveText('Image');
  await expect(s.locator('.fia-layer-head__title')).toHaveText('Jordan River');
  // the well comes before the head (mock order)
  const order = await s.evaluate((root) => {
    const well = root.querySelector('.fia-viewer');
    const head = root.querySelector('.fia-layer-head');
    return !!(
      well &&
      head &&
      well.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  });
  expect(order).toBe(true);
  await expect(s.getByRole('button', { name: 'About this image' })).toBeVisible();
  await expect(s.getByRole('button', { name: /^Play description/ })).toBeDisabled();
  await expect(s.locator('.fia-lang, .fia-explore')).toHaveCount(0);
  await s.locator('.fia-primary-slot button').click();
  await expect(page).toHaveURL(/\/guide\?pack=eng\.MRK-1-1-13&unit=4/);
});

test('About this image opens the provenance sheet', async ({ page }) => {
  await seed(page);
  await page.goto(URL);
  await screen(page).getByRole('button', { name: 'About this image' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('map not in the language: the English badge chip', async ({ page }) => {
  await seed(page, 'system', 'spa');
  await page.goto('/viewer?pack=spa.MRK-1-1-13&id=c201&unit=4');
  const s = screen(page);
  await expect(s.locator('.fia-layer-head__kind')).toHaveText('Map');
  await expect(s.getByRole('button', { name: /^Map in English · not yet in/ })).toBeVisible();
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
