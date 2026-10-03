import { expect, test, type Page } from '@playwright/test';

// F6-S07 Whole guide map (BUILD-ORDER lane F; nodded mock cookbook design/alpha-v2-screens/07-overview.html):
// a full-height kit GlassSheet from Explore › This passage. Proves the mock's regions and words at the
// mock's position (S03-U004, part 4 of 25 in step 3), one primary "Back to part 4", the kept jump rules
// (R-412: back is free, forward past an un-discussed talk asks once on sheet 24), the way back to
// Explore, and that nothing runs past the phone at 200% and 310% text.
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });

const PACK = 'eng.MRK-1-1-13';

/** Seed the pack and a position once per test (in-app navigation keeps the session). */
async function seed(
  page: Page,
  opts: { unitId?: string; visited?: string[]; textSize?: string; theme?: string } = {},
) {
  await page.addInitScript(
    ({ PACK, opts }) => {
      if (sessionStorage.getItem('s07-seeded')) return;
      sessionStorage.setItem('s07-seeded', '1');
      localStorage.setItem(
        'fia.flow.current.v1',
        JSON.stringify({ language: 'eng', book: 'MRK', packId: PACK }),
      );
      const unitId = opts.unitId ?? 'S03-U004';
      localStorage.setItem(
        `fia.workspace.v1.${PACK}`,
        JSON.stringify({
          schemaVersion: 1,
          packId: PACK,
          contentLanguage: 'eng',
          theme: 'light',
          view: 'guide',
          position: {
            stepId: unitId.slice(0, 3),
            unitId,
            visited: opts.visited ?? [unitId],
            finished: false,
          },
          checkpoint: null,
          savedAt: new Date().toISOString(),
        }),
      );
      if (opts.textSize || opts.theme)
        localStorage.setItem(
          'fia.settings.v1',
          JSON.stringify({
            schemaVersion: 1,
            narrationMode: 'source-only',
            subtitleMode: 'off',
            mediaTier: 'phone',
            contentLanguage: 'eng',
            uiLanguage: 'eng',
            textSize: opts.textSize ?? 'system',
            lowLiteracy: false,
            theme: opts.theme ?? 'system',
            disclosuresPresented: [],
            telemetryOptIn: false,
          }),
        );
    },
    { PACK, opts },
  );
}

const map = (page: Page) => page.locator('[data-screen="S07"]');
const primary = (page: Page) => map(page).locator('[data-role="primary"]');
const step = (page: Page, id: string) =>
  map(page).locator(`.s07-step-wrap[data-step-id="${id}"] > .s07-step`);
const part = (page: Page, id: string) => map(page).locator(`.s07-part[data-unit-id="${id}"]`);

test('the map opens at "you are here" with the mock\'s regions, words and one primary', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/overview');
  await expect(part(page, 'S03-U004')).toHaveAttribute('aria-current', 'step');
  const dialog = map(page).locator('[role="dialog"]');
  await expect(dialog.locator('.fia-logo')).toBeVisible();
  await expect(dialog.locator('.s07-explore')).toHaveText('Explore');
  await expect(dialog.locator('h1')).toHaveText('Whole guide map');
  // keepRef: the reference never breaks at its dash (word joiners around it).
  await expect(dialog).toContainText(
    /Mark 1:1\u2060?–\u2060?13 · 6 steps · 130 parts · 23 talks together/,
  );
  await expect(dialog.locator('.fia-legend-well')).toContainText('What the marks mean');
  // Six steps; step 3 open on its 25 parts with its 3 talks; the others show their bead rows.
  await expect(map(page).locator('.s07-step')).toHaveCount(6);
  await expect(step(page, 'S03')).toHaveAttribute('aria-expanded', 'true');
  await expect(step(page, 'S03')).toContainText('25 parts · 3 talks · you are on part 4');
  await expect(step(page, 'S01')).toContainText('8 parts · done');
  await expect(step(page, 'S06')).toContainText('10 parts · 3 talks · ahead');
  await expect(map(page).locator('.s07-part')).toHaveCount(25);
  await expect(map(page).locator('.s07-talk:not(.s07-talk--end)')).toHaveCount(3);
  await expect(map(page).locator('.s07-talk').first()).toHaveText('Talk together · after part 7');
  await expect(map(page).locator('.s07-step__beads')).toHaveCount(5);
  await expect(part(page, 'S03-U004')).toContainText('You are here');
  await expect(part(page, 'S03-U003')).toHaveClass(/is-done/);
  await expect(part(page, 'S03-U005')).toHaveClass(/is-upcoming/);
  // The current row is in view inside the sheet body (scrolled there, not the page).
  const body = (await map(page).locator('.s07-body').boundingBox())!;
  const row = (await part(page, 'S03-U004').boundingBox())!;
  expect(row.y).toBeGreaterThanOrEqual(body.y - 1);
  expect(row.y + row.height).toBeLessThanOrEqual(body.y + body.height + 1);
  // One primary, in the thumb slot; no bar, no view switcher.
  await expect(map(page).locator('[data-role="primary"]')).toHaveCount(1);
  await expect(primary(page)).toHaveText('Back to part 4');
  await expect(page.locator('[role="tablist"], .fia-segmented, .fia-views')).toHaveCount(0);
});

