import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { shellEntries } from '../src/offline/shell-manifest-plugin';

// The vendored kit self-hosts six Noto faces (kit #10). Five ride in the offline shell; Noto Serif
// TC (Han, ~6 MB) stays out and loads lazily by unicode-range (kit assets/fonts/README.md).
describe('offline shell precache and the self-hosted Noto faces', () => {
  const out = mkdtempSync(join(tmpdir(), 'fia-shell-fonts-'));
  afterAll(() => rmSync(out, { recursive: true, force: true }));
  mkdirSync(join(out, 'assets'));
  for (const f of [
    'index.html',
    'assets/index-abc12345.css',
    'assets/noto-serif-latin-400-normal-AbCd1234.woff2',
    'assets/noto-serif-hebrew-hebrew-500-normal-Ef_-5678.woff2',
    'assets/noto-naskh-arabic-arabic-400-normal-Gh901234.woff2',
    'assets/noto-serif-tc-0-400-normal-Ij345678.woff2',
    'assets/noto-serif-tc-119-500-normal-Kl-90123.woff2',
  ])
    writeFileSync(join(out, f), f);
  const paths = shellEntries(out).map((e) => e.path);

  it('precaches the five non-Han Noto faces', () => {
    expect(paths).toContain('/assets/noto-serif-latin-400-normal-AbCd1234.woff2');
    expect(paths).toContain('/assets/noto-serif-hebrew-hebrew-500-normal-Ef_-5678.woff2');
    expect(paths).toContain('/assets/noto-naskh-arabic-arabic-400-normal-Gh901234.woff2');
  });

  it('keeps every Noto Serif TC subset out of the shell', () => {
    expect(paths.filter((p) => p.includes('noto-serif-tc'))).toEqual([]);
    expect(paths).toContain('/index.html');
    expect(paths).toContain('/assets/index-abc12345.css');
  });
});
