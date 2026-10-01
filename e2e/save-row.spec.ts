import { expect, test, type Page } from '@playwright/test';

// J-A2 steps 1–6 (prepare a phone for offline use) on the built app (vite preview + /sw.js):
// S03 row size → S04 tier picker with C-03 sizes + storage estimate → Save Phone → verified
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

test('J-A2 1–6: size on S03, tier picker on S04, Save Phone, saved marks', async ({ page }) => {
  await openMarcos(page);

  // Step 1 — S03 row shows its size at the Settings tier (default Phone, M1) before any save.
  const row = page.locator(`[data-pack-id="${PACK}"]`);
  await expect(row.getByTestId('row-size')).toHaveText(/^Phone \d+(\.\d)? MB$/);
  await expect(row.getByTestId('row-saved')).toHaveCount(0);
  await row.click();

  // Step 2 — S04 save row: four tiers with sizes, Phone preselected + recommended, estimate.
  await expect(page.locator('[data-screen="S04"]')).toBeVisible();
  const saveRow = page.getByTestId('save-row');
  await expect(saveRow.getByRole('heading', { name: 'Save for offline' })).toBeVisible();
  const radios = saveRow.getByRole('radio');
  await expect(radios).toHaveCount(4);
  for (const tier of ['text', 'phone', 'medium', 'original'])
    await expect(saveRow.getByTestId(`tier-size-${tier}`)).toHaveText(/^\d+(\.\d)? MB$/);
  await expect(saveRow.locator('input[value="phone"]')).toBeChecked();
  await expect(saveRow.locator('[data-tier="phone"]')).toContainText('recommended');
  await expect(saveRow.getByTestId('storage-estimate')).toContainText('on this connection');
  const phoneSize = (await saveRow.getByTestId('tier-size-phone').textContent())!.trim();
  const save = saveRow.getByTestId('save-button');
  await expect(save).toHaveText(`⤓ Save Phone (${phoneSize})`);
  // The primary stays Start (one primary, rule 1); the save button is the outlined secondary.
  await expect(page.locator('[data-role="primary"]')).toContainText('Start');

  // Tier change re-labels the button and its size (R-307: never a button without a size).
  await saveRow.locator('[data-tier="text"]').click();
  const textSize = (await saveRow.getByTestId('tier-size-text').textContent())!.trim();
  await expect(save).toHaveText(`⤓ Save Text (${textSize})`);
  await expect(saveRow).toContainText('Sizes on other passages follow this choice');
  await saveRow.locator('[data-tier="phone"]').click();
  await expect(save).toHaveText(`⤓ Save Phone (${phoneSize})`);

  // Steps 4–5 — Save starts here (C-07 SAVE) and the row turns to the verified saved state.
  await save.click();
  await expect(saveRow.getByTestId('saved-row')).toContainText(/✓ Saved \(Phone, [\d.]+ MB\)/, {
    timeout: 20_000,
  });
  await expect(saveRow.getByRole('radio')).toHaveCount(0);

  // Step 6 — the S03 row carries the saved mark; S13 lists the pack under Saved.
  await page.goBack();
  await expect(page.locator('[data-screen="S03"]')).toBeVisible();
  await expect(row.getByTestId('row-saved')).toHaveText('✓ saved');
  await page.goto('/downloads');
  await expect(page.locator('[data-screen="S13"]')).toBeVisible();
  await expect(page.getByText(/MRK 1:1–13 · Phone · [\d.]+ MB/)).toBeVisible();
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
  await expect(primary).toContainText(/Save Phone \(\d+(\.\d)? MB\)/);
  await expect(page.getByTestId('save-row').getByText('▶ Start')).toBeVisible();
  await primary.click();
  await expect(page.getByTestId('saved-row')).toBeVisible({ timeout: 20_000 });
  await expect(primary).toContainText('Start');
});