test('Back to part 4 returns to the guide at the same part', async ({ page }) => {
  await seed(page);
  await page.goto('/overview');
  await primary(page).click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.locator('.fia-guide')).toHaveAttribute('data-unit-id', 'S03-U004');
});

test('a jump back is free: step 1, part 3 opens the guide there with no guard', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/overview');
  await step(page, 'S01').click();
  await expect(step(page, 'S03')).toHaveAttribute('aria-expanded', 'false');
  await part(page, 'S01-U003').click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.locator('.fia-guide')).toHaveAttribute('data-unit-id', 'S01-U003');
});

test('a jump forward past an un-discussed talk asks once (sheet 24)', async ({ page }) => {
  await seed(page);
  await page.goto('/overview');
  await part(page, 'S03-U009').click();
  const guard = page.locator('[role="dialog"].fia-sheet--stop');
  await expect(guard).toBeVisible();
  // Escape keeps the map and the position.
  await page.keyboard.press('Escape');
  await expect(guard).toHaveCount(0);
  await expect(part(page, 'S03-U004')).toHaveAttribute('aria-current', 'step');
  // A part before the talk passes nothing.
  await part(page, 'S03-U006').click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.locator('.fia-guide')).toHaveAttribute('data-unit-id', 'S03-U006');
  // Back to the map (Explore › Whole guide map), then past the talk: "Go to the stop first".
  await page.locator('.fia-explore').click();
  await page.getByRole('button', { name: /Whole guide map/ }).click();
  await part(page, 'S03-U009').click();
  await expect(guard).toBeVisible();
  await guard.locator('[data-role="primary"]').click();
  await expect(page.locator('.fia-guide')).toHaveAttribute('data-unit-id', 'S03-U007');
  // Asked once: the same talk does not ask again this session.
  await page.locator('.fia-explore').click();
  await page.getByRole('button', { name: /Whole guide map/ }).click();
  await part(page, 'S03-U004').click();
  await page.locator('.fia-explore').click();
  await page.getByRole('button', { name: /Whole guide map/ }).click();
  await part(page, 'S03-U009').click();
  await expect(page.locator('.fia-guide')).toHaveAttribute('data-unit-id', 'S03-U009');
});

test('"‹ Explore" opens the Explore sheet over the map; Close comes back to it', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/overview');
  await map(page).locator('.s07-explore').click();
  const explore = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(explore).toContainText('Whole guide map');
  await explore.locator('.fia-explore-close').click();
  await expect(explore).toHaveCount(0);
  await expect(part(page, 'S03-U004')).toBeVisible();
});

