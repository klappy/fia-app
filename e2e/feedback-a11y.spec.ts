import { expect, test } from '@playwright/test';

// F6-S16 review fixes (fix-f6-s16-1124). WCAG 2.4.7: both text fields show the app's 3 px focus
// ring when reached by keyboard (the kit GlassField sets outline:none inline). Design-lens rule 5:
// on the real path (Guide → Explore → Send feedback) "We will attach" reads in words, no ids.
test.use({ serviceWorkers: 'block' });

test('message and contact fields keep a visible focus ring', async ({ page }) => {
  await page.goto('/feedback');
  const area = page.locator('#fia-feedback-text');
  const contact = page.locator('#fia-feedback-contact');
  await expect(area).toBeVisible();
  await page.locator('.fia-feedback__reasons button').last().focus();
  await page.keyboard.press('Tab');
  await expect(area).toBeFocused();
  const ring = (el: Element) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  };
  expect(await area.evaluate(ring)).toEqual({ style: 'solid', width: 3 });
  await contact.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(contact).toBeFocused();
  expect(await contact.evaluate(ring)).toEqual({ style: 'solid', width: 3 });
});

test('opened from the guide, "We will attach" is one line in words', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'fia.flow.current.v1',
      JSON.stringify({ language: 'eng', book: 'MRK', packId: 'eng.MRK-1-1-13' }),
    );
  });
  await page.goto('/guide');
  await expect(page.locator('[data-screen="S05"]')).toBeVisible();
  await page.getByRole('button', { name: 'Explore' }).first().click();
  await page.getByText('Send feedback').click();
  await expect(page.locator('[data-screen="S16"]')).toBeVisible();
  const where = page.locator('.fia-feedback__where');
  await expect(where).toHaveCount(1);
  await expect(where).toHaveText(/^Mark 1:1–13 · .+, part \d+ of \d+ · English$/);
  for (const id of ['eng.MRK', 'S0', '-U0', '(eng)']) await expect(where).not.toContainText(id);
});
