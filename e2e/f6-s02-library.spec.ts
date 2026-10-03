import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// F6-S02 Library in glass on the built app (mock design/alpha-v2-screens/02-library.html):
// kit CatalogRow book rows, kit GlassSearch finding passages by reference, the resume recap and
// one primary; at 200% and 310% text nothing passes 390 px, no text clips and the primary stays
// on screen (PRD § 5 rule 6, § 8.5).
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });

const PACK = 'eng.MRK-1-1-13';
const units = JSON.parse(
  readFileSync(new URL('../data/packs/eng.MRK-1-1-13/guide-units.json', import.meta.url), 'utf8'),
) as { steps: { units: { id: string }[] }[] };
const order = units.steps.flatMap((s) => s.units.map((u) => u.id));

/** A stored session at part 4 of step 3 (S03-U004), as on every v2 mock. */
async function seedSession(page: Page) {
  const ws = {
    schemaVersion: 1,
    packId: PACK,
    contentLanguage: 'eng',
    theme: 'light',
    view: 'guide',
    position: {
      stepId: 'S03',
      unitId: 'S03-U004',
      visited: order.slice(0, order.indexOf('S03-U004') + 1),
      finished: false,
    },
    checkpoint: null,
    savedAt: '2026-10-02T12:00:00.000Z',
  };
  await page.addInitScript(
    ([w, pack]) => {
      localStorage.setItem(
        'fia.flow.current.v1',
        JSON.stringify({ language: 'eng', book: 'MRK', packId: pack }),
      );
      localStorage.setItem(`fia.workspace.v1.${pack}`, JSON.stringify(w));
    },
    [ws, PACK] as const,
  );
}

test('first visit: hero, counts, book rows on the kit, one primary "Open Mark"', async ({
  page,
}) => {
  await page.goto('/library');
  const screen = page.locator('[data-screen="S02"]');
  await expect(screen.getByRole('heading', { level: 1 })).toHaveText('Library');
  await expect(screen.getByText('English · 32 books · 1,497 passages')).toBeVisible();
  const rows = screen.locator('button[data-book]');
  await expect(rows).toHaveCount(32);
  // GAP-NOPACK (#55): books with a passage that opens come first; the rest read "not yet in English".
  await expect(rows.first()).toHaveAttribute('data-book', 'MRK');
  await expect(screen.locator('button[data-book="GEN"] [data-role="not-yet"]')).toHaveText(
    '◌ not yet in English',
  );
  const mark = screen.locator('button[data-book="MRK"]');
  await expect(mark).toContainText('68 passages');
  // Mark 1:1–13 plays the stand-in's AI-voiced clips: AI narration is always marked (C-06).
  await expect(mark).toContainText('AI voice');
  await expect(screen.locator('[data-role="resume"]')).toHaveCount(0);
  const primary = page.locator('[data-role="primary"]');
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveText(/Open Mark/);
  await primary.click();
  await expect(page.locator('[data-screen="S03"]')).toBeVisible();
});

test('search finds passages by reference, titled by the reference; a row opens the passage', async ({
  page,
}) => {
  await page.goto('/library');
  await page.getByRole('searchbox', { name: 'Search reference or title…' }).fill('Mark 1');
  const passages = page.locator('.s02-passages [data-pack-id]');
  await expect(passages.first()).toHaveAttribute('data-pack-id', PACK);
  await expect(passages.first()).toHaveText(/^Mark 1:1\u2060?–\u2060?13$/);
  for (const text of await passages.allTextContents()) expect(text).toMatch(/^Mark 1:/);
  await expect(page.locator('.fia-pericope__sub')).toHaveCount(0); // subtitles off by default
  await page.getByRole('searchbox').fill('zzz');
  await expect(page.getByText(/Nothing matches/)).toBeVisible();
  await page.getByRole('searchbox').fill('Mark 1:1-13');
  await passages.first().click();
  await expect(page.locator('[data-screen="S04"]')).toBeVisible();
});

test('resume: "Where you left off" recaps the band; the primary continues the guide', async ({
  page,
}) => {
  await seedSession(page);
  await page.goto('/library');
  const card = page.locator('[data-role="resume"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Where you left off');
  await expect(card).toContainText('Mark 1:1–13 · Defining the Scenes'.replace(/–/g, '⁠–⁠'));
  await expect(card).toContainText('Step 3 of 6 · part 4 of 25 in this step');
  await expect(card).toContainText('Next: talk after part 7');
  await expect(card.getByRole('img', { name: 'Step 3 of 6, Defining the Scenes' })).toBeVisible();
  await expect(card.getByRole('img', { name: /You are here, part 4 of 25/ })).toBeVisible();
  // not saved in this context: no saved badge is claimed
  await expect(card).not.toContainText('Saved on this phone');
  // the card is in the first screen at 1× (the book list scrolls inside its well)
  const box = (await card.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  const primary = page.locator('[data-role="primary"]');
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveText(/Continue Mark 1:1\u2060?–\u2060?13/);
  await primary.click();
  await expect(page).toHaveURL(/\/guide$/);
});

for (const [step, size] of [
  ['x200', 'max'],
  ['x310', 'huge'],
] as const) {
  test(`large text ${step}: nothing past 390 px, no clipped text, the primary on screen`, async ({
    page,
  }) => {
    await seedSession(page);
    await page.addInitScript(
      (textSize) =>
        localStorage.setItem(
          'fia.settings.v1',
          JSON.stringify({
            schemaVersion: 1,
            narrationMode: 'source-fallback',
            mediaTier: 'phone',
            contentLanguage: 'eng',
            uiLanguage: 'eng',
            textSize,
            lowLiteracy: false,
            theme: 'system',
            disclosuresPresented: [],
            telemetryOptIn: false,
          }),
        ),
      size,
    );
    await page.goto('/library');
    await expect(page.locator('html')).toHaveAttribute('data-text-step', step);
    await expect(page.locator('[data-role="resume"]')).toBeVisible();
    await page.getByRole('searchbox').fill('Mark 1');
    await expect(page.locator('.s02-passages [data-pack-id]').first()).toBeVisible();
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('main *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > 390.5) out.push(`past 390: ${el.className || el.tagName} ${r.right}`);
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
    // the search field keeps its words whole (the short placeholder at 200%+)
    await page.getByRole('searchbox').fill('');
    await expect(page.getByRole('searchbox')).toHaveAttribute('placeholder', 'Search');
    const primary = page.locator('[data-role="primary"]');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const pb = (await primary.boundingBox())!;
    expect(pb.y).toBeGreaterThanOrEqual(0);
    expect(pb.y + pb.height).toBeLessThanOrEqual(844);
    expect(pb.x + pb.width).toBeLessThanOrEqual(390);
  });
}
