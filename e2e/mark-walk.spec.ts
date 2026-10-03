import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Mark eng+spa ticket item 3 (cookbook work/active/2026-10-03-fia-mark-full-eng-spa/TICKET.md): the app
// walk per pack, on the built app, both languages. For every Mark pack: S04 opens it, the big button
// walks every visible part of all six steps to S18 (talk stops continued), each resource it carries
// (key terms, images, maps, videos) opens once in its own screen, and nothing logs a console error or
// shows a missing string (an i18n key or an unfilled {placeholder}). The first and last step are shot
// at 390×844 and 1280×800 for the design lens (test output, not baselines). The S03 list and the
// catalog show every Mark passage with a measured size; Save for offline works for the last one.
// "Recorded only" narration keeps every part silent, so the walk needs no clips (item 4 is held).
// Image, audio and video bytes come from S3; the stream is cut here as in the S10/S12 specs (the 200
// check is pipeline bin/check-urls.mjs), so the walk runs offline and a screen may show its honest
// media error ("This recording could not load"); the resource itself must still resolve.
test.use({ viewport: { width: 390, height: 844 } });

type Units = { steps: { id: string; units: { id: string; hidden?: boolean }[] }[] };
type Res = Record<'terms' | 'images' | 'maps' | 'videos', { id: string }[]>;
const read = <T>(path: string) =>
  JSON.parse(readFileSync(new URL(`../data/${path}`, import.meta.url), 'utf8')) as T;

const LANGS = ['eng', 'spa'] as const;
const LANG_NAME = { eng: 'English', spa: 'Español' } as const;
type Entry = { packId: string; book: string; tierBytesSource: string };
const markOf = (l: string) =>
  read<{ entries: Entry[] }>(`catalog/${l}.json`).entries.filter((e) => e.book === 'MRK');
const mark: Record<(typeof LANGS)[number], Entry[]> = { eng: markOf('eng'), spa: markOf('spa') };

const MISSING = /\bs\.[a-z0-9-]+\.[a-z0-9.-]*[a-z0-9]\b|\{[a-z][a-zA-Z0-9]*\}/;

async function seed(page: Page, lang: string, packId?: string) {
  await page.addInitScript(
    ([lang, packId]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(
        'fia.flow.current.v1',
        JSON.stringify({ language: lang, book: 'MRK', ...(packId ? { packId } : {}) }),
      );
      localStorage.setItem(
        'fia.settings.v1',
        JSON.stringify({
          schemaVersion: 1,
          narrationMode: 'source-only',
          subtitleMode: 'off',
          mediaTier: 'phone',
          contentLanguage: lang,
          uiLanguage: 'eng',
          textSize: 'system',
          lowLiteracy: false,
          theme: 'light',
          disclosuresPresented: [],
          telemetryOptIn: false,
        }),
      );
    },
    [lang, packId ?? ''] as const,
  );
}

/** Console and page errors; S3 media is cut, and only its own failed loads are not counted. */
async function watch(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/s3\.amazonaws\.com/.test(m.location().url) || /s3\.amazonaws\.com/.test(m.text())) return;
    errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.route(/s3\.amazonaws\.com/, (r) => r.abort());
  return errors;
}

/** Client-side navigation (react-router listens to popstate): no reload per resource. */
async function go(page: Page, url: string) {
  await page.evaluate((u) => {
    history.pushState({}, '', u);
    dispatchEvent(new PopStateEvent('popstate'));
  }, url);
}

const missingIn = (page: Page) =>
  page.evaluate((re) => document.body.innerText.match(new RegExp(re))?.[0] ?? null, MISSING.source);

for (const lang of LANGS) {
  test(`${lang}: S03 lists all 68 Mark passages with measured sizes; the catalog marks them built`, async ({
    page,
  }) => {
    expect(mark[lang]).toHaveLength(68);
    for (const e of mark[lang]) expect(e.tierBytesSource, e.packId).toBe('pack-manifest');
    const errors = await watch(page);
    await seed(page, lang);
    await page.goto('/pericopes');
    const s = page.locator('[data-screen="S03"]');
    const rows = s.locator('button[data-pack-id]');
    await expect(rows).toHaveCount(68);
    const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-pack-id')));
    expect(new Set(ids)).toEqual(new Set(mark[lang].map((e) => e.packId)));
    await expect(s.locator('[data-role="not-yet"]')).toHaveCount(0);
    await expect(s.getByTestId('row-size')).toHaveCount(68);
    for (const size of await s.getByTestId('row-size').allTextContents())
      expect(size).toMatch(/^≈\d+\sparts\s·\s\d+\sKB$/);
    expect(await missingIn(page)).toBeNull();
    expect(errors).toEqual([]);
  });
}

