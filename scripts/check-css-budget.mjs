#!/usr/bin/env node
// CSS budget gate (RULING 2026-10-02 ~20:05 ET: screens are compositions of kit + one shared app layer;
// per-screen CSS is layout only). Run in CI (ci.yml `check`) and locally with `npm run check:css`.
//
// Fails when:
//   1. a new stylesheet appears under src/ (outside src/vendor) that the budget does not list: a new
//      per-screen sheet is the drift this gate exists to stop; a shared rule belongs in
//      src/frame/frame.css;
//   2. a listed stylesheet grows past its budget (a ratchet: each file's ceiling is its size when the
//      budget was last written, so per-screen files can only shrink toward layout);
//   3. the total CSS lines or the total !important count grows past the budget.
// Prints the totals every run, against the eval's measure and the start of the shared-layer lift.
//
// After a lift that shrinks CSS, lower the ceilings: `node scripts/check-css-budget.mjs --write`
// (rewrites scripts/css-budget.json to today's sizes; the diff is the review). Raising a ceiling or
// adding a file is a hand edit of css-budget.json with a reason in the PR body.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const budgetPath = join(root, 'scripts/css-budget.json');
const SRC = join(root, 'src');

/** Every .css under src/, vendor excluded, as repo-relative posix paths. */
function cssFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (relative(SRC, p) === 'vendor') continue;
      out.push(...cssFiles(p));
    } else if (name.endsWith('.css')) out.push(relative(root, p).split('\\').join('/'));
  }
  return out.sort();
}

function measure(file) {
  const text = readFileSync(join(root, file), 'utf8');
  const lines = text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
  const important = (text.match(/!important/g) ?? []).length;
  return { lines, important };
}

const files = cssFiles(SRC);
const sizes = Object.fromEntries(files.map((f) => [f, measure(f)]));
const total = files.reduce((n, f) => n + sizes[f].lines, 0);
const important = files.reduce((n, f) => n + sizes[f].important, 0);
const isScreen = (f) => f.startsWith('src/screens/');
const screenLines = files.filter(isScreen).reduce((n, f) => n + sizes[f].lines, 0);

if (process.argv.includes('--write')) {
  const budget = {
    $comment:
      'Ceilings for scripts/check-css-budget.mjs. Lower with --write after a lift; raise or add only by hand, with a reason in the PR body.',
    total,
    important,
    files: Object.fromEntries(files.map((f) => [f, sizes[f].lines])),
  };
  writeFileSync(budgetPath, JSON.stringify(budget, null, 2) + '\n');
  console.log(
    `css-budget: wrote ${relative(root, budgetPath)} (${total} lines, ${important} !important)`,
  );
  process.exit(0);
}

const budget = JSON.parse(readFileSync(budgetPath, 'utf8'));
const errors = [];
for (const f of files) {
  const cap = budget.files[f];
  if (cap == null) {
    errors.push(
      isScreen(f)
        ? `${f}: new per-screen stylesheet. Per-screen CSS is layout only and lives in the existing files; shared rules go in src/frame/frame.css.`
        : `${f}: new stylesheet not in scripts/css-budget.json. Shared rules go in src/frame/frame.css.`,
    );
  } else if (sizes[f].lines > cap) {
    errors.push(`${f}: ${sizes[f].lines} lines, budget ${cap} (+${sizes[f].lines - cap}).`);
  }
}
if (total > budget.total) errors.push(`total: ${total} CSS lines, budget ${budget.total}.`);
if (important > budget.important)
  errors.push(`!important: ${important}, budget ${budget.important}.`);

console.log(
  `css-budget: ${total} CSS lines in ${files.length} files (budget ${budget.total}); ` +
    `${important} !important (budget ${budget.important}); per-screen files (src/screens) ${screenLines} lines.`,
);
console.log(
  '  reference: 4,488 lines / 221 !important at 73de38d (EVAL-2026-10-02-reskin-vs-rebuild); ' +
    '4,827 / 232 at 803a96b (v2/integration before the shared-layer lift).',
);
if (errors.length) {
  console.error(`css-budget: ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('css-budget: ok');