test('a talk the person went past un-discussed says so', async ({ page }) => {
  await seed(page, { unitId: 'S03-U004', visited: ['S03-U010', 'S03-U004'] });
  await page.goto('/overview');
  await expect(map(page).locator('.s07-talk[data-skipped]').first()).toHaveText(
    'Talk together · after part 7 · skipped',
  );
});

for (const [textSize, label] of [
  ['max', '200%'],
  ['huge', '310%'],
] as const) {
  for (const width of [390, 320]) {
    test(`at ${label} text and ${width} px nothing runs past the phone and the primary stays on screen`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await seed(page, { textSize });
      await page.goto('/overview');
      await expect(part(page, 'S03-U004')).toContainText('Part 4');
      const over = await page.evaluate(() =>
        [...document.querySelectorAll('[data-screen="S07"] *')]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5);
          })
          .map((e) => e.className),
      );
      expect(over).toEqual([]);
      const p = (await primary(page).boundingBox())!;
      expect(p.y + p.height).toBeLessThanOrEqual(844);
      // At 200%+ the title scrolls with the map: the pinned rows are the logo row and the action.
      await expect(map(page).locator('.s07-body h1')).toHaveText('Whole guide map');
    });
  }
}

// F6-S24 (nodded mock cookbook design/alpha-v2-screens/24-sheet-forward-jump-guard.html): part 4 → part
// 12 of step 3 passes the talk after part 7. The mock's regions and words, the two quiet ways out
// ("Stay here" keeps the map and the position; "Go ahead anyway" jumps and leaves the talk undone).
const guard = (page: Page) => page.locator('[role="dialog"].fia-sheet--jump');

test('sheet 24 in glass: the jump as beads, the talk it passes in words, one primary', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/overview');
  await part(page, 'S03-U012').click();
  const g = guard(page);
  await expect(g).toBeVisible();
  await expect(g.locator('.fia-sheet-brand .fia-logo')).toBeVisible();
  await expect(g.locator('.fia-sheet-brand > span')).toHaveText('Jump to part 12?');
  await expect(g).toContainText('From part 4 · Step 3, Defining the Scenes');
  await expect(g.locator('.fia-jump__ends')).toContainText('Part 4, you are here');
  await expect(g.locator('.fia-jump__ends')).toContainText('to part 12');
  await expect(g.locator('.fia-jump__stop')).toHaveCount(1);
  await expect(g.locator('.fia-jump__stopcap')).toHaveText(
    'Talk together · after part 7 · not done yet',
  );
  await expect(g.locator('.fia-jump__quote')).toHaveText(/^“.+”$/);
  await expect(g).toContainText(
    'You would skip the talk after part 7. Going ahead will not mark it as done; you can come back to it from the Whole guide map.',
  );
  await expect(g.locator('.fia-sheet__close')).toHaveCount(0);
  await expect(g.locator('[data-role="primary"]')).toHaveCount(1);
  await expect(g.locator('[data-role="primary"]')).toHaveText('Go to the talk first');
  // "Stay here": the map stays, the position stays.
  await g.locator('[data-role="cancel"]').click();
  await expect(guard(page)).toHaveCount(0);
  await expect(part(page, 'S03-U004')).toHaveAttribute('aria-current', 'step');
  // Asked again (not yet answered), then "Go ahead anyway": the guide opens at part 12.
  await part(page, 'S03-U012').click();
  await guard(page).locator('[data-role="go-ahead"]').click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.locator('.fia-guide')).toHaveAttribute('data-unit-id', 'S03-U012');
});

for (const [textSize, label] of [
  ['max', '200%'],
  ['huge', '310%'],
] as const) {
  test(`sheet 24 at ${label} text and 320 px: nothing runs past the phone`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await seed(page, { textSize });
    await page.goto('/overview');
    await part(page, 'S03-U012').click();
    await expect(guard(page)).toBeVisible();
    const over = await page.evaluate(() =>
      [...document.querySelectorAll('.fia-sheet--jump *')]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5);
        })
        .map((e) => e.className),
    );
    expect(over).toEqual([]);
  });
}
