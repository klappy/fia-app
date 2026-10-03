import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// F6-S03 Pericope list in glass on the built app (mock design/alpha-v2-screens/03-pericope-list.html):
// browse (J-A1) — quiet back row, hero + Select, kit GlassSearch, kit CatalogRow rows with honest
// sizes, one primary; select (J-A2, R-308) — rows are checkboxes whose state is a kit GlassChip
// (Saved · Selected · Add), the summary card, "Save 3 for offline" saving through C-07 at the Text
// tier; at 200% and 310% nothing passes 390 px, no text clips, the primary stays on screen.
test.use({ viewport: { width: 390, height: 844 } });

const PACK = 'eng.MRK-1-1-13';
const units = JSON.parse(
  readFileSync(new URL('../data/packs/eng.MRK-1-1-13/guide-units.json', import.meta.url), 'utf8'),
) as { steps: { units: { id: string; hidden?: boolean }[] }[] };
const order = units.steps.flatMap((s) => s.units.map((u) => u.id));
const walked = units.steps.flatMap((s) => s.units.filter((u) => !u.hidden)).length;
const NB = '⁠';
const ref = (s: string) => s.replace(/–/g, `${NB}–${NB}`);

/** English · Mark, and (optionally) a stored guide at part 4 of step 3, as on every v2 mock. */
async function seed(page: Page, { session = true, textSize = 'system' } = {}) {
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
    ([w, pack, session, textSize]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(
        'fia.flow.current.v1',
        JSON.stringify(
          session
            ? { language: 'eng', book: 'MRK', packId: pack }
            : { language: 'eng', book: 'MRK' },
        ),
      );
      if (session) localStorage.setItem(`fia.workspace.v1.${pack}`, JSON.stringify(w));
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
      );
    },
    [ws, PACK, session, textSize] as const,
  );
}

const screen = (page: Page) => page.locator('[data-screen="S03"]');
const row = (page: Page, id: string) => screen(page).locator(`[data-pack-id="${id}"]`);
const NOT_YET_EN = '◌ not yet in English';
// This build ships one Mark pack (eng.MRK-1-1-13, data/catalog/ready.json); every other Mark
// passage is "not yet" and is not a choice (GAP-NOPACK, #55). The multi-select mechanics below run
// as a build that ships these Mark packs: the ready index is served with them added.
const CHOICES = ['eng.MRK-1-14-20', 'eng.MRK-1-21-28', 'eng.MRK-1-29-34', 'eng.MRK-1-35-39'];
async function ships(page: Page, extra: string[]) {
  await page.route('**/data/catalog/ready.json', async (route) => {
    const res = await route.fetch();
    const doc = (await res.json()) as { packs: string[] };
    await route.fulfill({ response: res, json: { ...doc, packs: [...doc.packs, ...extra] } });
  });
}

