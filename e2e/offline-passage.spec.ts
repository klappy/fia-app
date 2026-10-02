import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// GAP-OFFLINE (DEV smoke at 6eb6f1d): a Text save said "Saved" but S04–S07 then read
// "Could not read this passage's details" offline, because the flow read /data/packs/<id>/…
// while the save stored /packs/<id>/…. Every passage read now uses the C-02 pack paths the save
// stores. Proof: save eng Mark 1:1–13 on S04, drop the network (context.route aborts every
// request, the worker's own fetches included; setOffline alone misses those), then cold-open
// S04 → S05 → S06 → S07 → S08 and read each from the saved copy.
//
// Chromium routes a service worker's own fetches through context.route only with this flag
// (playwright-core crServiceWorker.js); without it the worker quietly reaches the network and an
// offline test passes on a broken build. Scoped to this file's tests, restored after.
const SW_NET = 'PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS';
const before = process.env[SW_NET];
test.beforeAll(() => {
  process.env[SW_NET] = '1';
});
test.afterAll(() => {
  if (before === undefined) delete process.env[SW_NET];
  else process.env[SW_NET] = before;
});
const PACK = 'eng.MRK-1-1-13';
const read = (f: string) =>
  JSON.parse(readFileSync(new URL(`../data/packs/${PACK}/${f}`, import.meta.url), 'utf8'));
const guide = read('guide.json') as { title: string; steps: { title: string }[] };
const textFiles = (
  read('manifest.json') as { tiers: { text: { files: { path: string }[] } } }
).tiers.text.files.map((f) => f.path);
const NOT_READ = "Could not read this passage's details.";

async function controlled(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r));
  });
  // The shell is committed at activate; offline navigations need it.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const r = await (await caches.open('fia-meta-v1')).match('/__fia_shell__');
        return r ? ((await r.json()) as { entries: unknown[] }).entries.length : 0;
      }),
    )
    .toBeGreaterThan(1);
}

async function cold(page: Page, path: string, screen: string) {
  await page.goto(path);
  await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible();
  await expect(page.getByText(NOT_READ)).toHaveCount(0);
}

test('a Text save opens S04 → S08 with no network', async ({ page, context }) => {
  await page.goto('/');
  await controlled(page);
  // The passage the person picked (S01–S03 write this; those screens are not under test here).
  await page.evaluate(
    (packId) =>
      localStorage.setItem(
        'fia.flow.current.v1',
        JSON.stringify({ language: 'eng', book: 'MRK', packId }),
      ),
    PACK,
  );

  // Save on S04 (C-07 SAVE, Text tier) and wait for the worker's verified state.
  await cold(page, '/passage', 'S04');
  const saveRow = page.getByTestId('save-row');
  await saveRow.getByTestId('save-button').click();
  await expect(saveRow.getByTestId('saved-row')).toContainText('Saved (Text, 0.5 MB)', {
    timeout: 20_000,
  });

  // Drop the network: the page reports offline, and every request that reaches the network —
  // the page's or the service worker's — is aborted and recorded.
  const aborted: string[] = [];
  await context.route('**/*', (route) => {
    aborted.push(new URL(route.request().url()).pathname);
    return route.abort('internetdisconnected');
  });
  await context.setOffline(true);

  // S04 passage card: title, the verified saved row, one primary.
  await cold(page, '/passage', 'S04');
  await expect(page.getByText(guide.title).first()).toBeVisible();
  await expect(page.getByTestId('saved-row')).toContainText('Saved (Text, 0.5 MB)');
  await expect(page.locator('[data-role="primary"]')).toContainText('Start');

  // S05 guide: the primary opens the first unit.
  await page.locator('[data-role="primary"]').click();
  await expect(page.locator('[data-screen="S05"]')).toBeVisible();
  await expect(page.getByText('In this step, hear Mark 1:1–13', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-screen="S05"]')).toBeVisible();
  await expect(page.getByText(NOT_READ)).toHaveCount(0);
  await expect(page.getByText('In this step, hear Mark 1:1–13', { exact: false })).toBeVisible();

  // S06 single script and S07 overview read the same saved guide.
  await cold(page, '/script', 'S06');
  await expect(page.getByText('In this step, hear Mark 1:1–13', { exact: false })).toBeVisible();
  await cold(page, '/overview', 'S07');
  for (const s of guide.steps) await expect(page.getByText(s.title).first()).toBeVisible();

  // S08 Scripture reader: the saved scripture.json.
  await cold(page, `/scripture?pack=${PACK}`, 'S08');
  await expect(page.locator('.fia-text__verse').first()).toBeVisible();
  await expect(
    page.getByText('This is the beginning of the gospel', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('This recording could not load.', { exact: false })).toHaveCount(0);

  // The network really was down, and no saved pack file was asked of it.
  expect(aborted.length).toBeGreaterThan(0);
  expect(aborted.filter((p) => textFiles.includes(p))).toEqual([]);
  expect(aborted.filter((p) => p.startsWith('/data/packs/'))).toEqual([]);

  await context.unroute('**/*');
  await context.setOffline(false);
});
