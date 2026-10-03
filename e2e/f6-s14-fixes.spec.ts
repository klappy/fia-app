import { expect, test, type Page } from '@playwright/test';

// F6-S14 review fixes: 150% layout stays inside its track (1/9), the save-failed toast is on screen
// (2), and the group wells keep the mock's 10/12 inset (4/6/8).
const pickSize = async (page: Page, i: number) =>
  page.getByRole('radiogroup', { name: 'Text size' }).getByRole('radio').nth(i).click();

for (const width of [320, 360, 390]) {
  test(`S14 at Larger (150%) keeps every choice inside its track at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/settings');
    await pickSize(page, 1);
    await expect(page.locator('.s14-seg.is-vertical').first()).toBeVisible();
    const over = await page.evaluate(() => {
      const bad: string[] = [];
      for (const g of document.querySelectorAll<HTMLElement>('.s14-body [role="radiogroup"]')) {
        const track = g.getBoundingClientRect();
        for (const r of g.querySelectorAll<HTMLElement>('[role="radio"], .s14-opt, .s14-size')) {
          const b = r.getBoundingClientRect();
          if (b.right > track.right + 0.5 || b.right > innerWidth || b.left < track.left - 0.5)
            bad.push(`${r.textContent} ${b.left}-${b.right} vs ${track.left}-${track.right}`);
          if (r.getAttribute('role') === 'radio' && r.scrollWidth > r.clientWidth + 1)
            bad.push(`${r.textContent} scroll ${r.scrollWidth}>${r.clientWidth}`);
        }
      }
      return bad;
    });
    expect(over).toEqual([]);
  });
}

test('S14 at 100% keeps the Voice choices inside their track at 320px (no sideways scroll)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/settings');
  const voice = page.getByRole('radiogroup', { name: 'Voice' });
  await expect(voice).toBeVisible();
  const r = await voice.evaluate((g) => {
    const t = g.getBoundingClientRect();
    const body = document.querySelector<HTMLElement>('.s14-body')!;
    const right = Math.max(
      ...[...g.querySelectorAll('[role="radio"], .s14-opt')].map(
        (e) => e.getBoundingClientRect().right,
      ),
    );
    return { over: right - t.right, sideways: body.scrollWidth - body.clientWidth };
  });
  expect(r.over).toBeLessThanOrEqual(0.5);
  expect(r.sideways).toBe(0);
});

test('S14 save-failed toast renders inside the viewport (R-706)', async ({ page }) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'fia.settings.v1') throw new DOMException('quota', 'QuotaExceededError');
      return set.call(this, k, v);
    };
  });
  await page.goto('/settings');
  await page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio').nth(2).click();
  const alert = page.getByRole('alert');
  await expect(alert).toBeInViewport({ ratio: 1 });
  const onTop = await alert.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2));
  });
  expect(onTop).toBe(true);
});

test('S14 group wells keep the 10/12 inset over app.css .fia-well', async ({ page }) => {
  await page.goto('/settings');
  const pads = await page
    .locator('.s14-card')
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).padding));
  // Text size · Theme · Voice · Passage titles (FS-2) · Language.
  expect(pads.length).toBe(5);
  for (const p of pads) expect(p).toBe('10px 12px');
});
