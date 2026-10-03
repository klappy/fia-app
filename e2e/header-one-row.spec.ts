import { expect, test, type Page } from '@playwright/test';

// Hub header one row (mock 02-library; fia-app-cookbook work/active/2026-10-03-fia-spanish-ui-strings
// FU-c, FU-d): at 390 × 844 the hub header keeps the logo, the offline chip, the language pill and
// Explore on one row, online and offline, in English and in Spanish. FU-d measured 122 px (eng) and
// 110 px (spa) offline before the fix; one row is the 64 px pill row.
test.use({ viewport: { width: 390, height: 844 } });

async function seed(page: Page, lang: 'eng' | 'spa') {
  await page.addInitScript((l) => {
    localStorage.setItem(
      'fia.settings.v1',
      JSON.stringify({
        schemaVersion: 1,
        narrationMode: 'source-only',
        subtitleMode: 'off',
        mediaTier: 'phone',
        contentLanguage: l,
        uiLanguage: l,
        textSize: 'system',
        lowLiteracy: false,
        theme: 'light',
        disclosuresPresented: [],
        telemetryOptIn: false,
      }),
    );
  }, lang);
}

async function header(page: Page) {
  return page.evaluate(() => {
    const g = document.querySelector<HTMLElement>('.fia-header-grid')!;
    const kids = [...g.children].map((c) => c.getBoundingClientRect());
    return {
      grid: g.getBoundingClientRect().height,
      tallest: Math.max(...kids.map((k) => k.height)),
      tops: kids.map((k) => Math.round(k.top + k.height / 2)),
      header: g.parentElement!.offsetHeight,
    };
  });
}

async function oneRow(page: Page, label: string) {
  await expect
    .poll(
      async () => {
        const m = await header(page);
        return m.grid <= m.tallest + 1 && m.header < 80;
      },
      { message: `${label}: ${JSON.stringify(await header(page))}` },
    )
    .toBe(true);
  const m = await header(page);
  // every item shares one centre line
  expect(
    Math.max(...m.tops) - Math.min(...m.tops),
    `${label} ${JSON.stringify(m)}`,
  ).toBeLessThanOrEqual(2);
}

for (const [lang, chip, pill, explore] of [
  ['eng', '⊘ Offline', 'English', 'Explore'],
  ['spa', '⊘ Sin conexión', 'Español', 'Explorar'],
] as const) {
  test(`hub header is one row at 390 px, online and offline (${lang})`, async ({
    page,
    context,
  }) => {
    await seed(page, lang);
    await page.goto('/library');
    await expect(page.locator('[data-screen="S02"]')).toBeVisible();
    await expect(page.locator('header .fia-lang')).toHaveText(pill);
    await expect(page.locator('header .fia-explore')).toHaveText(explore);
    await oneRow(page, `${lang} online`);

    await context.setOffline(true);
    await expect(page.locator('header [data-role="offline-chip"]')).toHaveText(chip);
    await oneRow(page, `${lang} offline`);

    await context.setOffline(false);
    await expect(page.locator('header [data-role="offline-chip"]')).toHaveCount(0);
    await oneRow(page, `${lang} back online`);
  });
}

// FU-c: a pill that grows after mount without a resize (a late font swap, a longer label) wraps the
// row; the ResizeObserver catches it and the header steps down to one row again.
test('hub header re-fits when a pill grows after mount (late font, longer label)', async ({
  page,
}) => {
  await seed(page, 'eng');
  await page.goto('/library');
  await expect(page.locator('header .fia-explore')).toHaveText('Explore');
  await oneRow(page, 'eng before');
  // Stand-in for a wider web font arriving late: the same words, set wider.
  await page.addStyleTag({ content: 'header .fia-pill { letter-spacing: 1px !important; }' });
  await oneRow(page, 'eng after the pills grew');
});
