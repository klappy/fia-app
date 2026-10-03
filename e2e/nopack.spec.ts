import { expect, test, type Page } from '@playwright/test';

// GAP-NOPACK: the catalog lists every guide the sources hold (~1,500 in English) but only the
// passages with a built pack open. A passage with no pack must not dead-end at S04 with
// "Could not read this passage's details": it reads "not yet in {language}" with a way to another
// passage, and the passages that open come first on S02 and S03. Proof on Mark 1:14–20 and
// Genesis 1:1–2:3 (no English pack), against Arabic Genesis 1:1–2:3 (built).
test.use({ serviceWorkers: 'block' });

const NOT_YET_EN = '◌ not yet in English';

async function library(page: Page, language: RegExp) {
  await page.goto('/');
  await expect(page.locator('[data-screen="S01"]')).toBeVisible();
  await page.getByRole('radio', { name: language }).click();
  await page.locator('[data-role="primary"]').click();
  await expect(page.locator('[data-screen="S02"]')).toBeVisible();
}

async function notYetCard(page: Page, title: string) {
  const s04 = page.locator('[data-screen="S04"]');
  await expect(s04).toBeVisible();
  await expect(s04.getByRole('heading', { level: 1 })).toHaveText(title);
  await expect(s04.locator('.fia-absent')).toContainText(NOT_YET_EN);
  await expect(s04.getByText("Could not read this passage's details.")).toHaveCount(0);
  await expect(s04.getByRole('alert')).toHaveCount(0);
  await expect(s04.getByRole('button', { name: 'Try again' })).toHaveCount(0);
}

test('Mark 1:14–20 (no pack) reads "not yet in English", never the error; ready passage first', async ({
  page,
}) => {
  await library(page, /English/);

  // S02: the book with a passage that opens comes first; a book with none says so in its row.
  const books = page.locator('[data-book]');
  await expect(books.first()).toHaveAttribute('data-book', 'MRK');
  await expect(page.locator('[data-book="MRK"] [data-role="not-yet"]')).toHaveCount(0);
  await expect(page.locator('[data-book="GEN"] [data-role="not-yet"]')).toHaveText(NOT_YET_EN);

  // S03: Mark 1:1–13 (built) first and unmarked; Mark 1:14–20 marked, with no download size.
  await page.locator('[data-book="MRK"]').click();
  await expect(page.locator('[data-screen="S03"]')).toBeVisible();
  const rows = page.locator('[data-pack-id]');
  await expect(rows.first()).toHaveAttribute('data-pack-id', 'eng.MRK-1-1-13');
  await expect(rows.first().locator('[data-role="not-yet"]')).toHaveCount(0);
  const row = page.locator('[data-pack-id="eng.MRK-1-14-20"]');
  await expect(row.locator('[data-role="not-yet"]')).toHaveText(NOT_YET_EN);
  await expect(row.getByTestId('row-size')).toHaveCount(0);

  // S04: the honest card, not the error; the way out leads back to the library.
  await row.click();
  await notYetCard(page, 'Mark 1:14–20');
  // Opened again cold (reload on /passage), it still says not yet.
  await page.reload();
  await notYetCard(page, 'Mark 1:14–20');
  await page.getByRole('button', { name: 'Another passage' }).click();
  await expect(page.locator('[data-screen="S02"]')).toBeVisible();

  // The ready passage still opens: S04 offers Start.
  await page.locator('[data-book="MRK"]').click();
  await page.locator('[data-pack-id="eng.MRK-1-1-13"]').click();
  await expect(page.locator('[data-screen="S04"]')).toBeVisible();
  await expect(page.locator('[data-role="primary"]')).toContainText('Start');
  await expect(page.locator('.fia-absent')).toHaveCount(0);
});

test('Genesis 1:1–2:3: not yet in English, opens in Arabic', async ({ page }) => {
  await library(page, /English/);
  await page.locator('[data-book="GEN"]').click();
  await expect(page.locator('[data-screen="S03"]')).toBeVisible();
  const gen = page.locator('[data-pack-id="eng.GEN-1-1-2-3"]');
  await expect(gen.locator('[data-role="not-yet"]')).toHaveText(NOT_YET_EN);
  // no Genesis passage opens in English: every row carries the mark
  const rows = page.locator('[data-pack-id]');
  const marked = page.locator('[data-pack-id] [data-role="not-yet"]');
  await expect(marked).toHaveCount(await rows.count());
  await gen.click();
  await notYetCard(page, 'Genesis 1:1–2:3');

  // Arabic: Genesis 1:1–2:3 is built, so Genesis comes first and the passage opens.
  await library(page, /العربية/);
  await expect(page.locator('[data-book]').first()).toHaveAttribute('data-book', 'GEN');
  await page.locator('[data-book="GEN"]').click();
  const arb = page.locator('[data-pack-id="arb.GEN-1-1-2-3"]');
  await expect(page.locator('[data-pack-id]').first()).toHaveAttribute(
    'data-pack-id',
    'arb.GEN-1-1-2-3',
  );
  await expect(arb.locator('[data-role="not-yet"]')).toHaveCount(0);
  await arb.click();
  await expect(page.locator('[data-screen="S04"]')).toBeVisible();
  await expect(page.locator('.fia-absent')).toHaveCount(0);
  await expect(page.locator('[data-role="primary"]')).toBeVisible();
  await expect(page.getByText("Could not read this passage's details.")).toHaveCount(0);
});
