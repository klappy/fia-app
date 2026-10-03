import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// F6-S18 Completion in glass on the built app (mock design/alpha-v2-screens/18-completion.html): the mock's
// regions in order (done mark · "You finished Mark 1:1–13" · steps and parts · six steps on the kit rail,
// named and ticked · "What your group went through" · rows · one primary "Next passage: Mark 1:14–20"),
// the saved row from a real C-07 save, the unmocked skipped and offline states, and at 150/200/310% text
// nothing passes 390 px, no text clips and the primary stays on screen (PRD § 5 rule 6, § 8.5).
test.use({ viewport: { width: 390, height: 844 } });

const PACK = 'eng.MRK-1-1-13';
const NEXT = /Next passage: Mark 1:14⁠?–⁠?20/;
const gu = JSON.parse(
  readFileSync(new URL('../data/packs/eng.MRK-1-1-13/guide-units.json', import.meta.url), 'utf8'),
) as {
  steps: { units: { id: string; textSha256: string }[] }[];
  stops: { id: string; afterUnitId: string; kind: string }[];
};
const all = gu.steps.flatMap((s) => s.units);
const order = all.map((u) => u.id);
const sha = Object.fromEntries(all.map((u) => [u.id, u.textSha256]));
const talks = gu.stops.filter((s) => s.kind !== 'terminal');

/** A finished walk: C-09 workspace + C-11 record (talks skipped first, parts never visited). */
function record(skip = 0, unvisited: string[] = []) {
  const talked = new Set(talks.slice(skip).map((s) => s.afterUnitId));
  const visited = order.filter((id) => !unvisited.includes(id));
  return {
    ws: {
      schemaVersion: 1,
      packId: PACK,
      contentLanguage: 'eng',
      theme: 'light',
      view: 'guide',
      position: { stepId: 'S06', unitId: order.at(-1), visited, finished: true },
      checkpoint: null,
      savedAt: '2026-10-02T12:00:00.000Z',
    },
    cr: {
      schemaVersion: 1,
      packId: PACK,
      records: visited.map((id) => ({
        unitId: id,
        sourceDigest: sha[id],
        manualOverride: null,
        autoComplete: true,
        ...(talks.some((s) => s.afterUnitId === id) ? { discussed: talked.has(id) } : {}),
        playedParts: talked.has(id) ? ['text', 'stop'] : ['text'],
      })),
    },
  };
}

async function seed(
  page: Page,
  opts: { skip?: number; unvisited?: string[]; textSize?: string; theme?: string } = {},
) {
  const { ws, cr } = record(opts.skip, opts.unvisited);
  await page.addInitScript(
    ([pack, w, c, textSize, theme]) => {
      localStorage.setItem(
        'fia.flow.current.v1',
        JSON.stringify({ language: 'eng', book: 'MRK', packId: pack }),
      );
      localStorage.setItem(`fia.workspace.v1.${pack}`, JSON.stringify(w));
      localStorage.setItem(`fia.completion.v1.${pack}`, JSON.stringify(c));
      localStorage.setItem(
        'fia.settings.v1',
        JSON.stringify({ schemaVersion: 1, textSize, theme }),
      );
    },
    [PACK, ws, cr, opts.textSize ?? 'system', opts.theme ?? 'light'] as const,
  );
}

