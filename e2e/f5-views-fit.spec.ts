import { expect, test, type Page } from '@playwright/test';

// F5 fix r1 (rev-f5-r1b blocking; rev-f5-r1a/r1c blocking):
// 1. S05's Guide · Text · Resources views stay inside their radiogroup and the viewport at 320 and
//    390 px and at 150, 200 and 310% text (C-10 large|max|huge); each option's icon + words stay
//    inside the option. At 150% the one-row control used to run Resources out to x=384.
// 2. A non-English guide reads its quotes: spa S02-U002 shows "El hijo de Dios", never &quot;.
// "Recorded only" (C-10) keeps every part silent, so nothing here needs the clip host.
test.use({ serviceWorkers: 'block' });

async function openGuide(
  page: Page,
  {
    textSize,
    packId = 'eng.MRK-1-1-13',
    unitId,
  }: { textSize?: string; packId?: string; unitId?: string },
) {
  await page.addInitScript(
    ({ textSize, packId, unitId }) => {
      const [language, rest] = packId.split('.');
      localStorage.setItem(
        'fia.flow.current.v1',
        JSON.stringify({ language, book: rest.slice(0, 3), packId }),
      );
      localStorage.setItem(
        'fia.settings.v1',
        JSON.stringify({ schemaVersion: 1, narrationMode: 'source-only', textSize }),
      );
      if (unitId)
        localStorage.setItem(
          `fia.workspace.v1.${packId}`,
          JSON.stringify({
            schemaVersion: 1,
            packId,
            contentLanguage: language,
            theme: 'light',
            view: 'guide',
            position: { stepId: unitId.slice(0, 3), unitId, visited: [unitId], finished: false },
            checkpoint: null,
            savedAt: new Date().toISOString(),
          }),
        );
    },
    { textSize, packId, unitId },
  );
  await page.goto('/guide');
  await expect(page.locator('.fia-guide')).toBeVisible();
}

const STEPS = [
  ['large', 'x150'],
  ['max', 'x200'],
  ['huge', 'x310'],
] as const;

for (const width of [320, 390])
  for (const [textSize, step] of STEPS)
    test(`S05 views fit at ${width} px and ${step}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      // S02-U008 has items, so the Resources option carries its count (the longest label)
      await openGuide(page, { textSize, unitId: 'S02-U008' });
      await expect(page.locator('html')).toHaveAttribute('data-text-step', step);
      const group = page.locator('.fia-views[role="radiogroup"]');
      await expect(group.locator('[role="radio"]')).toHaveCount(3);
      await expect(group.locator('[role="radio"]').nth(2)).toContainText(/Resources \d/);
      const m = await group.evaluate((g) => {
        const box = (r: DOMRect) => ({ l: r.left, r: r.right, t: r.top, b: r.bottom });
        return {
          vw: document.documentElement.clientWidth,
          group: box(g.getBoundingClientRect()),
          radios: [...g.querySelectorAll('[role="radio"]')].map((o) => {
            const range = document.createRange();
            range.selectNodeContents(o.querySelector('.fia-seg')!);
            return {
              name: o.textContent,
              box: box(o.getBoundingClientRect()),
              label: box(range.getBoundingClientRect()),
              overflow: o.scrollWidth - o.clientWidth,
            };
          }),
        };
      });
      for (const o of m.radios) {
        // inside the radiogroup and the viewport (0.5 px for sub-pixel layout)
        expect(o.box.l, o.name!).toBeGreaterThanOrEqual(m.group.l - 0.5);
        expect(o.box.r, o.name!).toBeLessThanOrEqual(m.group.r + 0.5);
        expect(o.box.r, o.name!).toBeLessThanOrEqual(m.vw + 0.5);
        expect(o.box.l, o.name!).toBeGreaterThanOrEqual(-0.5);
        // icon + words inside the option, nothing scrolled sideways inside it
        expect(o.label.l, o.name!).toBeGreaterThanOrEqual(o.box.l - 0.5);
        expect(o.label.r, o.name!).toBeLessThanOrEqual(o.box.r + 0.5);
        expect(o.overflow, o.name!).toBeLessThanOrEqual(0);
      }
      // no sideways page scroll either
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        m.vw,
      );
    });

test('spa S02-U002 reads its quotes on S05, never &quot;', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGuide(page, { packId: 'spa.MRK-1-1-13', unitId: 'S02-U002' });
  const text = page.locator('.fia-guide .fia-text--guide');
  await expect(text).toContainText('Jesús, "El hijo de Dios", y el comienzo');
  await expect(text).not.toContainText('&quot;');
  await expect(text).not.toContainText('&#x27;');
});
