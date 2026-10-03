import { expect, test, type Page } from '@playwright/test';

// Spanish UI catalog (cookbook work/active/2026-10-03-fia-spanish-ui-strings, DoD 2–3): on first
// run one pick sets the guide and the app (SB-3, `s.lang.lede`), so choosing Español switches the
// chrome to the lazy Spanish catalog. S01 → S02 → S03 then shows Spanish labels and no raw keys.
test.use({ viewport: { width: 390, height: 844 } });

const RAW_KEY =
  /\bs\.(?:about|common|completion|coverage|downloads|feedback|guide|install|jump|lang|legend|library|overview|passage|pericopes|prov|resources|script|scripture|settings|stop|storage|term|update|video|viewer)\.[a-z0-9.-]+/;

async function noRawKeys(page: Page) {
  const text = await page.locator('body').innerText();
  expect(text, 'a raw s.* key is on screen').not.toMatch(RAW_KEY);
  const attrs = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-label],[placeholder],[title]')].flatMap((el) =>
      ['aria-label', 'placeholder', 'title'].map((a) => el.getAttribute(a) ?? ''),
    ),
  );
  for (const a of attrs) expect(a, 'a raw s.* key in an attribute').not.toMatch(RAW_KEY);
}

test('S01 → S03 in Spanish: Spanish labels, no raw keys, survives a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-screen="S01"]')).toBeVisible();
  await page.getByText('Español').click();
  const primary = page.locator('[data-role="primary"]');
  await expect(primary).toHaveText(/Continue in Español/);
  await primary.click();

  // S02 Library, in Spanish.
  const s02 = page.locator('[data-screen="S02"]');
  await expect(s02).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Biblioteca');
  await expect(s02).not.toContainText('Library');
  await noRawKeys(page);
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('fia.settings.v1')!));
  expect(settings.uiLanguage).toBe('spa');
  expect(settings.contentLanguage).toBe('spa');

  // S03 Pericope list for Mark, in Spanish.
  await page.locator('[data-screen="S02"] [data-role="primary"]').click();
  const s03 = page.locator('[data-screen="S03"]');
  await expect(s03).toBeVisible();
  await expect(s03.getByRole('button', { name: 'Seleccionar', exact: true })).toBeVisible();
  await expect(s03).toContainText(/pasajes? · toca uno para verlo/);
  await expect(s03).not.toContainText('tap one to see it');
  await noRawKeys(page);

  // A reload keeps the Spanish chrome (the saved UI language loads before the first paint).
  await page.reload();
  await expect(page.locator('[data-screen="S03"]')).toBeVisible();
  await expect(page.locator('[data-screen="S03"]')).toContainText(/toca uno para verlo/);
  await noRawKeys(page);
});

test('S14 says the Spanish menus are an AI translation (s.common.ui-lang-ai)', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      'fia.settings.v1',
      JSON.stringify({
        schemaVersion: 1,
        narrationMode: 'source-fallback',
        mediaTier: 'phone',
        contentLanguage: 'spa',
        uiLanguage: 'spa',
        textSize: 'system',
        lowLiteracy: false,
        theme: 'system',
        disclosuresPresented: [],
        telemetryOptIn: false,
      }),
    );
  });
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ajustes');
  await expect(page.locator('[data-mark="ui-lang-ai"]')).toHaveText(
    'Los menús y las etiquetas en Español son una traducción del inglés hecha por IA.',
  );
  await noRawKeys(page);
});
