import { expect, test, type Page } from '@playwright/test';

// F6-S09 (BUILD-ORDER lane F; nodded mock cookbook design/alpha-v2-screens/09-resources.html, 09b):
// S09 is the guide card's Resources view (PRD § 4 S09); S09b all resources is a layer. Proves: the glass
// frame, the band at the guide's position, Guide · Text · Resources with Resources active and its count
// equal to the part's rows, "In this part" rows (CatalogRow, type · mark, an (i)), no primary (rule 1),
// the "All resources for this passage" row opening S09b (GlassSearch, FilterChips with counts, the whole
// catalog, one way back to the part), search and the type filter, the Guide view back to S05, and nothing
// past the phone at 200% and 310%.
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });

const PACK = 'eng.MRK-1-1-13';

async function seed(page: Page, textSize?: string) {
  await page.addInitScript(
    ({ PACK, textSize }) => {
      const unitId = 'S03-U004';
      localStorage.setItem(
        'fia.flow.current.v1',
        JSON.stringify({ language: 'eng', book: 'MRK', packId: PACK }),
      );
      localStorage.setItem(
        `fia.workspace.v1.${PACK}`,
        JSON.stringify({
          schemaVersion: 1,
          packId: PACK,
          contentLanguage: 'eng',
          theme: 'light',
          view: 'guide',
          position: { stepId: 'S03', unitId, visited: [unitId], finished: false },
          checkpoint: null,
          savedAt: new Date().toISOString(),
        }),
      );
      if (textSize)
        localStorage.setItem(
          'fia.settings.v1',
          JSON.stringify({
            schemaVersion: 1,
            narrationMode: 'source-fallback',
            subtitleMode: 'off',
            mediaTier: 'phone',
            contentLanguage: 'eng',
            uiLanguage: 'eng',
            textSize,
            lowLiteracy: false,
            theme: 'system',
            disclosuresPresented: [],
            telemetryOptIn: false,
          }),
        );
    },
    { PACK, textSize },
  );
}

const screen = (page: Page) => page.locator('[data-screen="S09"]');

test('the guide card Resources view: band, views, the part rows, the All row, no primary', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/guide');
  await page.locator('.fia-views [role="radio"]', { hasText: 'Resources' }).click();
  await expect(page).toHaveURL(/\/resources\?pack=/);
  const s = screen(page);
  await expect(s.locator('#fia-band')).toHaveAttribute('data-part', '4');
  const tab = s.locator('.fia-views [aria-checked="true"]');
  await expect(tab).toContainText('Resources');
  await expect(s.locator('.fia-res')).toContainText('In this part');
  const rows = s.locator('[data-group="part"] > .fia-res__row');
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  await expect(tab).toContainText(`Resources ${n}`);
  await expect(rows.first()).toContainText(/Terms · /);
  await expect(rows.first().getByRole('button', { name: /^Info about / })).toBeVisible();
  // the card's view is the part, not the passage: no search, no chips here (mock 09)
  await expect(s.getByPlaceholder('Search…')).toHaveCount(0);
  await expect(s.locator('.fia-res__chips')).toHaveCount(0);
  await expect(s.locator('[data-role="primary"], [data-fia-primary]')).toHaveCount(0);
  await s.locator('.fia-res__all').click();
  await expect(page).toHaveURL(/\/resources\?pack=.*&all=1/);
  await expect(s).toHaveAttribute('data-screen', 'S09');
  await expect(page.locator('[data-layer="all"]')).toBeVisible();
  expect(await s.locator('.fia-res__row').count()).toBeGreaterThan(n);
});

test('S09b: a type chip filters; search narrows and says when nothing matches; back to the part', async ({
  page,
}) => {
  await seed(page);
  await page.goto(`/resources?pack=${PACK}&unit=S03-U004&all=1`);
  const s = screen(page);
  const chips = s.locator('.fia-res__chips > button');
  await expect(chips.first()).toHaveText('All');
  await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(s.locator('.fia-res__chips')).toContainText(/Terms \d+/);
  await s.locator('.fia-res__chips > button', { hasText: /^Maps/ }).click();
  await expect(s.locator('.fia-res__chips > button', { hasText: /^Maps/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(s.locator('.fia-res__row').first()).toHaveAttribute('data-type', 'maps');
  await expect(s.locator('.fia-res__row:not([data-type="maps"])')).toHaveCount(0);
  await s.locator('.fia-res__chips > button', { hasText: 'All' }).click();
  await s.getByPlaceholder('Search…').fill('zzzz');
  await expect(s).toContainText('Nothing matches. Try a term or a place name.');
  await s.getByRole('button', { name: 'Back to part 4' }).click();
  await expect(page).toHaveURL(/\/resources\?pack=[^&]+&unit=S03-U004$/);
  await s.locator('.fia-views [role="radio"]', { hasText: 'Guide' }).click();
  await expect(page.locator('.fia-guide')).toHaveAttribute('data-unit-id', 'S03-U004');
});

for (const [textSize, label] of [
  ['max', '200%'],
  ['huge', '310%'],
] as const) {
  test(`at ${label} text and 320 px nothing runs past the phone`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await seed(page, textSize);
    for (const q of ['', '&all=1']) {
      await page.goto(`/resources?pack=${PACK}&unit=S03-U004${q}`);
      await expect(screen(page).locator('.fia-res__row').first()).toBeVisible();
      const over = await page.evaluate(() =>
        [...document.querySelectorAll('[data-screen="S09"] *')]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5);
          })
          .map((e) => e.className),
      );
      expect(over).toEqual([]);
    }
  });
}