test.describe('without a worker', () => {
  test.use({ serviceWorkers: 'block' });

  test('the mock regions in order, counts from the pack and the record, one primary "Next passage: Mark 1:14–20"', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/done');
    const screen = page.locator('[data-screen="S18"]');
    await expect(screen.getByRole('heading', { level: 1 })).toHaveText(
      /^You finished Mark 1:1⁠?–⁠?13$/,
    );
    const recap = screen.locator('[data-role="recap"]');
    await expect(recap.locator('.s18-h1')).toHaveText(/You finished Mark 1:1⁠?–⁠?13/);
    await expect(recap.locator('[data-role="summary"]')).toHaveText(
      'All 6 steps · 130 of 130 parts',
    );
    // overall: the kit rail, every segment done, then the end mark; every step named and ticked
    const rail = recap.getByRole('img', { name: 'All 6 steps' });
    await expect(rail.locator('[data-state="done"]')).toHaveCount(6);
    await expect(recap.locator('.s18-segs svg[data-kind="end"]')).toHaveCount(1);
    const steps = recap.locator('.s18-step');
    await expect(steps).toHaveCount(6);
    await expect(steps.nth(0)).toHaveText('1 Hear and Heart');
    await expect(steps.nth(5)).toHaveText('6 Speaking the Word');
    await expect(recap.locator('.s18-step[data-reached] svg')).toHaveCount(6);
    // scoped: one line per kind the pack places at a part, led by the guide's own marks
    await expect(recap.getByRole('heading', { level: 2 })).toHaveText(
      'What your group went through',
    );
    const kinds = recap.locator('.s18-kind');
    await expect(kinds).toHaveText([
      'Key terms in 60 parts',
      'The passage read in 5 parts',
      'Talked together at 23 of 23 stops',
    ]);
    await expect(kinds.locator('svg[data-kind]')).toHaveCount(3);
    await expect(recap.locator('.s18-kept')).toHaveText('Your marks are kept.');
    await expect(screen.locator('.s18-row')).toHaveText([
      'Start the guide again',
      'Send feedback',
      'Save for offline',
    ]);

    // order of regions, top to bottom: mark · headline · summary · rail · kinds · rows · primary
    const primary = page.locator('[data-role="primary"]');
    const ys = await Promise.all(
      [
        recap.locator('.s18-mark'),
        recap.locator('.s18-h1'),
        recap.locator('[data-role="summary"]'),
        rail,
        kinds.first(),
        screen.locator('.s18-row').first(),
        primary,
      ].map(async (l) => (await l.boundingBox())!.y),
    );
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);

    // one primary, the only dark fill; it opens the next passage's card (S04)
    await expect(primary).toHaveCount(1);
    await expect(primary).toHaveText(NEXT);
    const dark = await page.evaluate(() => {
      const bg = getComputedStyle(document.querySelector('[data-role="primary"]')!).backgroundColor;
      return [...document.querySelectorAll('*')].filter(
        (e) => getComputedStyle(e).backgroundColor === bg && e.getBoundingClientRect().width > 0,
      ).length;
    });
    expect(dark).toBe(1);
    await primary.click();
    await expect(page).toHaveURL(/\/passage$/);
    const cur = await page.evaluate(() => localStorage.getItem('fia.flow.current.v1'));
    expect(JSON.parse(cur!)).toMatchObject({ book: 'MRK', packId: 'eng.MRK-1-14-20' });
  });

  test('rows: start the guide again at part 1, send feedback from S18, save for offline on S04', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/done');
    await page.locator('[data-role="feedback"]').click();
    await expect(page).toHaveURL(/\/feedback\?from=S18$/);
    await page.goBack();
    await page.locator('[data-role="save"]').click();
    await expect(page).toHaveURL(/\/passage\?save=1$/);
    await page.goBack();
    await page.locator('[data-role="start-again"]').click();
    await expect(page).toHaveURL(/\/guide$/);
    await expect(page.locator('[data-screen="S05"]')).toBeVisible();
  });

  test('skipped talks and parts (unmocked): honest counts and a row back to the skipped talks', async ({
    page,
  }) => {
    await seed(page, { skip: 2, unvisited: order.slice(40, 43) });
    await page.goto('/done');
    const recap = page.locator('[data-role="recap"]');
    await expect(recap.locator('[data-role="summary"]')).toHaveText(
      'All 6 steps · 127 of 130 parts',
    );
    await expect(recap.locator('.s18-kind').last()).toHaveText(
      /^Talked together at \d+ of 23 stops$/,
    );
    await expect(recap.locator('.s18-kind').last()).not.toHaveText(/23 of 23/);
    await page.locator('[data-role="review-skipped"]').click();
    await expect(page).toHaveURL(/\/overview$/);
  });

  test('offline and not saved (unmocked): the row says the save waits for a connection', async ({
    page,
    context,
  }) => {
    await seed(page);
    await page.goto('/done');
    await expect(page.locator('[data-role="primary"]')).toHaveText(NEXT);
    await context.setOffline(true);
    await expect(page.locator('[data-role="save"]')).toHaveText('Save — needs connection');
    await context.setOffline(false);
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
        await page.goto('/done');
        await expect(page.locator('html')).toHaveAttribute('data-text-step', step);
        await expect(page.locator('[data-role="primary"]')).toHaveText(NEXT);
        const report = await page.evaluate(() => {
          const screen = document.querySelector('[data-screen="S18"]')!;
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
        // at 200%+ the steps list is one column (mock html.fia-big .s18-steps)
        const steps = page.locator('.s18-step');
        const [a, b] = [await steps.nth(0).boundingBox(), await steps.nth(1).boundingBox()];
        if (step === 'x150') expect(b!.y).toBeLessThan(a!.y + 1);
        else expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1);
      });
    }
});

test('saved on this phone (C-07 SAVE through the worker): "Saved on this phone · ready offline"', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/library');
  const saved = await page.evaluate(async (pack) => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r));
    return new Promise<{ saved?: boolean }>((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e: MessageEvent) => {
        if (!(e.data as { progress?: boolean })?.progress) resolve(e.data as { saved?: boolean });
      };
      navigator.serviceWorker.controller!.postMessage(
        {
          type: 'SAVE',
          packId: pack,
          tier: 'text',
          narration: 'source-fallback',
          id: crypto.randomUUID(),
        },
        [ch.port2],
      );
    });
  }, PACK);
  expect(saved.saved).toBe(true);
  await page.goto('/done');
  const row = page.locator('[data-role="saved"]');
  await expect(row).toHaveText('Saved on this phone · ready offline', { timeout: 10_000 });
  await expect(page.locator('[data-role="save"]')).toHaveCount(0);
  await row.click();
  await expect(page).toHaveURL(/\/downloads$/);
});
