#!/usr/bin/env node
// Batch: build every pack of one book for one or more languages, from the pericope ids the catalog lists
// (`data/catalog/<lang>.json` entries where book == <BOOK>). Packs already on disk are kept as they are
// (byte-identical) unless --force; run `npm run catalog` afterwards so tier sizes follow the packs (R-307).
//   node bin/build-book.mjs MRK eng spa [--force]
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildPack } from '../src/pericope.mjs';
import { DATA_ROOT } from '../src/lib.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const [book, ...langs] = args.filter((a) => !a.startsWith('--'));
if (!book || !langs.length) { console.error('usage: build-book.mjs <BOOK> <lang> [<lang>…] [--force]   e.g. build-book.mjs MRK eng spa'); process.exit(2); }

export async function bookPericopes(lang, usfm) {
  const doc = JSON.parse(await readFile(path.join(DATA_ROOT, 'catalog', `${lang}.json`), 'utf8'));
  return doc.entries.filter((e) => e.book === usfm).map((e) => e.pericope);
}

const summary = [];
let failed = 0;
for (const lang of langs) {
  const ids = await bookPericopes(lang, book);
  if (!ids.length) { console.error(`${lang}: no ${book} pericopes in the catalog`); failed++; continue; }
  let built = 0, kept = 0;
  for (const p of ids) {
    if (!force && existsSync(path.join(DATA_ROOT, 'packs', `${lang}.${p}`, 'manifest.json'))) { kept++; continue; }
    try { await buildPack(lang, p, { log: () => {} }); built++; }
    catch (err) { failed++; console.error(`${lang}.${p}: FAILED ${err.message}`); }
  }
  summary.push({ lang, book, pericopes: ids.length, built, kept });
  console.error(`${lang} ${book}: ${ids.length} pericopes, ${built} built, ${kept} kept`);
}
console.log(JSON.stringify(summary));
process.exit(failed ? 1 : 0);
