import { expect, test, type Page } from '@playwright/test';

// F6-S01 (mock cookbook design/alpha-v2-screens/01-first-run-language.html): the kit LanguagePicker over the
// C-03 catalog with the mock's chips; the pick sets the header pill's language; at 200% and 310% nothing runs
// past 390 px and the one primary stays on screen (PRD § 5 rule 6).
const settings = (textSize: string) => ({
  schemaVersion: 1,
  narrationMode: 'source-fallback',
  mediaTier: 'phone',
  contentLanguage: 'eng',
  uiLanguage: 'eng',
  textSize,
  lowLiteracy: false,
  theme: 'light',
  disclosuresPresented: [],
  telemetryOptIn: false,
});

async function open(page: Page, textSize = 'system') {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((s) => {
    if (!localStorage.getItem('fia.settings.v1'))
      localStorage.setItem('fia.settings.v1', JSON.stringify(s));
  }, settings(textSize));
  await page.goto('/');
  await expect(page.locator('[data-screen="S01"] [role="radio"]')).toHaveCount(17);
}

test('S01 rows: catalog autonyms, the mock chips, one chosen row, hero and no header bar', async ({
  page,
}) => {
  await open(page);
  await expect(page.locator('.s01-hero svg[aria-label="FIA"]')).toBeVisible();
  await expect(page.locator('.fia-header-wrap')).toBeHidden();
  await expect(page.locator('[role="radio"][aria-checked="true"]')).toHaveCount(1);
  const hau = page.locator('[role="radio"][data-code="hau"]');
  await expect(hau).toHaveAttribute(
    'aria-label',
    /Hausa, Hausa\. Scripture not yet, Guide available, Key terms AI-filled/,
  );
  const eng = page.locator('[role="radio"][data-code="eng"]');
  await expect(eng.locator('[title="Maps · available"]')).toHaveCount(1);
  await expect(page.locator('.fia-lp')).not.toContainText('Bible');
  // the kit's search narrows the list; semantics follow the re-rendered rows
  await page.getByRole('textbox', { name: 'Search languages' }).fill('swa');
  await expect(page.locator('[role="radio"]')).toHaveCount(1);
  await expect(page.locator('[role="radio"]')).toHaveAttribute('data-code', 'swh');
});

test('S01 pick → library, and the header pill reads the chosen autonym', async ({ page }) => {
  await open(page);
  await page.locator('[role="radio"][data-code="spa"]').click();
  const primary = page.locator('[data-role="primary"]');
  await expect(primary).toHaveText(/Continue in Español/);
  await primary.click();
  await expect(page.locator('[data-screen="S02"]')).toBeVisible();
  // before F6-S01 the pill read English after any pick (S01 never wrote C-10 contentLanguage). The
  // pill's own words are the picker autonym ("Español", languages.ts), not the catalog.
  await expect(page.locator('.fia-lang')).toHaveText(/^español$/i);
});

test('S01 Send feedback opens S16 from S01', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Send feedback' }).click();
  await expect(page.locator('[data-screen="S16"]')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('from')).toBe('S01');
});

test('S01 with no catalog: the error card and "Try again"', async ({ page }) => {
  await page.route('**/data/catalog/manifest.json', (r) => r.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Could not load the language list');
  await expect(page.locator('[data-role="primary"]')).toHaveText(/Try again/);
});

for (const [step, textSize] of [
  ['200%', 'max'],
  ['310%', 'huge'],
] as const)
  test(`S01 at ${step}: nothing past 390 px, no sideways scroll, the primary on screen`, async ({
    page,
  }) => {
    await open(page, textSize);
    const r = await page.evaluate(() => {
      const over: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('[data-screen="S01"] *')) {
        const b = el.getBoundingClientRect();
        if (b.width && b.right > 390.5) over.push(`${el.tagName}.${el.className} ${b.right}`);
      }
      const p = document.querySelector('[data-role="primary"]')!.getBoundingClientRect();
      return {
        over,
        sideways: document.documentElement.scrollWidth - innerWidth,
        primary: p.top >= 0 && p.bottom <= innerHeight + 0.5,
      };
    });
    expect(r.over).toEqual([]);
    expect(r.sideways).toBe(0);
    expect(r.primary).toBe(true);
  });
