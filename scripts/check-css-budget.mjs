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
//   3. the total CSS lines or the total !important count grows past the budget;
//   4. a per-screen stylesheet (src/screens/*.css) carries a visual declaration — colour, background,
//      border or radius, outline, shadow, font or type scale, line-height, letter-spacing, opacity,
//      blur/filter, text decoration or transform-case, fill/stroke, or a custom property (a token
//      re-point is a colour) — past the budget's `screenVisual` ceiling (0 since lift 2: per-screen CSS is
//      layout only; a face, tone or kit re-point is a class in src/frame/frame.css the screen composes);
//   5. the hand-written block of src/tokens/alpha.css (after "==== app overrides", where the S14–S17
//      screen blocks live) carries more visual declarations than its `alphaVisual` ceiling (custom
//      properties excluded there: that block is where the app's tokens are re-pointed). Lift 2 left it
//      the root, body and aurora ground only.
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

/** Properties that paint rather than place (RULING ~20:05 ET: per-screen CSS is layout only). */
const VISUAL =
  /^(?:-webkit-)?(?:color|background(?:-[a-z-]+)?|border(?:-[a-z-]+)?|outline(?:-[a-z-]+)?|box-shadow|text-shadow|font(?:-[a-z-]+)?|line-height|letter-spacing|word-spacing|opacity|backdrop-filter|filter|mix-blend-mode|text-decoration(?:-[a-z-]+)?|text-transform|fill|stroke(?:-[a-z-]+)?|accent-color|caret-color|--[a-z0-9-]+)$/;

/**
 * Every visual declaration in a stylesheet: { line, prop }. Comments are blanked (lines kept). `from`
 * starts the scan at a marker; `tokens: false` skips custom properties.
 */
function visualDeclarations(file, { from = '', tokens = true } = {}) {
  const full = readFileSync(join(root, file), 'utf8');
  const skip = from ? Math.max(0, full.indexOf(from)) : 0;
  const text = full.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const found = [];
  let depth = 0;
  let start = skip;
  for (let i = skip; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      depth++;
      start = i + 1;
    } else if (ch === '}' || (ch === ';' && depth > 0)) {
      const body = text.slice(start, i);
      const colon = body.indexOf(':');
      if (depth > 0 && colon > 0) {
        const prop = body.slice(0, colon).trim().toLowerCase();
        if (VISUAL.test(prop) && (tokens || !prop.startsWith('--'))) {
          const at = start + body.search(/\S/);
          found.push({ line: text.slice(0, at).split('\n').length, prop });
        }
      }
      if (ch === '}') depth--;
      start = i + 1;
    }
  }
  return found;
}
const ALPHA = 'src/tokens/alpha.css';
const ALPHA_FROM = '==== app overrides';
const alphaVisual = files.includes(ALPHA)
  ? visualDeclarations(ALPHA, { from: ALPHA_FROM, tokens: false }).map((d) => ({
      file: ALPHA,
      ...d,
    }))
  : [];
const screenVisual = files
  .filter(isScreen)
  .flatMap((f) => visualDeclarations(f).map((d) => ({ file: f, ...d })));

if (process.argv.includes('--write')) {
  const budget = {
    $comment:
      'Ceilings for scripts/check-css-budget.mjs. Lower with --write after a lift; raise or add only by hand, with a reason in the PR body.',
    total,
    important,
    screenVisual: screenVisual.length,
    alphaVisual: alphaVisual.length,
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
if (screenVisual.length > (budget.screenVisual ?? 0)) {
  for (const d of screenVisual)
    errors.push(
      `${d.file}:${d.line}: visual declaration '${d.prop}'. Per-screen CSS is layout only: compose a ` +
        'shared face, tone or part from src/frame/frame.css (or add one there).',
    );
  errors.push(
    `per-screen visual declarations: ${screenVisual.length}, budget ${budget.screenVisual ?? 0}.`,
  );
}
if (budget.alphaVisual != null && alphaVisual.length > budget.alphaVisual) {
  for (const d of alphaVisual)
    errors.push(`${d.file}:${d.line}: visual declaration '${d.prop}' in the hand-written block.`);
  errors.push(
    `${ALPHA} hand-written block: ${alphaVisual.length} visual declarations, budget ${budget.alphaVisual}. ` +
      'A screen block there is layout only: its faces and tones are src/frame/frame.css classes.',
  );
}

console.log(
  `css-budget: ${total} CSS lines in ${files.length} files (budget ${budget.total}); ` +
    `${important} !important (budget ${budget.important}); per-screen files (src/screens) ${screenLines} lines, ` +
    `${screenVisual.length} visual declarations (budget ${budget.screenVisual ?? 0}); ` +
    `alpha.css hand-written block ${alphaVisual.length} (budget ${budget.alphaVisual ?? '-'}).`,
);
console.log(
  '  reference: 4,488 lines / 221 !important at 73de38d (EVAL-2026-10-02-reskin-vs-rebuild); ' +
    '4,827 / 232 at 803a96b (v2/integration before the shared-layer lift); ' +
    '4,521 / 203, 143 per-screen and 153 alpha.css hand-written visual declarations at 3be02f0 ' +
    '(lift 1 merged, before lift 2).',
);
if (errors.length) {
  console.error(`css-budget: ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('css-budget: ok');