test.describe('Save for offline', () => {
  for (const lang of LANGS) {
    const PACK = `${lang}.MRK-16-9-20`;
    test(`${lang}: the last Mark passage saves through C-07 and shows Saved`, async ({ page }) => {
      test.setTimeout(60_000);
      await seed(page, lang);
      await page.goto('/pericopes');
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller)
          await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r));
      });
      const row = page.locator(`[data-screen="S03"] [data-pack-id="${PACK}"]`);
      await page.getByTestId('select-toggle').click();
      await row.click();
      await expect(row).toHaveAttribute('aria-checked', 'true');
      await page.locator('[data-role="primary"]').click();
      await expect(row.getByTestId('row-saved')).toHaveText('Saved', { timeout: 30_000 });
      await expect(row.getByTestId('row-size')).toHaveText(/·\s\d+\sKB$/);
    });
  }
});

test.describe('walk every pack', () => {
  test.use({ serviceWorkers: 'block' });
  for (const lang of LANGS)
    for (const { packId } of mark[lang]) {
      test(`${packId}: walk every part, open every resource, no console error or missing string`, async ({
        page,
      }, info) => {
        test.setTimeout(180_000);
        const units = read<Units>(`packs/${packId}/guide-units.json`);
        const res = read<Res>(`packs/${packId}/resources.json`);
        const visible = units.steps.flatMap((s) =>
          s.units.filter((u) => !u.hidden).map((u) => u.id),
        );
        const lastStep = units.steps.at(-1)!.id;
        const errors = await watch(page);
        await seed(page, lang, packId);

        // S04 opens the pack: its card, no "not yet", Start
        await page.goto('/passage');
        const s04 = page.locator('[data-screen="S04"]');
        await expect(s04).toBeVisible();
        await expect(s04.locator('.fia-absent')).toHaveCount(0);
        await expect(s04).toContainText(LANG_NAME[lang]);
        const start = page.locator('[data-role="primary"]');
        await expect(start).toContainText('Start');
        await start.click();

        const guide = page.locator('.fia-guide');
        await expect(guide).toHaveAttribute('data-unit-id', visible[0]);
        const primary = page.locator(
          '[data-screen="S05"] > .fia-primary-slot [data-role="primary"]',
        );
        const sheet = page.locator('[role="dialog"].fia-sheet--stop');
        const shoot = async (name: string) => {
          await page.screenshot({ path: info.outputPath(`${packId}-${name}-390x844.png`) });
          await page.setViewportSize({ width: 1280, height: 800 });
          await page.screenshot({ path: info.outputPath(`${packId}-${name}-1280x800.png`) });
          await page.setViewportSize({ width: 390, height: 844 });
        };
        await shoot('first-step');

        const seen = new Set<string>();
        const missing = new Set<string>();
        let shotLast = false;
        for (let i = 0; i < visible.length * 3 + 50; i++) {
          if (new URL(page.url()).pathname === '/done') break;
          const key = await page.evaluate(() => {
            const g = document.querySelector('.fia-guide');
            const open = !!document.querySelector('[role="dialog"].fia-sheet--stop');
            return `${g?.getAttribute('data-unit-id')}|${g?.getAttribute('data-phase')}|${open}`;
          });
          const unitId = key.split('|')[0];
          seen.add(unitId);
          const m = await missingIn(page);
          if (m) missing.add(`${unitId}: ${m}`);
          if (!shotLast && unitId.startsWith(`${lastStep}-`)) {
            shotLast = true;
            await shoot('last-step');
          }
          if (await sheet.isVisible()) await sheet.locator('[data-role="primary"]').click();
          else await primary.click();
          await page.waitForFunction((prev) => {
            if (location.pathname === '/done') return true;
            const g = document.querySelector('.fia-guide');
            const open = !!document.querySelector('[role="dialog"].fia-sheet--stop');
            return (
              `${g?.getAttribute('data-unit-id')}|${g?.getAttribute('data-phase')}|${open}` !== prev
            );
          }, key);
        }
        await expect(page).toHaveURL(/\/done$/);
        await expect(page.locator('[data-screen="S18"]')).toBeVisible();
        expect(
          visible.filter((id) => !seen.has(id)),
          'visible parts never shown',
        ).toEqual([]);
        expect(shotLast, 'reached the last step').toBe(true);

        // every resource the pack carries opens once in its screen
        const open = [
          ...res.terms.map((r) => ['S10', `/term?pack=${packId}&id=${r.id}&from=resources`]),
          ...[...res.images, ...res.maps].map((r) => ['S11', `/viewer?pack=${packId}&id=${r.id}`]),
          ...res.videos.map((r) => ['S12', `/video?pack=${packId}&id=${r.id}`]),
        ] as const;
        for (const [screen, url] of open) {
          await go(page, url);
          const s = page.locator(`[data-screen="${screen}"]`);
          await expect(s, url).toBeVisible();
          await expect(s.locator('.fia-layer-head__title'), url).not.toBeEmpty();
          await expect(s.getByText('Could not load resources.'), url).toHaveCount(0);
          const m = await missingIn(page);
          if (m) missing.add(`${url}: ${m}`);
        }
        expect([...missing], 'missing strings').toEqual([]);
        expect(errors, 'console errors').toEqual([]);
      });
    }
});
