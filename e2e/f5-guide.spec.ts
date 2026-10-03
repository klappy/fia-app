import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// F5 (BUILD-ORDER lane F; captain's ruling 2026-10-02 ~17:22 ET): S05 Guide plays the PoC's live Mark
// 1:1–13 clips through the stand-in C-05 manifest (src/media/standin). Proves: the media element
// streams a clip that answers 200 audio/mpeg and its currentTime advances; the 2 s countdown carries
// into the next part, which plays; a discussion stop opens sheet 21. Needs the network to
// fia.klappy.dev (the clips are not in the repo). Meeting point M is not claimed here (G-B, B2b).
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });

const PACK = 'eng.MRK-1-1-13';
const HOST = 'https://fia.klappy.dev';
const standin = JSON.parse(
  readFileSync(join(process.cwd(), 'src/media/standin', `${PACK}.narration.json`), 'utf8'),
) as { entries: { id: string; path: string; bytes: number; sha256: string }[] };
const entry = (id: string) => standin.entries.find((e) => e.id === id)!;

interface Seen {
  url: string;
  status: number;
  type: string;
}

async function setup(context: BrowserContext, page: Page, unitId?: string) {
  // A sandbox whose egress proxy re-signs TLS with a CA the bundled Chromium does not take relays the
  // page's clip request through Playwright's request context (which does trust it); the status, type
  // and bytes the page receives are the live host's. Without a proxy (CI) the browser goes direct.
  if (process.env.HTTPS_PROXY)
    await context.route(`${HOST}/**`, async (r) => r.fulfill({ response: await r.fetch() }));
  const seen: Seen[] = [];
  page.on('response', (r) => {
    if (r.url().startsWith(HOST))
      seen.push({ url: r.url(), status: r.status(), type: r.headers()['content-type'] ?? '' });
  });
  await page.addInitScript(
    ({ PACK, unitId }) => {
      localStorage.setItem(
        'fia.flow.current.v1',
        JSON.stringify({ language: 'eng', book: 'MRK', packId: PACK }),
      );
      if (unitId)
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
    },
    { PACK, unitId },
  );
  await page.goto('/guide');
  await expect(page.locator('.fia-guide[data-narration="standin"]')).toBeVisible();
  return seen;
}

const primary = (page: Page) =>
  page.locator('[data-screen="S05"] > .fia-primary-slot [data-role="primary"]');
const audioTime = (page: Page) =>
  page.evaluate(() => document.querySelector<HTMLAudioElement>('audio[data-clip-id]')!.currentTime);

test('the guide streams a live PoC clip, then the 2 s countdown plays the next part', async ({
  context,
  page,
  request,
}) => {
  test.setTimeout(60_000);
  // The live file is the one the stand-in names (bytes and sha256).
  const clip = entry('S01-U001');
  const live = await request.get(`${HOST}${clip.path}`);
  expect(live.status()).toBe(200);
  expect(live.headers()['content-type']).toBe('audio/mpeg');
  const body = await live.body();
  expect(body.length).toBe(clip.bytes);
  expect(createHash('sha256').update(body).digest('hex')).toBe(clip.sha256);

  const seen = await setup(context, page);
  const guide = page.locator('.fia-guide');
  await expect(guide).toHaveAttribute('data-unit-id', 'S01-U001');
  await expect(primary(page)).toHaveAccessibleName('Play part 1');
  // The card's voice chip reads as S02 and S04 do for this passage: the C-03 catalog has no generated
  // guide narration yet (passageCard `guideVoice`; J-A1 walk). Nothing played before the tap (R-407).
  await expect(page.locator('.fia-guide-card__voice')).toContainText('Text · voice not yet');
  expect(seen).toHaveLength(0);

  await primary(page).click();
  await expect(guide).toHaveAttribute('data-phase', 'playing');
  await expect(primary(page)).toHaveAccessibleName('Pause');
  await expect
    .poll(() => seen.find((s) => s.url === `${HOST}${clip.path}`), { timeout: 15_000 })
    .toMatchObject({ status: 200, type: 'audio/mpeg' });
  const t0 = await audioTime(page);
  await expect.poll(() => audioTime(page), { timeout: 15_000 }).toBeGreaterThan(t0 + 0.5);
  await expect(page.locator('.fia-status')).toHaveText(/^0:0\d \/ 0:04$/);

  // The clip ends on its own; the countdown runs 2 s (RULING), then the next part plays.
  await expect(guide).toHaveAttribute('data-phase', 'countdown', { timeout: 15_000 });
  const started = Date.now();
  await expect(primary(page)).toHaveAccessibleName(/^Next part plays in \d seconds\. Tap to wait$/);
  await expect(page.locator('.fia-gp-arc[data-arc="countdown"]')).toBeVisible();
  await expect(guide).toHaveAttribute('data-unit-id', 'S01-U002', { timeout: 5_000 });
  const waited = Date.now() - started;
  expect(waited).toBeGreaterThan(1_200);
  expect(waited).toBeLessThan(3_500);
  await expect(guide).toHaveAttribute('data-phase', 'playing');
  const next = entry('S01-U002');
  await expect
    .poll(() => seen.find((s) => s.url === `${HOST}${next.path}`), { timeout: 15_000 })
    .toMatchObject({ status: 200, type: 'audio/mpeg' });
  await expect.poll(() => audioTime(page), { timeout: 15_000 }).toBeGreaterThan(0.3);
});

