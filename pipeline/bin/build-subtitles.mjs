#!/usr/bin/env node
// BL4d: generate pericope subtitles (cookbook work/active/2026-10-02-fia-pericope-subtitles TICKET.md § 3–§ 5, § 8 BL4d).
// usage:
//   node bin/build-subtitles.mjs --dry-run                 no calls: plan, call count, projected cost, batch digest
//   node bin/build-subtitles.mjs --samples [--out FILE]    SAMPLES.md's 15 cases → SAMPLES-MODEL.json (needs ANTHROPIC_API_KEY)
//   node bin/build-subtitles.mjs --approve <digest>        full run: one batch under the § 5 caps (≤ 300 calls, ≤ 600K input tokens)
// Order: English, then the rung-1 languages, then rung 2. Cache: data/cache/subtitles/<key>.json; ledger: ledger.jsonl beside it.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gatherHeadings, loadHeadingSources } from '../src/headings.mjs';
import { DATA_ROOT, loadSources, stableJson } from '../src/lib.mjs';
import { CAPS, catalogTitles, EFFORT, EST_OUTPUT_TOKENS, loadGrounding, loadPrompts, planJobs, runJobs, SAMPLE_CASES, samplesDocument } from '../src/subtitles.mjs';
import { hasKey, KEY_ENV, TEXT_MODEL } from '../src/text-route.mjs';

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const dryRun = args.includes('--dry-run');
const samples = args.includes('--samples');
const approve = opt('--approve');
if (!dryRun && !samples && !approve) { console.error('usage: build-subtitles.mjs --dry-run | --samples [--out FILE] | --approve <digest>'); process.exit(2); }
if (!dryRun && !hasKey()) { console.error(`${KEY_ENV} is not set (host/CI secret; the captain sets it). Nothing was called.`); process.exit(2); }

const prompts = await loadPrompts();
const registry = await loadHeadingSources(); const sources = await loadSources();
const records = JSON.parse(await readFile(path.join(DATA_ROOT, 'rights', 'records.json'), 'utf8'));
const { byLang, fetched, held } = await gatherHeadings({ registry, sources });
if (held.length) console.log(`held sources (their headings are absent from every key): ${held.map((h) => h.id).join(', ')}`);
const revisions = Object.fromEntries(fetched.map((f) => [f.id, f.revision.value]));
const titles = await catalogTitles(Object.keys(registry.grounding));
const grounding = await loadGrounding({ registry, sources, records });
let jobs = planJobs({ byLang, titles, grounding, registry, prompts, revisions });
if (samples) { const want = new Set(SAMPLE_CASES); jobs = jobs.filter((j) => want.has(j.id)); }

const out = await runJobs(jobs, { dryRun, approve: samples ? true : approve, log: (m) => console.error(m) });
const p = out.plan;
const count = (f) => jobs.filter(f).length;
const langs = [...new Set(jobs.map((j) => j.lang))];
console.log(`subtitles ${dryRun ? 'dry run' : samples ? 'samples' : 'run'} · model ${TEXT_MODEL} · effort ${EFFORT} · prompts subtitle-v1 ${prompts.subtitle.sha256.slice(0, 8)} / translate-v1 ${prompts.translate.sha256.slice(0, 8)}`);
console.log(`entries: ${jobs.length} in ${langs.length} languages · rung 1 = ${count((j) => j.rung === 1)}, 1p = ${count((j) => j.rung === '1p')}, 2 = ${count((j) => j.rung === 2)}`);
console.log(`per language: ${langs.map((l) => `${l} ${count((j) => j.lang === l)}`).join(' · ')}`);
console.log(`cache hits ${p.hits} · prior attempts (never re-called) ${p.priorAttempts} · named absent at plan ${count((j) => j.absent)}`);
console.log(`calls needed: ${p.need} (subtitle ${count((j) => j.kind === 'subtitle')} · translation ${count((j) => j.kind === 'translation')} before cache)`);
console.log(`this batch (caps ≤ ${CAPS.calls} calls, ≤ ${CAPS.inputTokens} input tokens): ${p.batch} calls, ~${p.batchInputTokens} input tokens; next batches: ${p.deferred} calls`);
console.log(`projected, all calls: ~${p.projectedInputTokens} input + ~${p.projectedOutputTokens} output tokens (est. ${EST_OUTPUT_TOKENS}/call) = ~$${p.projectedCostUsd.toFixed(2)} at $${p.rate.input}/1K in, $${p.rate.output}/1K out`);
console.log(`batch digest: ${p.digest}`);
if (dryRun) process.exit(0);

console.log(`made ${out.calls} calls · ${out.inputTokens} in / ${out.outputTokens} out tokens · $${out.costUsd.toFixed(4)} · cache hits ${out.hits}`);
const reasons = {};
for (const a of out.absent) (reasons[a.reason] ??= []).push(a.id);
for (const [r, ids] of Object.entries(reasons)) console.log(`absent (${r}): ${ids.length}${ids.length <= 12 ? ` — ${ids.join(', ')}` : ''}`);
if (samples) {
  const file = path.resolve(opt('--out') ?? 'SAMPLES-MODEL.json');
  await writeFile(file, stableJson(samplesDocument(out, jobs)));
  console.log(`wrote ${file}`);
}
