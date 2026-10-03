import { expect, test, type Page } from '@playwright/test';

// F6-S19 Coverage in glass on the built app (nodded mock design/alpha-v2-screens/19-coverage.html,
// Layer frame): the title "What Español has" with one labelled way back, the key before the cards,
// six kit GlassSurface type cards led by the guide's kind bead with Text and Audio marks on kit
// GlassChip, the voice card, and no primary. Every chip is the pipeline catalog's (data/catalog);
// audio the data has not filled reads "not yet". At 200% and 310% nothing passes 390 px and no text clips.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

async function seed(page: Page, textSize = 'system') {
  await page.addInitScript((size) => {
    localStorage.setItem(
      'fia.settings.v1',
      JSON.stringify({
        schemaVersion: 1,
        narrationMode: 'source-fallback',
        mediaTier: 'phone',
        contentLanguage: 'spa',
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

const screen = (page: Page) => page.locator('[data-screen="S19"]');
const card = (page: Page, key: string) => screen(page).locator(`li[data-type="${key}"]`);

test("spa: the mock's regions from data — title, Back, key, six cards, voice, no primary", async ({
  page,
}) => {
  await seed(page);
  await page.goto('/coverage?lang=spa');
  const s = screen(page);
  await expect(s.getByRole('heading', { level: 1 })).toHaveText('What Español has');
  await expect(s.locator('.s19-hero')).toHaveText('What Español has');
  await expect(s.getByText('What this language has on FIA')).toBeVisible();

  // the key lists the marks the cards use, before them (no AI voice is in the data yet)
  const key = s.getByRole('list', { name: 'What the marks mean' });
  await expect(key.getByRole('listitem')).toHaveText(['on FIA in Español', 'not yet']);
  await expect(key.locator('[data-kit-gap="minus"]')).toHaveCount(1);

  const cards = s.locator('.s19-cards > li');
  await expect(cards).toHaveCount(6);
  await expect(s.getByRole('heading', { level: 2 })).toHaveText([
    'Guide',
    'Scripture',
    'Key terms',
    'Images',
    'Maps',
    'Videos',
  ]);
  const cell = (k: string, col: string) => card(page, k).locator(`[data-col="${col}"] [data-mark]`);
  const expected: [string, string, string, string, string][] = [
    ['guide', 'on', '396 passages', 'absent', 'not yet'],
    ['scripture', 'on', '2 editions', 'absent', 'not yet'],
    ['terms', 'on', '238 terms', 'on', '10 recordings'],
    ['images', 'on', '217 titles', 'none', 'none'],
    ['maps', 'absent', 'not yet · English shown', 'none', 'none'],
    ['videos', 'on', '55 titles', 'on', 'in the video'],
  ];
  for (const [k, tm, tw, am, aw] of expected) {
    await expect(cell(k, 'text')).toHaveAttribute('data-mark', tm);
    await expect(cell(k, 'text')).toHaveText(tw);
    await expect(cell(k, 'audio')).toHaveAttribute('data-mark', am);
    await expect(cell(k, 'audio')).toHaveText(aw);
  }
  // each card leads with the guide's kind bead (kit Bead): shape and kind, never colour alone
  await expect(card(page, 'guide').locator('svg[data-kind="plain"]')).toHaveCount(1);
  await expect(card(page, 'terms').locator('svg[data-kind="term"]')).toHaveCount(1);
  await expect(card(page, 'maps').locator('svg[data-kind="media"]')).toHaveCount(1);
  await expect(card(page, 'videos').locator('svg[data-kind="video"]')).toHaveCount(1);

  const voice = s.locator('.s19-voice');
  await expect(voice).toHaveAttribute('data-voice', 'not-yet');
  await expect(voice).toContainText('Voice: not yet in Español');
  await expect(voice).toContainText('Scripture text is never made by AI.');

  // Layer frame: no primary, no tab bar; one labelled way back (direct entry → the library)
  await expect(page.locator('[data-role="primary"]')).toHaveCount(0);
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await s.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('[data-screen="S02"]')).toBeVisible();
});

test('the catalog not loading says so and tries again', async ({ page }) => {
  await seed(page);
  let fail = true;
  await page.route(/\/data\/catalog\/spa\.json$/, (r) =>
    fail ? r.fulfill({ status: 503, body: '' }) : r.continue(),
  );
  await page.goto('/coverage?lang=spa');
  const alert = screen(page).getByRole('alert');
  await expect(alert).toContainText('Coverage could not load.');
  await expect(screen(page).locator('.s19-cards')).toHaveCount(0);
  fail = false;
  await alert.getByRole('button', { name: 'Try again' }).click();
  await expect(screen(page).locator('.s19-cards > li')).toHaveCount(6);
  await expect(screen(page).getByRole('alert')).toHaveCount(0);
});

for (const [step, size] of [
  ['x200', 'max'],
  ['x310', 'huge'],
] as const) {
  test(`large text ${step}: nothing past 390 px, no clipped text`, async ({ page }) => {
    await seed(page, size);
    await page.goto('/coverage?lang=spa');
    await expect(page.locator('html')).toHaveAttribute('data-text-step', step);
    await expect(screen(page).locator('.s19-voice')).toBeVisible();
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('main *, header *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > 390.5) out.push(`past 390: ${el.tagName} ${r.right}`);
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
        if (
          own &&
          el.scrollWidth > el.clientWidth + 1 &&
          getComputedStyle(el).overflow !== 'visible'
        )
          out.push(`clipped: ${el.textContent!.slice(0, 40)}`);
      }
      return out;
    });
    expect(bad).toEqual([]);
    // the way back stays a ≥ 48 px target on the first line
    const back = (await screen(page).getByRole('button', { name: 'Back' }).boundingBox())!;
    const hero = (await screen(page).locator('.s19-hero').boundingBox())!;
    expect(back.height).toBeGreaterThanOrEqual(48);
    expect(back.y).toBeLessThan(hero.y);
  });
}
