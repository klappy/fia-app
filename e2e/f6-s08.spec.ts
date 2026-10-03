import { expect, test, type Page } from '@playwright/test';

// F6-S08 (BUILD-ORDER lane F; nodded mock cookbook design/alpha-v2-screens/08-scripture-reader.html):
// S08 is the guide card's Text view (PRD § 4 S08, § 8.1). Proves: the glass frame, the progress band
// at the guide's own position, Guide · Text · Resources with Text active, the voice chip, the edition
// (kit GlassSelect) and the passage; switching edition keeps the passage; the Guide view goes back
// to S05 at the same part; a cold open with no guide still reads (v1 offline floor); nothing runs past
// the phone at 200% and 310%.
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });

const PACK = 'eng.MRK-1-1-13';

async function seed(page: Page, opts: { unitId?: string; textSize?: string } = {}) {
  await page.addInitScript(
    ({ PACK, opts }) => {
      const unitId = opts.unitId ?? 'S03-U004';
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
          position: { stepId: unitId.slice(0, 3), unitId, visited: [unitId], finished: false },
          checkpoint: null,
          savedAt: new Date().toISOString(),
        }),
      );
      if (opts.textSize)
        localStorage.setItem(
          'fia.settings.v1',
          JSON.stringify({
            schemaVersion: 1,
            narrationMode: 'source-fallback',
            subtitleMode: 'off',
            mediaTier: 'phone',
            contentLanguage: 'eng',
            uiLanguage: 'eng',
            textSize: opts.textSize,
            lowLiteracy: false,
            theme: 'system',
            disclosuresPresented: [],
            telemetryOptIn: false,
          }),
        );
    },
    { PACK, opts },
  );
}

const screen = (page: Page) => page.locator('[data-screen="S08"]');

test('the guide card Text view: band, views, voice chip, edition and passage', async ({ page }) => {
  await seed(page);
  await page.goto('/guide');
  await page.locator('.fia-views [role="radio"]', { hasText: 'Text' }).click();
  await expect(page).toHaveURL(/\/scripture\?pack=/);
  const s = screen(page);
  await expect(s.locator('.fia-header .fia-logo')).toBeVisible();
  await expect(s.locator('#fia-band')).toHaveAttribute('data-part', '4');
  await expect(s.locator('.fia-views [aria-checked="true"]')).toHaveText('Text');
  await expect(s.locator('.fia-guide-card__voice')).toBeVisible();
  await expect(s.locator('select.fia-reader-edition')).toHaveValue('BSB');
  await expect(s.locator('.fia-text__verse').first()).toContainText(
    'This is the beginning of the gospel',
  );
  // v1 strings and bones kept: the edition's long name under the control, verse numbers as buttons.
  await expect(s.locator('.fia-reader-long')).toContainText('English');
  await expect(s.getByRole('button', { name: 'Verse 1', exact: true })).toBeVisible();
  // No disabled primary when there is no reading clip (spec 08 rule 1): the thumb holds nothing.
  await expect(s.locator('[data-fia-primary][disabled]')).toHaveCount(0);
});

test('switching edition keeps the passage; the Guide view returns to the same part', async ({
  page,
}) => {
  await seed(page);
  await page.goto(`/scripture?pack=${PACK}&unit=S03-U004`);
  const s = screen(page);
  const select = s.locator('select.fia-reader-edition');
  await expect(select).toHaveValue('BSB');
  const options = await select.locator('option').allTextContents();
  expect(options.length).toBeGreaterThan(1);
  await select.selectOption(options[1]);
  await expect(s).toHaveAttribute('data-screen', 'S08');
  await expect(s.locator('.fia-guide')).toHaveAttribute('data-edition', options[1]);
  await expect(s.locator('.fia-text__verse').first()).toBeVisible();
  await s.locator('.fia-views [role="radio"]', { hasText: 'Guide' }).click();
  await expect(page).toHaveURL(/\/guide/);
  await expect(page.locator('.fia-guide')).toHaveAttribute('data-unit-id', 'S03-U004');
});

test('a cold open with no guide position still reads the passage', async ({ page }) => {
  await page.goto(`/scripture?pack=${PACK}`);
  await expect(screen(page).locator('.fia-text__verse').first()).toBeVisible();
  await expect(screen(page).locator('.fia-views [aria-checked="true"]')).toHaveText('Text');
});

for (const [textSize, label] of [
  ['max', '200%'],
  ['huge', '310%'],
] as const) {
  test(`at ${label} text and 320 px nothing runs past the phone`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await seed(page, { textSize });
    await page.goto(`/scripture?pack=${PACK}&unit=S03-U004`);
    await expect(screen(page).locator('.fia-text__verse').first()).toBeVisible();
    const over = await page.evaluate(() =>
      [...document.querySelectorAll('[data-screen="S08"] *')]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5);
        })
        .map((e) => e.className),
    );
    expect(over).toEqual([]);
  });
}
