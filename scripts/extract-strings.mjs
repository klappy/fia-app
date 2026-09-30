#!/usr/bin/env node
// Generates src/i18n/en.json from the string-key tables in the cookbook's screen specs.
// Source: design/alpha-screens/*.md (24 specs) + README.md (s.common.*). Every table row
// shaped `| \`s.<screen>.<key>\` | English | ... |` is a string. ICU placeholders are kept.
// Usage: node scripts/extract-strings.mjs [path/to/design/alpha-screens]
// Default source: $FIA_COOKBOOK/design/alpha-screens or ../fia-app-cookbook/design/alpha-screens.
// When the source is unavailable, the committed en.json is left untouched (offline builds work).
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src =
  process.argv[2] ??
  (process.env.FIA_COOKBOOK
    ? join(process.env.FIA_COOKBOOK, 'design/alpha-screens')
    : resolve(root, '../fia-app-cookbook/design/alpha-screens'));
const out = resolve(root, 'src/i18n/en.json');

if (!existsSync(src)) {
  console.log(`strings: source ${src} not found; keeping ${out}`);
  process.exit(0);
}

const ROW = /^\|\s*`(s\.[a-z0-9.-]+)`\s*\|\s*(.*?)\s*\|/;
const unescape = (cell) =>
  cell
    .replace(/\\\|/g, '|')
    .replace(/^`(.*)`$/, '$1')
    .replace(/<br\s*\/?>/g, '\n')
    .trim();

const catalog = {};
const dupes = [];
let files = 0;
for (const name of readdirSync(src).sort()) {
  if (!name.endsWith('.md')) continue;
  files++;
  const text = readFileSync(join(src, name), 'utf8');
  for (const line of text.split('\n')) {
    const m = ROW.exec(line);
    if (!m) continue;
    const [, key, english] = m;
    const value = unescape(english);
    if (key in catalog && catalog[key] !== value) dupes.push(`${key} (${name})`);
    if (!(key in catalog)) catalog[key] = value;
  }
}

const sorted = Object.fromEntries(Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b)));
const doc = {
  $meta: {
    generated: 'scripts/extract-strings.mjs',
    source: 'fia-app-cookbook design/alpha-screens/*.md string tables',
    lang: 'eng',
    files,
    keys: Object.keys(sorted).length,
  },
  ...sorted,
};
writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
console.log(`strings: ${files} files, ${doc.$meta.keys} keys -> ${out}`);
if (dupes.length)
  console.warn(
    `strings: ${dupes.length} keys redefined with different English (first wins):\n  ${dupes.join('\n  ')}`,
  );
