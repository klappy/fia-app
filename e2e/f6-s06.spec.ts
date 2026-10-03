import { expect, test, type Page } from '@playwright/test';

// F6-S06 (BUILD-ORDER lane F; nodded mock cookbook design/alpha-v2-screens/06-single-script.html):
// S06 is the Guide view with the voice off (PRD § 8.1). Proves: nothing plays and nothing is fetched
// from the clip host; the big button reads "Next part" and flows part to part; it never passes a talk
// (sheet 21 rises at once, R-410); the line under the card says what follows and where it waits
// (PRD § 9.2); "Voice off · Turn voice on" goes back to S05 at the same part (R-411).
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });

const PACK = 'eng.MRK-1-1-13';
const NB = ' ';

async function open(page: Page, unitId: string) {
  const clipRequests: string[] = [];
  page.on('request', (r) => {
    if (/\.mp3(\?|$)/.test(r.url()) || r.url().startsWith('https://fia.klappy.dev'))
      clipRequests.push(r.url());
  });
  await page.addInitScript(
    ({ PACK, unitId }) => {
      localStorage.setItem(
        'fia.flow.current.v1',
        JSON.stringify({ language: 'eng', book: 'MRK', packId: PACK }),
      );
      if (!sessionStorage.getItem('s06-seeded')) {
        sessionStorage.setItem('s06-seeded', '1');
        localStorage.setItem(
          `fia.workspace.v1.${PACK}`,
          JSON.stringify({
            schemaVersion: 1,
            packId: PACK,
            contentLanguage: 'eng',
            theme: 'light',
            view: 'guide',
            position: { stepId: unitId.slice(0, 3), unitId, visited: [unitId], finished: false },
            checkpoint: null,
            savedAt: new Date().toISOString(),
          }),
        );
      }
    },
    { PACK, unitId },
  );
  await page.goto('/script');
  const guide = page.locator('.fia-guide[data-voice="off"]');
  await expect(guide).toHaveAttribute('data-unit-id', unitId);
  return { guide, clipRequests };
}

const primary = (page: Page) =>
  page.locator('[data-screen="S06"] > .fia-primary-slot [data-role="primary"]');
const workspaceView = (page: Page) =>
  page.evaluate(
    (PACK) => JSON.parse(localStorage.getItem(`fia.workspace.v1.${PACK}`) ?? '{}').view,
    PACK,
  );

test('voice off: "Next part" flows part to part, plays nothing, and waits at the talk', async ({
  page,
}) => {
  const { guide, clipRequests } = await open(page, 'S03-U004');
  await expect(page.locator('.fia-voice-off')).toHaveAccessibleName('Voice off. Turn voice on');
  await expect(page.locator('.fia-voice-off')).toContainText('Voice off · Turn voice on');
  await expect(page.locator('audio')).toHaveCount(0);
  await expect(page.locator('.fia-status')).toHaveCount(0); // no time line with the voice off
  await expect(primary(page)).toHaveAccessibleName('Next part');
  await expect(page.locator('.fia-flow-line')).toHaveText(
    `Next part 5 follows on${NB}· talk after part${NB}7`,
  );
  // The card's Guide view is the selected one: S06 is not a fourth view.
  await expect(page.locator('.fia-views [role="radio"][aria-checked="true"]')).toContainText(
    'Guide',
  );
  expect(await workspaceView(page)).toBe('single-script');

  await primary(page).click();
  await expect(guide).toHaveAttribute('data-unit-id', 'S03-U005');
  await expect(guide).toHaveAttribute('data-phase', /^(idle|next-ready)$/);
  await primary(page).click();
  await expect(guide).toHaveAttribute('data-unit-id', 'S03-U006');
  await primary(page).click();

  // Part 7 carries the talk (stop-004): it waits at once, as a part with no voice does.
  await expect(guide).toHaveAttribute('data-unit-id', 'S03-U007');
  await expect(guide).toHaveAttribute('data-phase', 'stop');
  const sheet = page.locator('[role="dialog"].fia-sheet--stop');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.fia-sheet-brand')).toContainText('Talk together');
  await expect(sheet.getByText('Hear the question again')).toHaveCount(0);
  await expect(page.locator('#fia-band[data-lifted]')).toBeVisible();
  await expect(page.locator('.fia-flow-line')).toHaveCount(0);
  const go = sheet.locator('[data-role="primary"]');
  await expect(go).toHaveText('We talked — continue');
  await go.click();
  await expect(sheet).toBeHidden();
  await expect(guide).toHaveAttribute('data-unit-id', 'S03-U008');
  await expect(page.getByText('Went past the stop')).toBeVisible();

  expect(clipRequests, 'no clip is fetched with the voice off').toEqual([]);
});

test('"Turn voice on" goes back to the Guide at the same part', async ({ page }) => {
  await open(page, 'S03-U004');
  await page.locator('.fia-voice-off').click();
  await expect(page).toHaveURL(/\/guide$/);
  const s05 = page.locator('.fia-guide[data-narration]');
  await expect(s05).toHaveAttribute('data-unit-id', 'S03-U004');
  await expect(page.locator('.fia-guide-card__voice')).toContainText('AI voice');
  expect(await workspaceView(page)).toBe('guide');
});

test('the step end reads "Next step", the guide end "Finish"; Back and Skip keep the place', async ({
  page,
}) => {
  const { guide } = await open(page, 'S03-U025');
  await expect(primary(page)).toHaveAccessibleName('Next step');
  await expect(page.locator('.fia-flow-line')).toHaveText('Step 4 follows on');
  await primary(page).click();
  await expect(guide).toHaveAttribute('data-unit-id', 'S04-U001');
  await expect(page.locator('.fia-band__overline')).toContainText('Step 4 of 6');
  await page.getByRole('button', { name: 'Back to the part before' }).click();
  await expect(guide).toHaveAttribute('data-unit-id', 'S03-U025');
  await page.getByRole('button', { name: 'Skip to the next part' }).click();
  await expect(guide).toHaveAttribute('data-unit-id', 'S04-U001');
});

test('the last part says the guide ends there', async ({ page }) => {
  await open(page, 'S06-U010');
  await expect(primary(page)).toHaveAccessibleName('Finish');
  await expect(page.locator('.fia-flow-line')).toHaveText('The guide ends after this part');
  await expect(page.getByRole('button', { name: 'Skip to the next part' })).toBeDisabled();
});