test.describe('browse and select (no saves)', () => {
  test.use({ serviceWorkers: 'block' });

  test('browse: back row, hero + Select, search, kit rows with honest sizes, one primary', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/pericopes');
    const s = screen(page);
    await expect(s.getByRole('heading', { level: 1 })).toHaveText('Mark');
    await expect(s.locator('.s03-hero')).toHaveText('Mark');
    await expect(s.getByRole('button', { name: 'Library' })).toBeVisible();
    const toggle = page.getByTestId('select-toggle');
    await expect(toggle).toHaveText('Select');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(s.getByRole('searchbox', { name: 'Search Mark' })).toHaveAttribute(
      'placeholder',
      'Search Mark…',
    );
    await expect(page.getByTestId('list-hint')).toHaveText('68 passages · tap one to see it');
    const rows = s.locator('button[data-pack-id]');
    await expect(rows).toHaveCount(68);
    // kit CatalogRow on one kit GlassSurface well; the title is the reference, always
    await expect(s.locator('.s03-well button.fia-catalog')).toHaveCount(68);
    await expect(rows.first()).toHaveAttribute('data-pack-id', PACK);
    await expect(rows.nth(1).locator('div[dir]')).toHaveText(ref('Mark 1:14–20'));
    // the guide in progress counts its walked parts; the others are the catalog's estimate (≈),
    // and an unmeasured Text size reads ≈ (never an estimate as exact; R-307, R-309)
    await expect(row(page, PACK).getByTestId('row-size')).toHaveText(
      new RegExp(`^${walked}\\sparts\\s·\\s\\d+\\sKB$`),
    );
    // a passage with no pack in this build says not yet in place of a size, never a size (#55)
    await expect(row(page, 'eng.MRK-1-14-20').locator('[data-role="not-yet"]')).toHaveText(
      NOT_YET_EN,
    );
    await expect(row(page, 'eng.MRK-1-14-20').getByTestId('row-size')).toHaveCount(0);
    await expect(s.getByTestId('row-saved')).toHaveCount(0); // nothing saved in this context
    const primary = page.locator('[data-role="primary"]');
    await expect(primary).toHaveCount(1);
    await expect(primary).toHaveText(/Continue Mark 1:1⁠?–⁠?13/);
    // a row opens its passage card
    await rows.nth(1).click();
    await expect(page.locator('[data-screen="S04"]')).toBeVisible();
    await page.goBack();
    await s.getByRole('button', { name: 'Library' }).click();
    await expect(page.locator('[data-screen="S02"]')).toBeVisible();
  });

  test('search narrows by reference; nothing matching says so', async ({ page }) => {
    await seed(page);
    await page.goto('/pericopes');
    const search = screen(page).getByRole('searchbox');
    await search.fill('1:14');
    await expect(screen(page).locator('button[data-pack-id]')).toHaveCount(1);
    await search.fill('zzz');
    await expect(screen(page).getByText('Nothing matches in Mark.')).toBeVisible();
  });

  test('no guide in progress: the rows are the way in, no primary is invented', async ({
    page,
  }) => {
    await seed(page, { session: false });
    await page.goto('/pericopes');
    await expect(screen(page).locator('button[data-pack-id]')).toHaveCount(68);
    await expect(page.locator('[data-role="primary"]')).toHaveCount(0);
    // with no guide in progress the passage with a pack shows the catalog's parts estimate (≈) and
    // its measured Text size, exact (R-307, R-309)
    await expect(row(page, PACK).getByTestId('row-size')).toHaveText(/^≈\d+\sparts\s·\s\d+\sKB$/);
  });

  test('select: rows are checkboxes; the GlassChip selected state, summary, Save 3 for offline', async ({
    page,
  }) => {
    await seed(page);
    await ships(page, CHOICES);
    await page.goto('/pericopes');
    const toggle = page.getByTestId('select-toggle');
    await toggle.click();
    await expect(toggle).toHaveText('Done');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('list-hint')).toHaveText(
      '68 passages · tap a passage to choose it for saving',
    );
    // the five passages with a pack are checkboxes; the 63 not-yet passages are not
    const boxes = screen(page).getByRole('checkbox');
    await expect(boxes).toHaveCount(1 + CHOICES.length);
    const primary = page.locator('[data-role="primary"]');
    await expect(primary).toHaveText(/Save for offline/);
    await expect(primary).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('select-summary')).toHaveCount(0);

    const ids = ['eng.MRK-1-14-20', 'eng.MRK-1-21-28', 'eng.MRK-1-29-34'];
    for (const id of ids) await row(page, id).click();
    for (const id of ids) {
      await expect(row(page, id)).toHaveAttribute('aria-checked', 'true');
      await expect(row(page, id).getByTestId('row-selected')).toHaveText('Selected');
      await expect(row(page, id).locator('.s03-chip.is-on')).toBeVisible();
    }
    await expect(row(page, 'eng.MRK-1-35-39')).toHaveAttribute('aria-checked', 'false');
    await expect(row(page, 'eng.MRK-1-35-39').getByTestId('row-add')).toHaveText('Add');
    // the chip's word is display only: the checkbox state carries it for assistive tech
    await expect(row(page, ids[0]).getByTestId('row-selected')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    const summary = page.getByTestId('select-summary');
    await expect(summary).toContainText(/^Selected 3 · ≈\d+\sKB of guide text/);
    await expect(summary).toContainText('Text only');
    await expect(primary).toHaveText(/Save 3 for offline/);
    // at 1× the list scrolls in its well, so the summary sits on the first screen above the primary
    const sb = (await summary.boundingBox())!;
    const pb = (await primary.boundingBox())!;
    expect(sb.y).toBeGreaterThanOrEqual(0);
    expect(sb.y + sb.height).toBeLessThanOrEqual(pb.y);
    await expect(primary).not.toHaveAttribute('aria-disabled', 'true');
    // a second tap unchooses
    await row(page, ids[2]).click();
    await expect(row(page, ids[2])).toHaveAttribute('aria-checked', 'false');
    await expect(summary).toContainText('Selected 2');
    await expect(primary).toHaveText(/Save 2 for offline/);
    // Done leaves select mode; the rows open passages again
    await toggle.click();
    await expect(screen(page).getByRole('checkbox')).toHaveCount(0);
    await expect(primary).toHaveText(/Continue Mark 1:1⁠?–⁠?13/);
  });

  test('select: a not-yet passage is not a choice and never counts in the summary', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/pericopes');
    const notYet = row(page, 'eng.MRK-1-14-20');
    await expect(notYet.locator('[data-role="not-yet"]')).toHaveText(NOT_YET_EN);
    await page.getByTestId('select-toggle').click();
    // only the passage with a pack is a checkbox (this build ships one Mark pack)
    await expect(screen(page).getByRole('checkbox')).toHaveCount(1);
    await expect(row(page, PACK)).toHaveAttribute('role', 'checkbox');
    await expect(notYet).not.toHaveAttribute('role', 'checkbox');
    await expect(notYet).not.toHaveAttribute('aria-checked');
    await expect(notYet).toHaveAttribute('aria-disabled', 'true');
    await expect(notYet.getByTestId('row-add')).toHaveCount(0);
    await expect(notYet.locator('[data-role="not-yet"]')).toHaveText(NOT_YET_EN);
    // a tap on it picks nothing: no Selected chip, no summary, the primary stays disabled
    await notYet.click({ force: true });
    await expect(notYet.getByTestId('row-selected')).toHaveCount(0);
    await expect(page.getByTestId('select-summary')).toHaveCount(0);
    const primary = page.locator('[data-role="primary"]');
    await expect(primary).toHaveText(/Save for offline/);
    await expect(primary).toHaveAttribute('aria-disabled', 'true');
    // with the passage that has a pack chosen too, the summary counts only that one
    await row(page, PACK).click();
    await expect(row(page, PACK)).toHaveAttribute('aria-checked', 'true');
    await notYet.click({ force: true });
    const summary = page.getByTestId('select-summary');
    await expect(summary).toContainText(/^Selected 1 · \d+\sKB of guide text/);
    await expect(primary).toHaveText(/Save 1 for offline/);
  });

  for (const [step, size] of [
    ['x200', 'max'],
    ['x310', 'huge'],
  ] as const) {
    test(`large text ${step}: nothing past 390 px, no clipped text, the primary on screen`, async ({
      page,
    }) => {
      await seed(page, { textSize: size });
      await ships(page, CHOICES);
      await page.goto('/pericopes');
      await expect(page.locator('html')).toHaveAttribute('data-text-step', step);
      await expect(screen(page).locator('button[data-pack-id]').first()).toBeVisible();
      await expect(screen(page).getByRole('searchbox')).toHaveAttribute('placeholder', 'Search');
      for (const mode of ['browse', 'select']) {
        if (mode === 'select') {
          await page.getByTestId('select-toggle').click();
          for (const id of ['eng.MRK-1-14-20', 'eng.MRK-1-21-28', 'eng.MRK-1-29-34'])
            await row(page, id).click();
          await expect(page.getByTestId('select-summary')).toBeVisible();
        }
        const bad = await page.evaluate(() => {
          const out: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>('main *, header *')) {
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
        expect(bad, mode).toEqual([]);
        const primary = page.locator('[data-role="primary"]');
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const pb = (await primary.boundingBox())!;
        expect(pb.y).toBeGreaterThanOrEqual(0);
        expect(pb.y + pb.height).toBeLessThanOrEqual(844);
        expect(pb.x + pb.width).toBeLessThanOrEqual(390);
        await page.evaluate(() => window.scrollTo(0, 0));
      }
    });
  }
});