test('a discussion stop opens sheet 21; "We talked — continue" goes on', async ({
  context,
  page,
}) => {
  test.setTimeout(60_000);
  const seen = await setup(context, page, 'S02-U005'); // stop-001 follows this part
  const guide = page.locator('.fia-guide');
  await expect(guide).toHaveAttribute('data-unit-id', 'S02-U005');
  await primary(page).click();
  await expect.poll(() => audioTime(page), { timeout: 15_000 }).toBeGreaterThan(0.2);
  expect(
    seen.some((s) => s.url.endsWith('/audio/next-actions/S02-U005.mp3') && s.status === 200),
  ).toBe(true);
  // Skip to the clip's last moment so the test does not wait the whole part.
  await page.evaluate(() => {
    const a = document.querySelector<HTMLAudioElement>('audio[data-clip-id]')!;
    a.currentTime = Math.max(0, a.duration - 0.2);
  });
  const sheet = page.locator('[role="dialog"].fia-sheet--stop');
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(guide).toHaveAttribute('data-phase', 'stop');
  await expect(sheet.locator('.fia-sheet-brand')).toContainText('Talk together');
  await expect(sheet.locator('.fia-stop-quote')).toContainText('Jordan River');
  // The band stays readable above the sheet at 1× (mock 21).
  await expect(page.locator('#fia-band[data-lifted]')).toBeVisible();
  const go = sheet.locator('[data-role="primary"]');
  await expect(go).toHaveText('We talked — continue');
  await go.click();
  await expect(sheet).toBeHidden();
  await expect(guide).toHaveAttribute('data-unit-id', 'S02-U006');
  await expect(page.getByText('Went past the stop')).toBeVisible();
});

test('Recorded only: no AI clip plays, the part says so and the big button goes on', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'fia.settings.v1',
      JSON.stringify({ schemaVersion: 1, narrationMode: 'source-only' }),
    ),
  );
  await page.addInitScript(() =>
    localStorage.setItem(
      'fia.flow.current.v1',
      JSON.stringify({ language: 'eng', book: 'MRK', packId: 'eng.MRK-1-1-13' }),
    ),
  );
  await page.goto('/guide');
  const guide = page.locator('.fia-guide');
  await expect(guide).toHaveAttribute('data-has-audio', 'false');
  await expect(page.locator('.fia-guide-card__voice')).toContainText(
    'Silent: recorded voices only',
  );
  await expect(page.locator('audio[data-clip-id]')).toHaveCount(0);
  await expect(primary(page)).toHaveAccessibleName('Next part');
  await primary(page).click();
  await expect(guide).toHaveAttribute('data-unit-id', 'S01-U002');
});

test('a last part whose clip fails to load still finishes: the guide reaches S18 (J-A1 walk)', async ({
  context,
  page,
}) => {
  test.setTimeout(60_000);
  // The last part's clip never loads (a dropped connection). Page routes win over setup's relay.
  const last = entry('S06-U010');
  let tries = 0;
  await page.route(`${HOST}${last.path}`, (r) => {
    tries++;
    return r.abort();
  });
  await setup(context, page, 'S06-U010');
  const guide = page.locator('.fia-guide');
  await expect(guide).toHaveAttribute('data-unit-id', 'S06-U010');
  // Skip has nowhere to go on the last part; before this fix the big button was the only way on.
  await expect(page.getByRole('button', { name: 'Skip to the next part' })).toBeDisabled();
  await primary(page).click();

  // Honest copy, and the big button goes on (it no longer only retries the clip).
  const alert = page.locator('[data-role="clip-error"]');
  await expect(alert).toContainText('The voice for this part did not load.');
  await expect(guide).toHaveAttribute('data-phase', 'next-ready');
  await expect(primary(page)).toHaveAccessibleName('Finish');
  expect(tries).toBeGreaterThan(0);

  // Trying again stays a second choice: it fetches the clip afresh and lands back here.
  const seen = tries;
  await alert.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(() => tries, { timeout: 10_000 }).toBeGreaterThan(seen);
  await expect(alert).toBeVisible();
  await expect(guide).toHaveAttribute('data-phase', 'next-ready');

  await primary(page).click();
  await expect(page).toHaveURL(/\/done$/);
  await expect(page.locator('[data-screen="S18"]')).toBeVisible();
});
