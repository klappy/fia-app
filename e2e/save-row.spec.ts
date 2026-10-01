import { expect, test, type Page } from '@playwright/test';

// J-A2 steps 1–6 (prepare a phone for offline use) on the built app (vite preview + /sw.js):
// S03 row size → S04 tier picker with pack-manifest sizes + storage estimate → Save (best published tier) → verified
// saved state on S04 and the S03 row → S13 lists it; S13 `Save a passage` lands on a card whose
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

  // Step 1 — S03 row shows its size at the Settings tier (default Phone, M1) before any save.
  const row = page.locator(`[data-pack-id="${PACK}"]`);
  // Catalog sizes: main lists Phone (unmeasured → "≈"); fia-app#18 lists Text only, measured for
  // built packs (exact). Either way an estimate never reads as exact.
  await expect(row.getByTestId('row-size')).toHaveText(/^(Phone ≈ |Text (≈ )?)\d+(\.\d)? MB$/);
  await expect(row.getByTestId('row-saved')).toHaveCount(0);
  await row.click();

  // Step 2 — S04 save row: all four tiers shown; sizes are the bytes a save downloads (pack C-02
  // manifest). The pack publishes only Text today, so Phone/Medium/Original read "not yet", are
  // not selectable, and the best available tier (Text) is chosen — no Phone claim (R-307/R-309).
  await expect(page.locator('[data-screen="S04"]')).toBeVisible();
  const saveRow = page.getByTestId('save-row');
  await expect(saveRow.getByRole('heading', { name: 'Save for offline' })).toBeVisible();
  await expect(saveRow.getByRole('radio')).toHaveCount(4);
  await expect(saveRow.getByTestId('tier-size-text')).toHaveText(/^\d+(\.\d)? MB$/);
  for (const tier of ['phone', 'medium', 'original']) {
    await expect(saveRow.getByTestId(`tier-size-${tier}`)).toHaveText('not yet');
    await expect(saveRow.locator(`input[value="${tier}"]`)).toBeDisabled();
  }
  await expect(saveRow.locator('input[value="text"]')).toBeChecked();
  await expect(saveRow.getByTestId('storage-estimate')).toContainText('on this connection');
  const textSize = (await saveRow.getByTestId('tier-size-text').textContent())!.trim();
  // Pack manifest text tier for spa.MRK-1-1-13 = 277,189 bytes → "0.3 MB" (data/packs/…/manifest.json).
  expect(textSize).toBe('0.3 MB');
  const save = saveRow.getByTestId('save-button');
  await expect(save).toHaveText(`⤓ Save Text (${textSize})`);
  // The primary stays Start (one primary, rule 1); the save button is the outlined secondary.
  await expect(page.locator('[data-role="primary"]')).toContainText('Start');

  // Steps 4–5 — Save starts here (C-07 SAVE); the row shows the verified state, stamped with the
  // tier actually saved and its verified bytes.
  await save.click();
  await expect(saveRow.getByTestId('saved-row')).toContainText(`✓ Saved (Text, ${textSize})`, {
    timeout: 20_000,
  });
  await expect(saveRow.getByRole('radio')).toHaveCount(0);

  // Step 6 — the S03 row carries the saved mark; S13 lists the pack under Saved.
  await page.goBack();
  await expect(page.locator('[data-screen="S03"]')).toBeVisible();
  await expect(row.getByTestId('row-saved')).toHaveText('✓ saved');
  await expect(row.getByTestId('row-size')).toHaveText(`Text ${textSize}`);
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
  await expect(page.getByTestId('save-row').getByText('▶ Start')).toBeVisible();
  await primary.click();
  await expect(page.getByTestId('saved-row')).toBeVisible({ timeout: 20_000 });
  await expect(primary).toContainText('Start');
});