test('Save 1 for offline saves through C-07 at the Text tier; the row shows the verified state', async ({
  page,
}) => {
  await seed(page, { session: false });
  await page.goto('/pericopes');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r));
  });
  await page.getByTestId('select-toggle').click();
  await row(page, PACK).click();
  const primary = page.locator('[data-role="primary"]');
  await expect(primary).toHaveText(/Save 1 for offline/);
  await primary.click();
  // the save leaves select mode once every chosen passage is verified saved
  await expect(row(page, PACK).getByTestId('row-saved')).toHaveText('Saved', { timeout: 30_000 });
  await expect(page.getByTestId('select-toggle')).toHaveText('Select');
  // a verified save shows its own bytes, exact
  await expect(row(page, PACK).getByTestId('row-size')).toHaveText(/·\s\d+\sKB$/);
  // in select mode the saved passage is not a choice
  await page.getByTestId('select-toggle').click();
  await expect(row(page, PACK)).not.toHaveAttribute('role', 'checkbox');
  await expect(row(page, PACK).getByTestId('row-saved')).toBeVisible();
  // nor are the 67 others: this build ships no pack for them, so they say not yet (#55)
  await expect(screen(page).getByRole('checkbox')).toHaveCount(0);
  await expect(screen(page).locator('[data-role="not-yet"]')).toHaveCount(67);
});
