import { expect, test, type Page } from '@playwright/test';

// J-A2 steps 1–6 (prepare a phone for offline use) on the built app (vite preview + /sw.js):
// S03 row size → S04 tier picker (kit GlassSegmented) with pack-manifest sizes + storage estimate → Save (best
// published tier) → verified saved state on S04 and the S03 row → S13 lists it; S13 `Save a passage` lands on a card whose
// primary saves (no loop, J-A2--P-01 rerun 3). R-306, R-307, R-309; C-07 SAVE.
const PACK = 'spa.MRK-1-1-13';

async function controlled(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r));
  });
}

async function openMarcos(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-screen="S01"]')).toBeVisible();
  await controlled(page);
  await page.getByText('Español').click();
  await page.locator('[data-role="primary"]').click();
  await expect(page.locator('[data-screen="S02"]')).toBeVisible();
  await page.locator('[data-book="MRK"]').click();
  await expect(page.locator('[data-screen="S03"]')).toBeVisible();
}

test('J-A2 1–6: size on S03, tier picker on S04, Save best published tier, saved marks', async ({
  page,
}) => {
  await openMarcos(page);

  // Step 1 — S03 row shows its parts and the Text size a save downloads (F6-S03: the list saves
  // Text only; the tier picker is S04's). Measured for built packs (exact); an estimate reads "≈".
  const row = page.locator(`[data-pack-id="${PACK}"]`);
  await expect(row.getByTestId('row-size')).toHaveText(/^≈?\d+\sparts\s·\s≈?\d+(\.\d)?\s(KB|MB)$/);
  await expect(row.getByTestId('row-saved')).toHaveCount(0);
  await row.click();

  // Step 2 — S04 save card (F6-S04 glass): the mock's three tiers on kit GlassSegmented; sizes are the
  // bytes a save downloads (pack C-02 manifest). The pack publishes only Text today, so Phone and Full
  // read "not yet", cannot be chosen (aria-disabled), and the best available tier (Text) is chosen —
  // no Phone claim (R-307/R-309).
  await expect(page.locator('[data-screen="S04"]')).toBeVisible();
  const saveRow = page.getByTestId('save-row');
  await expect(saveRow.getByRole('heading', { name: 'Save for offline' })).toBeVisible();
  const tiers = saveRow.getByRole('radiogroup', { name: 'How much to save' });
  await expect(tiers.getByRole('radio')).toHaveCount(3);
  await expect(saveRow.getByTestId('tier-size-text')).toHaveText(/^\d+(\.\d)?\u00a0MB$/);
  for (const tier of ['phone', 'original']) {
    await expect(saveRow.getByTestId(`tier-size-${tier}`)).toHaveText('not yet');
    await expect(tiers.locator(`[data-tier="${tier}"]`)).toBeDisabled();
  }
  await expect(tiers.locator('[data-tier="text"]')).toBeChecked();
  await expect(saveRow.getByTestId('storage-estimate')).toContainText('on this connection');
  const textSize = (await saveRow.getByTestId('tier-size-text').textContent())!
    .trim()
    .replace('\u00a0', ' ');
  // Pack manifest text tier for spa.MRK-1-1-13 = 277,189 bytes → "0.3 MB" (data/packs/…/manifest.json).
  expect(textSize).toBe('0.3 MB');
  // A tap on a tier that is not published changes nothing.
  await tiers.locator('[data-tier="phone"]').click({ force: true });
  await expect(tiers.locator('[data-tier="text"]')).toBeChecked();
  const save = saveRow.getByTestId('save-button');
  await expect(save).toHaveText(`Save Text (${textSize})`);
  // The primary stays Start (one primary, rule 1); the save is the quiet kit button in the card.
  await expect(page.locator('[data-role="primary"]')).toContainText('Start');

  // Steps 4–5 — Save starts here (C-07 SAVE); the card shows the verified state, stamped with the
  // tier actually saved and its verified bytes. The cells stay, read-only, on the saved tier.
  await save.click();
  await expect(saveRow.getByTestId('save-badge')).toHaveText('Saved · text', { timeout: 20_000 });
  await expect(saveRow.getByTestId('saved-row')).toContainText('Remove from this phone');
  await expect(tiers.locator('[data-tier="text"]')).toBeChecked();
  await expect(saveRow.getByTestId('tier-size-text')).toHaveText(textSize.replace(' ', '\u00a0'));

  // Step 6 — the S03 row carries the saved mark; S13 lists the pack under Saved.
  await page.goBack();
  await expect(page.locator('[data-screen="S03"]')).toBeVisible();
  await expect(row.getByTestId('row-saved')).toHaveText('Saved');
  // the verified save's own bytes, exact (no ≈); S03 writes sizes under 1 MB in KB
  await expect(row.getByTestId('row-size')).toHaveText(/·\s\d+\sKB$/);
  await page.goto('/downloads');
  await expect(page.locator('[data-screen="S13"]')).toBeVisible();
  await expect(page.getByText(`MRK 1:1–13 · Text · ${textSize}`)).toBeVisible();
  // `Save another passage` never reopens the saved card: it goes to the book's list (03).
  const primary = page.locator('[data-role="primary"]');
  await expect(primary).toContainText('Save another passage');
  await primary.click();
  await expect(page.locator('[data-screen="S03"]')).toBeVisible();
});

test('S13 Save a passage opens S04 in save-intent: the primary saves', async ({ page }) => {
  await openMarcos(page);
  await page.locator(`[data-pack-id="${PACK}"]`).click();
  await expect(page.locator('[data-screen="S04"]')).toBeVisible();
  await page.goto('/downloads');
  const primary = page.locator('[data-role="primary"]');
  await expect(primary).toContainText('Save a passage');
  await primary.click();
  await expect(page.locator('[data-screen="S04"]')).toBeVisible();
  await expect(page).toHaveURL(/\/passage\?save=1$/);
  await expect(primary).toContainText('Save Text (0.3 MB)');
  await expect(page.getByTestId('save-row').getByRole('button', { name: 'Start' })).toBeVisible();
  await primary.click();
  await expect(page.getByTestId('saved-row')).toBeVisible({ timeout: 20_000 });
  await expect(primary).toContainText('Start');
});
