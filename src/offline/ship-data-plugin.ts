// Build step (Node): ship the L1 pipeline output in `data/` into `dist/` at the paths the app
// requests. Without it `/data/catalog/manifest.json` falls through to the SPA fallback
// (wrangler `not_found_handling: single-page-application`) and returns index.html with 200, so
// every content journey dies at S02.
//
//   data/catalog/*.json   -> dist/data/catalog/   (C-03 catalog + per-language counts; flow, S19)
//   data/rights/*.json    -> dist/data/rights/    (C-13 rights records; S15)
//   data/packs/<id>/*.json -> dist/packs/<id>/     (C-02 paths only: flow guide, media screens,
//                                                   rights line and the offline engine all read
//                                                   these, so a Save covers what S04–S08 read)
//   data/cache/**         -> not shipped (BL4d interim subtitle cache; lines reach the app via the catalog)
//   (written)             -> dist/data/catalog/ready.json: `{ packs: [ids] }`, the packs this build
//                            ships with a guide (guide.json + guide-units.json). It sits beside the
//                            C-03 catalog, which lists every guide the sources hold; S02–S04 mark the
//                            rest "not yet" (GAP-NOPACK). Never under /data/packs: packs have one path.
//
// Only `.json` is shipped. None of it is precached: the shell manifest skips `data/` and `packs/`
// (C-07 tiers — packs are saved per pack on request, never with the shell).
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

/** Files the app cannot start without; a build without them fails loudly. */
export const REQUIRED_DATA = ['catalog/manifest.json', 'rights/records.json'];

/** Where the build writes the ready index (GAP-NOPACK), beside the catalog; read by `flow/ready`. */
export const READY_INDEX = 'data/catalog/ready.json';

export function shipData(dataDir: string, outDir: string): string[] {
  for (const f of REQUIRED_DATA)
    if (!existsSync(join(dataDir, f))) throw new Error(`ship-data: missing ${join(dataDir, f)}`);
  const written: string[] = [];
  const copy = (from: string, to: string) => {
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
    written.push(to);
  };
  const walk = (rel: string) => {
    const full = join(dataDir, rel);
    for (const name of readdirSync(full).sort()) {
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(join(dataDir, r)).isDirectory()) {
        if (r === 'cache') continue; // pipeline-only cache (raw model text, usage, heading inputs): never served
        walk(r);
        continue;
      }
      if (!name.endsWith('.json')) continue;
      // One path per pack file: packs at their C-02 path, everything else under /data.
      copy(join(dataDir, r), r.startsWith('packs/') ? join(outDir, r) : join(outDir, 'data', r));
    }
  };
  walk('');
  const index = join(outDir, READY_INDEX);
  mkdirSync(dirname(index), { recursive: true });
  writeFileSync(index, `${JSON.stringify({ packs: shippedPacks(dataDir) })}\n`);
  written.push(index);
  return written;
}

/** Pack ids under `data/packs/` that carry the two files the guide flow reads, sorted. */
export function shippedPacks(dataDir: string): string[] {
  const dir = join(dataDir, 'packs');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((id) => ['guide.json', 'guide-units.json'].every((f) => existsSync(join(dir, id, f))))
    .sort();
}

export function shipDataPlugin(opts: { dataDir?: string } = {}): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'fia-ship-data',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    writeBundle() {
      if (config.build.ssr) return;
      const dataDir = opts.dataDir ?? join(config.root, 'data');
      shipData(dataDir, join(config.root, config.build.outDir));
    },
  };
}
