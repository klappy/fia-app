import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Visual baselines for the v2 glass lift: every screen S01–S19 and every sheet on v2/integration
// (SH-1..SH-5 and the Explore sheet, mock 25), at 390 × 844 in light and dark, so a reskin or a lift
// of the shared app layer can prove nothing moved. One state per screen (S09 adds its S09b layer),
// seeded as the F6 specs seed it (fia.flow.current.v1 · fia.workspace.v1.<pack> ·
// fia.completion.v1.<pack> · fia.settings.v1). Pixels are pinned: no network past the preview
// server, a fixed storage estimate, CSS animations off, fonts loaded before the shot.
//
// Baselines (*-chromium-linux.png) are rendered inside mcr.microsoft.com/playwright:v1.56.1-noble,
// the image ci.yml's `visual` job runs in, so fonts and libraries are fixed. The UI face is system-ui
// (tokens/alpha.css:59); which file draws it, and its italic (SH-2's question, guide.css:570), is the
// machine's choice, so a bare runner or another Linux box can render text a few pixels apart.
// After an intended change, take the PNGs from the failed job's `visual-baselines` artifact (or run
// `npm run build && npm run test:visual -- --update-snapshots` inside that image), review every
// changed PNG against `visual-results` (expected / actual / diff), and commit them.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
// Every shot seeds its own page: the 52 run side by side across workers.
test.describe.configure({ mode: 'parallel' });

const PACK = 'eng.MRK-1-1-13';
const gu = JSON.parse(
  readFileSync(new URL('../data/packs/eng.MRK-1-1-13/guide-units.json', import.meta.url), 'utf8'),
) as {
  steps: { units: { id: string; textSha256: string }[] }[];
  stops: { id: string; afterUnitId: string; kind: string }[];
};
const units = gu.steps.flatMap((s) => s.units);
const order = units.map((u) => u.id);
const PLATE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="620"><rect width="1000" height="620" fill="#4f8a6b"/></svg>';
const talks = new Set(gu.stops.filter((s) => s.kind !== 'terminal').map((s) => s.afterUnitId));

type Theme = 'light' | 'dark';
/** none: settings only (first run) · walk: the guide in progress at S03-U004 · done: a finished walk. */
type State = 'none' | 'walk' | 'done';

interface Shot {
  name: string;
  path: string;
  state: State;
  /** What must be on screen before the shot. */
  ready: string;
  /** In-app steps after load (e.g. open a sheet from its host screen). */
  open?: (page: Page) => Promise<void>;
}

const screen = (id: string) => `[data-screen="${id}"]`;
const dialog = '[role="dialog"]';

const SHOTS: Shot[] = [
  { name: 'S01-language', path: '/', state: 'none', ready: screen('S01') },
  { name: 'S02-library', path: '/library', state: 'walk', ready: screen('S02') },
  { name: 'S03-pericopes', path: '/pericopes', state: 'walk', ready: screen('S03') },
  { name: 'S04-passage', path: '/passage', state: 'walk', ready: screen('S04') },
  { name: 'S05-guide', path: '/guide', state: 'walk', ready: screen('S05') },
  { name: 'S06-script', path: '/script', state: 'walk', ready: screen('S06') },
  { name: 'S07-overview', path: '/overview', state: 'walk', ready: screen('S07') },
  {
    name: 'S08-scripture',
    path: `/scripture?pack=${PACK}&unit=S03-U004`,
    state: 'walk',
    ready: screen('S08'),
  },
  // S09 is the guide card's Resources view of the part; S09b is the whole catalog as its layer.
  {
    name: 'S09-resources',
    path: `/resources?pack=${PACK}&unit=S03-U004`,
    state: 'walk',
    ready: `${screen('S09')} .fia-res__row`,
  },
  {
    name: 'S09b-resources-all',
    path: `/resources?pack=${PACK}&unit=S03-U004&all=1`,
    state: 'walk',
    ready: '[data-layer="all"]',
  },
  {
    name: 'S10-term',
    path: `/term?pack=${PACK}&id=term-eng-t9&from=resources`,
    state: 'walk',
    ready: screen('S10'),
  },
  {
    name: 'S11-viewer',
    path: '/viewer?pack=spa.MRK-1-1-13&id=c201&unit=4',
    state: 'walk',
    ready: screen('S11'),
  },
  {
    name: 'S12-video',
    path: `/video?pack=${PACK}&id=a13&unit=4`,
    state: 'walk',
    ready: screen('S12'),
  },
  { name: 'S13-downloads', path: '/downloads', state: 'walk', ready: screen('S13') },
  { name: 'S14-settings', path: '/settings', state: 'walk', ready: screen('S14') },
  { name: 'S15-about', path: '/about', state: 'walk', ready: screen('S15') },
  { name: 'S16-feedback', path: '/feedback', state: 'walk', ready: screen('S16') },
  { name: 'S17-install', path: '/install', state: 'walk', ready: screen('S17') },
  { name: 'S18-done', path: '/done', state: 'done', ready: screen('S18') },
  { name: 'S19-coverage', path: '/coverage?lang=spa', state: 'walk', ready: screen('S19') },
  // Sheets. SH-1 is opened from its host (S10's source mark), SH-2 from the guide's first talk, the
  // Explore sheet from the guide header; SH-3..SH-5 are their own routes (S13 / S04 / S07 raise them).
  {
    name: 'SH1-provenance',
    path: `/term?pack=${PACK}&id=term-eng-t9&from=resources`,
    state: 'walk',
    ready: dialog,
    open: async (page) => {
      await page.locator(`${screen('S10')} .fia-chips .fia-chip-btn`).click();
    },
  },
  {
    name: 'SH2-stop',
    path: '/guide',
    state: 'walk',
    ready: `${dialog}.fia-sheet--stop`,
    open: async (page) => {
      const sheet = page.locator(`${dialog}.fia-sheet--stop`);
      const primary = page.locator(`${screen('S05')} > .fia-primary-slot [data-role="primary"]`);
      for (let i = 0; i < 40 && !(await sheet.isVisible()); i++) {
        await primary.click();
        await page.waitForTimeout(50);
      }
    },
  },
  {
    name: 'SH3-update',
    path: `/sheet/update?variant=content&pack=${PACK}`,
    state: 'walk',
    ready: dialog,
  },
  { name: 'SH4-storage', path: '/sheet/storage?variant=quota', state: 'walk', ready: dialog },
  { name: 'SH5-jump', path: '/sheet/jump', state: 'walk', ready: dialog },
  {
    name: 'S25-explore',
    path: '/guide',
    state: 'walk',
    ready: `${dialog}[aria-modal="true"]`,
    open: async (page) => {
      await page.locator('.fia-explore').first().click();
    },
  },
];

