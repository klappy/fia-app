import { expect, test, type Page } from '@playwright/test';

// F6-S10 Key term detail in glass on the built app (nodded mock design/alpha-v2-screens/10-key-term.html,
// Layer frame): the way back in the glass header (no language pill, no Explore), the term set large
// led by its kind bead, one mark chip (kit GlassChip → sheet 20), the definition on a kit GlassSurface,
// and one primary that never autoplays (R-407). v1 strings kept (design/alpha-screens/10-key-term-detail.md).
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

const URL = '/term?pack=eng.MRK-1-1-13&id=term-eng-t9&unit=4';
const screen = (page: Page) => page.locator('[data-screen="S10"]');

test('layer frame: way back in the header, term, kind line, mark chip, definition card, Play', async ({
  page,
}) => {
  await seed(page);
  await page.goto(URL);
  const s = screen(page);
  await expect(s.getByRole('heading', { level: 1 })).toHaveText('baptism');
  await expect(s.locator('.fia-layer-head__title')).toHaveText('baptism');
  await expect(s.locator('.fia-layer-head__kind')).toHaveText('Key term · FIA');
  // Layer: no language pill, no Explore; one labelled way back in the glass header
  await expect(s.locator('.fia-lang')).toHaveCount(0);
  await expect(s.locator('.fia-explore')).toHaveCount(0);
  const back = s.locator('header').getByRole('button', { name: 'Close · back to unit 4' });
  await expect(back).toBeVisible();
  // the mark is a kit GlassChip in a button that opens sheet 20
  const chip = s.locator('.fia-chips .fia-chip-btn');
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveText('source recording');
  await expect(s.locator('.fia-layer-card.fia-text')).toContainText('To baptize someone');
  // one primary, never autoplays
  await expect(s.locator('.fia-primary-slot button')).toHaveText(/Play/);
  await back.click();
  await expect(page).toHaveURL(/\/guide\?pack=eng\.MRK-1-1-13&unit=4/);
});

test('from Resources: the way back says Resources and returns there', async ({ page }) => {
  await seed(page);
  await page.goto('/term?pack=eng.MRK-1-1-13&id=term-eng-t9&from=resources');
  await screen(page).getByRole('button', { name: 'Close · back to Resources' }).click();
  await expect(page).toHaveURL(/\/resources\?pack=eng\.MRK-1-1-13/);
});

test('the mark chip opens the provenance sheet', async ({ page }) => {
  await seed(page);
  await page.goto(URL);
  await screen(page).locator('.fia-chips .fia-chip-btn').click();
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
