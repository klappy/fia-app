// Build step (Node): after Vite writes `dist/`, list the app shell with bytes + sha256 in
// `dist/offline-shell.json` (C-07 entry shape, group "shell"). The service worker precaches
// exactly these files at install and verifies each one (R-702). Replaces the PoC
// `scripts/build-offline-shell.mjs` (POC-REFERENCE § 7: KNOWLEDGE).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

const MIME: Record<string, string> = {
  html: 'text/html',
  js: 'text/javascript',
  mjs: 'text/javascript',
  css: 'text/css',
  svg: 'image/svg+xml',
  png: 'image/png',
  webp: 'image/webp',
  ico: 'image/x-icon',
  json: 'application/json',
  webmanifest: 'application/manifest+json',
  woff2: 'font/woff2',
};
// version.json is the deploy stamp (RELEASING.md): always from the network, never precached.
// Noto Serif TC (Han, ~6 MB in 216 unicode-range subsets) stays out of the shell: the kit asks
// apps to keep it out of any offline precache, and it loads lazily when Han text renders (vendored
// kit assets/fonts/README.md; tokens/fonts-noto-tc.css:3). Vite emits its subsets flat as
// assets/noto-serif-tc-<n>-<weight>-normal-<hash>.woff2; the other five Noto faces are precached.
const SKIP = [
  /^sw\.js$/,
  /^workbox-/,
  /^registerSW\.js$/,
  /^offline-shell\.json$/,
  /^version\.json$/,
  /\.map$/,
  /^noto-serif-tc-.*\.woff2$/,
];
// Pipeline content (ship-data-plugin): packs are saved per pack on request (C-07 tiers) and the
// catalog is ~32 MB — never part of the shell precache.
const SKIP_DIRS = new Set(['data', 'packs']);

export function shellEntries(outDir: string) {
  const out: Array<{ path: string; bytes: number; sha256: string; mime: string; group: 'shell' }> =
    [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (dir === outDir && SKIP_DIRS.has(name)) continue;
        walk(full);
        continue;
      }
      const rel = relative(outDir, full).split(sep).join('/');
      if (SKIP.some((re) => re.test(rel.split('/').pop()!))) continue;
      const mime = MIME[rel.split('.').pop() ?? ''];
      if (!mime) continue;
      const buf = readFileSync(full);
      out.push({
        path: `/${rel}`,
        bytes: buf.byteLength,
        sha256: createHash('sha256').update(buf).digest('hex'),
        mime,
        group: 'shell',
      });
    }
  };
  walk(outDir);
  return out;
}

export function offlineShellManifest(opts: { appVersion?: string } = {}): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'fia-offline-shell-manifest',
    apply: 'build',
    enforce: 'post',
    configResolved(c) {
      config = c;
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        if (config.build.ssr) return;
        const outDir = join(config.root, config.build.outDir);
        const entries = shellEntries(outDir);
        writeFileSync(
          join(outDir, 'offline-shell.json'),
          JSON.stringify({ schemaVersion: 1, appVersion: opts.appVersion, entries }, null, 2),
        );
      },
    },
  };
}
