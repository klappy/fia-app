import { expect, test } from '@playwright/test';

// FS-2 (pericope-subtitles TICKET § 8): the S14 "Short summaries" switch writes C-10 `subtitleMode`,
// survives a reload, and S01's disclosure names passage summaries while it is on (TERRY-READING (4)).
test('S14 Short summaries switch persists across reload and reaches the S01 disclosure', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.getByText('Some voices and translations are made by AI and are marked.'),
  ).toBeVisible();

  await page.goto('/settings');
  const sw = page.getByRole('switch', { name: 'Short summaries' });
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  const stored = await page.evaluate(() => localStorage.getItem('fia.settings.v1'));
  expect(JSON.parse(stored!).subtitleMode).toBe('generated');

  await page.reload();
  await expect(page.getByRole('switch', { name: 'Short summaries' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  await page.goto('/');
  await expect(
    page.getByText(
      'Some voices, translations and passage summaries are made by AI and are marked.',
    ),
  ).toBeVisible();

  await page.goto('/settings');
  await page.getByRole('switch', { name: 'Short summaries' }).click();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Short summaries' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  const off = await page.evaluate(() => localStorage.getItem('fia.settings.v1'));
  expect(JSON.parse(off!).subtitleMode).toBe('off');
});