function workspace(state: State) {
  if (state === 'none') return null;
  const at = state === 'done' ? order.length - 1 : order.indexOf('S03-U004');
  return {
    schemaVersion: 1,
    packId: PACK,
    contentLanguage: 'eng',
    theme: 'light',
    view: 'guide',
    position: {
      stepId: order[at].slice(0, 3),
      unitId: order[at],
      visited: order.slice(0, at + 1),
      finished: state === 'done',
    },
    checkpoint: null,
    savedAt: '2026-10-02T12:00:00.000Z',
  };
}

function completion(state: State) {
  if (state !== 'done') return null;
  return {
    schemaVersion: 1,
    packId: PACK,
    records: units.map((u) => ({
      unitId: u.id,
      sourceDigest: u.textSha256,
      manualOverride: null,
      autoComplete: true,
      ...(talks.has(u.id) ? { discussed: true } : {}),
      playedParts: talks.has(u.id) ? ['text', 'stop'] : ['text'],
    })),
  };
}

async function seed(page: Page, state: State, theme: Theme) {
  // Pixels never wait on the network: only the preview server answers. A remote image (S11's map
  // and photo on S3) is one flat plate, as f6-s11-viewer.spec.ts stubs it; other remote media fail.
  const base = new URL(test.info().project.use.baseURL ?? 'http://127.0.0.1:4173');
  await page.route(
    (url) => url.host !== base.host,
    (r) =>
      r.request().resourceType() === 'image'
        ? r.fulfill({ contentType: 'image/svg+xml', body: PLATE })
        : r.abort(),
  );
  await page.addInitScript(
    ([pack, ws, cr, theme]) => {
      // A fixed phone: the free-space line (S03, S13, SH-4) reads the same on every machine.
      const storage = navigator.storage as StorageManager | undefined;
      if (storage) {
        Object.defineProperty(storage, 'estimate', {
          value: async () => ({ usage: 52_000_000, quota: 11_200_000_000 }),
        });
        Object.defineProperty(storage, 'persisted', { value: async () => true });
      }
      localStorage.setItem(
        'fia.settings.v1',
        JSON.stringify({
          schemaVersion: 1,
          narrationMode: 'source-only',
          subtitleMode: 'off',
          mediaTier: 'phone',
          contentLanguage: 'eng',
          uiLanguage: 'eng',
          textSize: 'system',
          lowLiteracy: false,
          theme,
          disclosuresPresented: [],
          telemetryOptIn: false,
        }),
      );
      if (!ws) return;
      localStorage.setItem(
        'fia.flow.current.v1',
        JSON.stringify({ language: 'eng', book: 'MRK', packId: pack }),
      );
      localStorage.setItem(`fia.workspace.v1.${pack}`, JSON.stringify(ws));
      if (cr) localStorage.setItem(`fia.completion.v1.${pack}`, JSON.stringify(cr));
    },
    [PACK, workspace(state), completion(state), theme] as const,
  );
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Images decoded, two frames painted.
    await Promise.all(
      [...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null))),
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme}`, () => {
    test.use({ colorScheme: theme });

    for (const shot of SHOTS) {
      test(`${shot.name} ${theme}`, async ({ page }) => {
        test.setTimeout(60_000);
        await seed(page, shot.state, theme);
        await page.goto(shot.path);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        if (shot.open) {
          await settle(page);
          await shot.open(page);
        }
        await expect(page.locator(shot.ready).first()).toBeVisible();
        await settle(page);
        // Small tolerance: anti-aliasing noise passes, a moved edge or a changed colour does not.
        await expect(page).toHaveScreenshot(`${shot.name}-${theme}.png`, {
          fullPage: true,
          animations: 'disabled',
          caret: 'hide',
          maxDiffPixelRatio: 0.002,
          timeout: 15_000,
        });
      });
    }
  });
}
