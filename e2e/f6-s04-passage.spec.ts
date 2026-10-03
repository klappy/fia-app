import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// F6-S04 Passage card in glass on the built app (mock design/alpha-v2-screens/04-passage-card.html):
// the mock's regions in order (‹ Mark · hero · sub · voice chip · Includes · Save for offline · sources ·
// start line · one primary), counts from the pack, the tier picker on kit GlassSegmented with the
// unpublished tiers marked "not yet", and at 200% and 310% text nothing passes 390 px, no text clips
// and the primary stays on screen (PRD § 5 rule 6, § 8.5).
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });

const PACK = 'eng.MRK-1-1-13';
const REF = /Mark 1:1⁠?–⁠?13/;
const units = JSON.parse(
  readFileSync(new URL('../data/packs/eng.MRK-1-1-13/guide-units.json', import.meta.url), 'utf8'),
) as { steps: { units: { id: string }[] }[] };
const order = units.steps.flatMap((s) => s.units.map((u) => u.id));

async function seed(
  page: Page,
  opts: { started?: boolean; textSize?: string; theme?: string } = {},
) {
  const ws = opts.started
    ? {
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
      }
    : null;
  await page.addInitScript(
    ([pack, w, textSize, theme]) => {
      localStorage.setItem(
        'fia.flow.current.v1',
        JSON.stringify({ language: 'eng', book: 'MRK', packId: pack }),
      );
      if (w) localStorage.setItem(`fia.workspace.v1.${pack}`, JSON.stringify(w));
      localStorage.setItem(
        'fia.settings.v1',
        JSON.stringify({
          schemaVersion: 1,
          textSize: textSize ?? 'system',
          theme: theme ?? 'light',
        }),
      );
    },
    [PACK, ws, opts.textSize ?? null, opts.theme ?? null] as const,
  );
}

test('fresh card: the mock regions in order, pack counts, voice chip, one primary "Start Mark 1:1–13"', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/passage');
  const screen = page.locator('[data-screen="S04"]');
  await expect(screen.getByRole('heading', { level: 1 })).toHaveText(REF);
  const back = screen.getByRole('button', { name: 'Back to Mark' });
  await expect(back).toHaveText('Mark');
  await expect(screen.locator('.s04-sub')).toHaveText('English · 6 steps · 130 parts');
  // The guide plays the stand-in's AI-voiced PoC clips (catalog generated = 0): marked AI (C-06).
  await expect(screen.locator('.s04-chip')).toHaveText('AI voice');

  const inc = screen.getByRole('region', { name: 'Includes' });
  const kinds = inc.getByRole('listitem');
  await expect(kinds).toHaveCount(6);
  await expect(kinds.nth(0)).toHaveText('Guide parts130 in 6 steps');
  await expect(kinds.nth(1)).toHaveText('Scripture5 editions');
  await expect(kinds.nth(2)).toHaveText('Key terms21 · all with audio');
  await expect(kinds.nth(3)).toHaveText('Images, mapsImages 4 · Maps 4');
  await expect(kinds.nth(4)).toHaveText('Videos3');
  await expect(kinds.nth(5)).toHaveText('Talk together23 stops');
  // each kind carries the kit's progress Bead (the guide's own marks)
  await expect(inc.locator('svg[data-kind]')).toHaveCount(6);
  await expect(inc).toContainText("The guide's progress dots use these marks.");

  const save = screen.getByTestId('save-row');
  await expect(save.getByRole('radio')).toHaveCount(3);
  await expect(save.getByTestId('tier-note')).toContainText('without the voice');
  await expect(screen.locator('.s04-rights')).toHaveText(
    'Guide: FIA Translation Guide · Scripture: BSB, ULT, UST, WEB, WEBU · Rights: Explore › About',
  );
  await expect(screen.getByTestId('start-line')).toHaveText('Starts at Step 1 · Hear and Heart');

  // order of regions, top to bottom
  const ys = await Promise.all(
    [back, screen.locator('.s04-hero'), inc, save, screen.getByTestId('start-line')].map(
      async (l) => (await l.boundingBox())!.y,
    ),
  );
  expect([...ys].sort((a, b) => a - b)).toEqual(ys);

  const primary = page.locator('[data-role="primary"]');
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveText(/Start Mark 1:1⁠?–⁠?13/);
  await primary.click();
  await expect(page).toHaveURL(/\/guide$/);
});

test('back row returns to the passage list (S03)', async ({ page }) => {
  await seed(page);
  await page.goto('/passage');
  await page.getByRole('button', { name: 'Back to Mark' }).click();
  await expect(page.locator('[data-screen="S03"]')).toBeVisible();
});

test('started: the primary continues and the start line says where (unmocked state, mock words)', async ({
  page,
}) => {
  await seed(page, { started: true });
  await page.goto('/passage');
  await expect(page.getByTestId('start-line')).toHaveText(
    'Step 3 of 6 · part 4 of 25 in this step',
  );
  await expect(page.locator('[data-role="primary"]')).toHaveText(/Continue Mark 1:1⁠?–⁠?13/);
});

for (const theme of ['light', 'dark'] as const)
  for (const [step, size] of [
    ['x150', 'large'],
    ['x200', 'max'],
    ['x310', 'huge'],
  ] as const) {
    test(`large text ${step} ${theme}: nothing past 390 px, no clipped text, the primary on screen`, async ({
      page,
    }) => {
      await seed(page, { textSize: size, theme });
      await page.goto('/passage');
      await expect(page.locator('html')).toHaveAttribute('data-text-step', step);
      await expect(page.getByTestId('save-row').getByRole('radio')).toHaveCount(3);
      const report = await page.evaluate(() => {
        const screen = document.querySelector('[data-screen="S04"]')!;
        const els = [...screen.querySelectorAll<HTMLElement>('*')].filter(
          (e) => !e.closest('.fia-screen__title'),
        );
        const over = els
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.right > 390.5;
          })
          .map((e) => e.className);
        const clipped = els
          .filter(
            (e) =>
              e.children.length === 0 &&
              (e.textContent ?? '').trim() !== '' &&
              e.scrollWidth > e.clientWidth + 1 &&
              getComputedStyle(e).overflowX !== 'visible',
          )
          .map((e) => e.className);
        const p = document.querySelector('[data-role="primary"]')!.getBoundingClientRect();
        return { over, clipped, top: p.top, bottom: p.bottom };
      });
      expect(report.over).toEqual([]);
      expect(report.clipped).toEqual([]);
      expect(report.top).toBeGreaterThanOrEqual(0);
      expect(report.bottom).toBeLessThanOrEqual(844);
      // the tier cells stack (mock is-vertical) above 1×
      const cells = page.getByTestId('save-row').getByRole('radio');
      const [a, b] = [await cells.nth(0).boundingBox(), await cells.nth(1).boundingBox()];
      expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1);
    });
  }
