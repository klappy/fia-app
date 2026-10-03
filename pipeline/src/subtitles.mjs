// BL4d: pericope subtitles — pick the rung per (pericope, lang), build the prompt inputs, key, cache, ledger, caps, and
// emit C-03 1.1.0 `subtitle` objects. Ticket: cookbook work/active/2026-10-02-fia-pericope-subtitles TICKET.md § 3
// (generation), § 4 (translation fallback), § 5 (contract, key, cache, spend discipline), § 8 row BL4d.
//
// Rules this module keeps:
// - Prompts are byte-for-byte copies of the unit's prompts/; their sha256 is checked at load (fail loud on mismatch).
// - The key holds content hashes, not file revisions: same inputs → same key; a changed heading changes only its
//   pericope's key (and the translations that hang off that English key).
// - Cache, never the store of record (RULING @d10f1fd): get(key) / put(key, entry). A hit makes no call.
// - A ledger row is written `uncertain` BEFORE each paid call; a key with any prior attempt is never re-called.
// - Caps per run: ≤ 300 calls and ≤ 600K input tokens; a batch runs only under an approved input digest.
// - Every call goes through text-route.mjs (BL4c) at effort 'low'; an answer from another model is refused.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { cleanInline, fetchSource, PERICOPES } from './headings.mjs';
import { DATA_ROOT, fetchPinned, LANGUAGE_INFO, PIPELINE_ROOT, sha256 } from './lib.mjs';
import { costUsd, RATE_USD_PER_1K, TEXT_MODEL, textRoute } from './text-route.mjs';

// ---- prompts (§ 3, § 4) ----------------------------------------------------------------------------------------------
export const PROMPT_DIR = path.join(PIPELINE_ROOT, 'prompts');
export const PROMPTS = Object.freeze({
  subtitle: Object.freeze({ file: 'subtitle-v1.txt', sha256: '34b544c421208d5def994f4691bd6f8989d3215872791cb84dc67ffae92ba5ec' }),
  translate: Object.freeze({ file: 'subtitle-translate-v1.txt', sha256: 'd885dc8382e1b90a1da86dfa29665888ef315c693f094064895475a7a7710fb7' }),
});

export class PromptShaError extends Error {
  constructor(message) { super(message); this.name = 'PromptShaError'; }
}

/** Load one prompt, check its sha256 against TICKET § 3/§ 4, split it into its SYSTEM and USER blocks. */
export async function loadPrompt(name, { dir = PROMPT_DIR, expected = PROMPTS[name]?.sha256 } = {}) {
  const spec = PROMPTS[name];
  if (!spec) throw new Error(`unknown prompt ${name}`);
  const bytes = await readFile(path.join(dir, spec.file));
  const got = sha256(bytes);
  if (got !== expected) throw new PromptShaError(`${spec.file}: sha256 ${got} does not match ${expected} (TICKET § 3/§ 4); copy the prompt byte for byte from the unit's prompts/`);
  const m = /^SYSTEM\n([\s\S]*?)\n+USER\n([\s\S]*?)\n*$/.exec(bytes.toString('utf8'));
  if (!m) throw new Error(`${spec.file}: no SYSTEM/USER blocks`);
  return { name, file: spec.file, sha256: got, system: m[1], user: m[2] };
}

export async function loadPrompts(opts) {
  return { subtitle: await loadPrompt('subtitle', opts), translate: await loadPrompt('translate', opts) };
}

/** Fill {UPPER_CASE} slots; an unfilled slot throws (a silent "{N}" would reach the model). */
export function fill(template, vars) {
  return template.replace(/\{([A-Z_]+)\}/g, (_, k) => {
    if (vars[k] === undefined || vars[k] === null) throw new Error(`prompt slot {${k}} has no value`);
    return String(vars[k]);
  });
}

// ---- caps and limits (§ 3, § 5) -------------------------------------------------------------------------------------
export const CAPS = Object.freeze({ calls: 300, inputTokens: 600_000 });
export const EFFORT = 'low';
export const MAX_OUTPUT_TOKENS = 4000;
/** Output tokens assumed per call for the dry-run projection (guess: JSON line + low-effort thinking). */
export const EST_OUTPUT_TOKENS = 200;
const HAN = new Set(['zhs', 'zht']);
export const limitsFor = (lang) => (HAN.has(lang) ? { maxWords: null, maxChars: 20 } : { maxWords: 10, maxChars: 60 });
/** Conservative input-token estimate: UTF-8 bytes / 3 (Latin ≈ 4 chars/token; Devanagari/Arabic/Han cost more per char). */
export const estimateTokens = (text) => Math.ceil(Buffer.byteLength(text, 'utf8') / 3);

// ---- verses -----------------------------------------------------------------------------------------------------------
const V = /^(\d+):(\d+)([ab]?)$/;
const parseV = (s) => { const m = V.exec(s); if (!m) throw new Error(`bad verse ${s}`); return [Number(m[1]), Number(m[2]), m[3]]; };
const ordOf = ([c, v, p]) => c * 1e6 + v * 10 + (p === 'b' ? 1 : 0);
export const ordVerse = (s) => ordOf(parseV(s));
const noPart = ([c, v]) => `${c}:${v}`;
/** RANGE as the prompt shows it: 1:1-13, 2:23-3:6, 6:1-6a, 6:6b-13. */
export const rangeLabel = (s, e) => `${s[0]}:${s[1]}${s[2]}-${s[0] === e[0] ? '' : `${e[0]}:`}${e[1]}${e[2]}`;
/** The same range for C-03 `verse` (its pattern has no a/b part). */
export const rangeVerse = (s, e) => `${s[0]}:${s[1]}-${s[0] === e[0] ? '' : `${e[0]}:`}${e[1]}`;

const NOT_TEXT = /^\\(s\d?|ms\d?|mr|sr|r|d|mt\d?|mte\d?|h|toc\d|id|ide|ip|is\d?|cl|rem|usfm|sts|imt\d?|cp|ca|va)\b/;
/** Verse texts of one USFM book: [{c, v, vEnd, text}] (a bridge \v 42-43 is one item covering both). */
export function verseTexts(usfm) {
  const raw = usfm.replace(/^﻿/, '').replace(/\\f .*?\\f\*/gs, '').replace(/\\x .*?\\x\*/gs, '');
  const body = raw.split('\n').map((l) => l.trim()).filter((l) => l && !NOT_TEXT.test(l)).join(' ');
  const out = []; let c = 0; let cur = null;
  for (const tok of body.split(/(\\c \d+|\\v \d+(?:-\d+)?)/)) {
    const cm = /^\\c (\d+)$/.exec(tok);
    if (cm) { c = Number(cm[1]); cur = null; continue; }
    const vm = /^\\v (\d+)(?:-(\d+))?$/.exec(tok);
    if (vm) { cur = { c, v: Number(vm[1]), vEnd: Number(vm[2] || vm[1]), text: '' }; out.push(cur); continue; }
    if (cur) cur.text += ' ' + tok;
  }
  for (const x of out) x.text = cleanInline(x.text).replace(/\s+/g, ' ').trim().normalize('NFC');
  return out.filter((x) => x.text);
}

const overlaps = (x, s, e) => x.c * 1e6 + x.vEnd * 10 + 1 >= ordOf([s[0], s[1], '']) && x.c * 1e6 + x.v * 10 <= ordOf([e[0], e[1], 'b']);
const verseLine = (x) => `${x.c}:${x.v}${x.vEnd !== x.v ? `-${x.vEnd}` : ''} ${x.text}`;
/** PASSAGE text for a range (a/b halves include the whole verse). */
export function passageText(verses, start, end) {
  return verses.filter((x) => overlaps(x, start, end)).map(verseLine).join('\n');
}
/** CONTEXT: the 4 verses before the range in the grounding edition (none before Mark 1:1). */
export function contextOf(verses, start, n = 4) {
  const before = verses.filter((x) => x.c * 1e6 + x.vEnd * 10 < ordOf([start[0], start[1], '']));
  const take = before.slice(-n);
  if (!take.length) return { range: 'none', text: '(none)' };
  const a = take[0]; const b = take.at(-1);
  return { range: rangeLabel([a.c, a.v, ''], [b.c, b.vEnd, '']), text: take.map(verseLine).join('\n') };
}

// ---- rights inputs (§ 5 licence rule) ---------------------------------------------------------------------------------
/** 'by-sa' | 'by' | null (CC0 / public domain) from a registry licence id or a C-13 licenseInfo string. */
export function licenceClass(s) {
  if (typeof s !== 'string') return null;
  if (/BY[- ]SA/i.test(s)) return 'by-sa';
  if (/CC[- ]BY(?![- ]?(SA|NC|ND))/i.test(s) || /licenses\/by\//.test(s)) return 'by';
  return null;
}
export function licenceOf(classes) {
  if (classes.includes('by-sa')) return { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' };
  if (classes.includes('by')) return { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };
  return null;
}
/** C-13 record id (name@7hex, taken from the revision) for one heading-sources.json entry. */
export function recordIdOf(src, revision) {
  if (src.kind === 'aquifer') return `${src.repo}@${(revision ?? src.freshness.commit).slice(0, 7)}`;
  if (src.kind === 'ebible') return `${src.ebibleId}@${(revision ?? src.freshness.sha256).slice(0, 7)}`;
  return `${src.id}@${(revision ?? src.freshness.commit).slice(0, 7)}`;
}

// ---- key (§ 5 "Living-source refresh") ------------------------------------------------------------------------------
const canonical = (x) => (Array.isArray(x) ? `[${x.map(canonical).join(',')}]`
  : x && typeof x === 'object' ? `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`
    : JSON.stringify(x ?? null));
/** sha256(canonical JSON {v:1, kind, lang, pericope, model, promptSha256, inputs sorted by (verse, sourceName), passageSha256, contextSha256, translatedFromKey}). */
export function subtitleKey({ kind, lang, pericope, model, promptSha256, inputs = [], passageSha256, contextSha256 = null, translatedFromKey = null }) {
  const ins = inputs.map(({ sourceName, verse, last, textSha256 }) => ({ sourceName, verse, last, textSha256 }))
    .sort((a, b) => ordVerse(a.verse) - ordVerse(b.verse) || (a.sourceName < b.sourceName ? -1 : a.sourceName > b.sourceName ? 1 : 0));
  return sha256(canonical({ v: 1, kind, lang, pericope, model, promptSha256, inputs: ins, passageSha256, contextSha256, translatedFromKey }));
}

// ---- rung and plan (§ 3, § 4) --------------------------------------------------------------------------------------
/** 1 = the language has headings in the pericope; '1p' = English with none (passage basis); 2 = translate the English. */
export const rungFor = (lang, headingCount) => (headingCount > 0 ? 1 : lang === 'eng' ? '1p' : 2);

/**
 * Build every job, in run order: English, then the rung-1 entries of the other languages, then rung 2.
 * @param {object} o
 * @param {object} o.byLang     BL4a gather output {lang: {pericope: [heading]}}
 * @param {object} o.titles     {lang: {pericope: catalog title}} — the catalog entries (Mark) per language
 * @param {object} o.grounding  {lang: {recordId, licence: 'by-sa'|'by'|null, verses, langName}}
 * @param {object} o.registry   heading-sources.json
 * @param {object} o.prompts    loadPrompts() result
 * @param {object} [o.revisions] {sourceId: fetched revision} (drift-aware record ids)
 */
export function planJobs({ byLang, titles, grounding, registry, prompts, revisions = {} }) {
  const srcById = new Map(registry.sources.map((s, i) => [s.id, { ...s, order: i }]));
  const langs = ['eng', ...Object.keys(titles).filter((l) => l !== 'eng')];
  const pIndex = new Map(PERICOPES.map((p, i) => [p.id, i]));
  const eng = new Map(); const phase = { 1: [], 2: [] }; const english = [];
  for (const lang of langs) {
    const g = grounding[lang];
    if (!g) throw new Error(`${lang}: no grounding edition (heading-sources.json grounding)`);
    const { maxWords, maxChars } = limitsFor(lang);
    const ids = Object.keys(titles[lang] || {}).filter((id) => pIndex.has(id)).sort((a, b) => pIndex.get(a) - pIndex.get(b));
    for (const id of ids) {
      const P = PERICOPES[pIndex.get(id)];
      const hs = [...(byLang[lang]?.[id] || [])].sort((a, b) => ordVerse(a.verse) - ordVerse(b.verse) || srcById.get(a.source).order - srcById.get(b.source).order);
      const rung = rungFor(lang, hs.length);
      const passage = passageText(g.verses, P.start, P.end);
      const passageSha256 = sha256(passage);
      const passageInput = { source: g.recordId, verse: rangeVerse(P.start, P.end), kind: 'passage', textSha256: passageSha256 };
      const common = { id: `${lang}.${id}`, lang, pericope: id, rung, maxWords, maxChars, passageSha256 };
      if (rung === 2) {
        const vars = { REF_LOCAL: titles[lang][id], LANG_NAME: LANGUAGE_INFO[lang]?.name ?? lang, LANG_CODE: lang, MAX_CHARS: maxChars, RANGE: rangeLabel(P.start, P.end), PASSAGE_LANG: g.langName, PASSAGE_TEXT: passage };
        phase[2].push({ ...common, kind: 'translation', prompt: prompts.translate, vars, inputs: [passageInput], licenceClasses: [g.licence] });
        continue;
      }
      const ctx = contextOf(g.verses, P.start);
      const lines = hs.map((h, i) => `h${i + 1} | ${h.verse}-${h.last}${h.past ? ' | past' : ''} | ${h.text}`);
      const vars = {
        REF_LOCAL: titles[lang][id], LANG_NAME: LANGUAGE_INFO[lang]?.name ?? lang, LANG_CODE: lang, MAX_WORDS: maxWords ?? maxChars, MAX_CHARS: maxChars,
        RANGE: rangeLabel(P.start, P.end), N: hs.length, HEADING_LINES: lines.join('\n') || '(none)', CONTEXT_RANGE: ctx.range, CONTEXT_TEXT: ctx.text, PASSAGE_TEXT: passage,
      };
      const recId = (h) => recordIdOf(srcById.get(h.source), revisions[h.source]);
      const inputs = [...hs.map((h) => ({ source: recId(h), verse: noPart(parseV(h.verse)), last: noPart(parseV(h.last)), text: h.text })), passageInput];
      const licenceClasses = [...hs.map((h) => licenceClass(srcById.get(h.source).licence)), g.licence];
      const key = subtitleKey({
        kind: 'subtitle', lang, pericope: id, model: TEXT_MODEL, promptSha256: prompts.subtitle.sha256,
        inputs: hs.map((h) => ({ sourceName: h.source, verse: h.verse, last: h.last, textSha256: sha256(h.text) })), passageSha256, contextSha256: sha256(ctx.text),
      });
      const job = { ...common, kind: 'subtitle', key, prompt: prompts.subtitle, vars, inputs, licenceClasses, headingCount: hs.length };
      if (lang === 'eng') { eng.set(id, job); english.push(job); } else phase[1].push(job);
    }
  }
  for (const job of phase[2]) {
    const en = eng.get(job.pericope);
    if (!en) { job.absent = 'no-english-entry'; continue; }
    job.engKey = en.key;
    job.licenceClasses = [...en.licenceClasses, ...job.licenceClasses];
    job.key = subtitleKey({ kind: 'translation', lang: job.lang, pericope: job.pericope, model: TEXT_MODEL, promptSha256: prompts.translate.sha256, passageSha256: job.passageSha256, translatedFromKey: en.key });
  }
  return [...english, ...phase[1], ...phase[2]];
}

// ---- cache and ledger -----------------------------------------------------------------------------------------------
export const CACHE_DIR = path.join(DATA_ROOT, 'cache', 'subtitles');
export const LEDGER_FILE = path.join(CACHE_DIR, 'ledger.jsonl');

/** Interim cache adapter: data/cache/subtitles/<key>.json holding {record, raw, usage}. */
export function fileCache(dir = CACHE_DIR) {
  const f = (key) => path.join(dir, `${key}.json`);
  return {
    get: (key) => (existsSync(f(key)) ? JSON.parse(readFileSync(f(key), 'utf8')) : null),
    put: (key, entry) => { mkdirSync(dir, { recursive: true }); writeFileSync(f(key), JSON.stringify(entry, null, 2) + '\n'); },
  };
}

/** Append-only JSONL ledger; append() is synchronous so the row is on disk before the call starts. */
export function fileLedger(file = LEDGER_FILE) {
  const rows = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const keys = new Set(rows.map((r) => r.key));
  return {
    rows,
    attempted: (key) => keys.has(key),
    append(row) { mkdirSync(path.dirname(file), { recursive: true }); appendFileSync(file, JSON.stringify(row) + '\n'); rows.push(row); keys.add(row.key); },
  };
}

// ---- answers -----------------------------------------------------------------------------------------------------
/** Parse and check one model answer; throws with a named reason. */
export function parseAnswer(job, text) {
  let a;
  try { a = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { throw new Error('not-json'); }
  const line = typeof a?.subtitle === 'string' ? a.subtitle.trim().normalize('NFC') : '';
  if (!line || /\n/.test(line)) throw new Error('no-line');
  if ([...line].length > job.maxChars) throw new Error(`over-${job.maxChars}-chars`);
  if (job.kind === 'subtitle' && job.maxWords && line.split(/\s+/).length > job.maxWords) throw new Error(`over-${job.maxWords}-words`);
  if (/[.。।۔]$/.test(line)) throw new Error('full-stop');
  if (job.kind === 'translation') return { subtitle: line };
  if (!['headings', 'passage'].includes(a.basis)) throw new Error('bad-basis');
  if (job.headingCount === 0 && a.basis !== 'passage') throw new Error('basis-not-passage');
  return { subtitle: line, basis: a.basis, used: Array.isArray(a.used) ? a.used : [] };
}

/** The C-03 1.1.0 `subtitle` object for one answered job (no `review` until BL4e). */
export function subtitleRecord(job, answer, { model, engRecord } = {}) {
  const rec = {
    text: answer.subtitle, lang: job.lang, ai: true, generator: job.kind,
    ...(job.kind === 'subtitle' ? { basis: answer.basis } : {}),
    model, promptSha256: job.prompt.sha256, key: job.key, licence: licenceOf(job.licenceClasses), inputs: job.inputs,
  };
  if (job.kind === 'translation') rec.translatedFrom = { lang: 'eng', key: job.engKey, text: engRecord.text };
  const fromKey = job.kind === 'translation' ? job.engKey : job.key;
  const fromId = job.kind === 'translation' ? `eng.${job.pericope}` : `${job.lang}.${job.pericope}`;
  rec.provenance = { status: 'generated', generator: job.kind, generatedFrom: `subtitle@${fromKey}:${fromId}` };
  return rec;
}

// ---- run ------------------------------------------------------------------------------------------------------------
const promptOf = (job, engText) => {
  const vars = job.kind === 'translation' ? { ...job.vars, EN_SUBTITLE: engText ?? '<the English subtitle>' } : job.vars;
  return { system: fill(job.prompt.system, vars), user: fill(job.prompt.user, vars) };
};

/** Digest of one batch: the keys it will call, in order. The full run calls only under this exact digest. */
export const batchDigest = (keys) => sha256(keys.join('\n'));

/**
 * Plan (and unless dryRun, run) one batch.
 * @returns {{records: Map, absent: Array, calls: number, inputTokens: number, outputTokens: number, costUsd: number, hits: number, plan: object, results: Array}}
 */
export async function runJobs(jobs, { client, env, cache = fileCache(), ledger = fileLedger(), caps = CAPS, dryRun = false, approve = null, log = () => {}, now = () => new Date().toISOString() } = {}) {
  const records = new Map(); const absent = []; const results = [];
  const cached = (key) => records.get(key) ?? cache.get(key)?.record ?? null;
  // plan: hits, prior attempts, and the calls that fit under the caps
  const need = []; let hits = 0; let projIn = 0; let projOut = 0; const batch = []; let batchIn = 0; const deferred = [];
  for (const job of jobs) {
    if (job.absent) continue;
    if (cache.get(job.key)) { hits++; continue; }
    if (ledger.attempted(job.key)) continue;
    const t = estimateTokens(Object.values(promptOf(job, job.kind === 'translation' ? cached(job.engKey)?.text : null)).join('\n'));
    need.push(job); projIn += t; projOut += EST_OUTPUT_TOKENS;
    // Keep run order (English first): once one job is deferred, every later job waits for the next batch too.
    if (!deferred.length && batch.length < caps.calls && batchIn + t <= caps.inputTokens) { batch.push(job); batchIn += t; } else deferred.push(job);
  }
  const digest = batchDigest(batch.map((j) => j.key));
  const plan = {
    jobs: jobs.length, hits, need: need.length, priorAttempts: jobs.filter((j) => !j.absent && !cache.get(j.key) && ledger.attempted(j.key)).length,
    batch: batch.length, batchInputTokens: batchIn, deferred: deferred.length, projectedInputTokens: projIn, projectedOutputTokens: projOut,
    projectedCostUsd: costUsd({ input_tokens: projIn, output_tokens: projOut }), rate: { ...RATE_USD_PER_1K }, digest,
  };
  const out = { records, absent, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, hits: 0, plan, results };
  if (dryRun) return out;
  if (approve !== true && approve !== digest) throw new Error(`batch digest ${digest} is not approved (run --dry-run, then pass --approve ${digest})`);
  const inBatch = new Set(batch.map((j) => j.key));
  for (const job of jobs) {
    if (job.absent) { absent.push({ id: job.id, reason: job.absent }); continue; }
    const hit = cache.get(job.key);
    if (hit) {
      // Same key = same content; an edit elsewhere in the book only refreshes the source revision stamps (TICKET § 5), no call.
      const record = { ...hit.record, inputs: job.inputs, licence: licenceOf(job.licenceClasses) };
      out.hits++; records.set(job.key, record); results.push({ job, record, raw: hit.raw, cached: true }); continue;
    }
    if (ledger.attempted(job.key)) { absent.push({ id: job.id, reason: 'prior-attempt' }); continue; }
    if (!inBatch.has(job.key)) { absent.push({ id: job.id, reason: 'cap-next-batch' }); continue; }
    const engRecord = job.kind === 'translation' ? cached(job.engKey) : null;
    if (job.kind === 'translation' && !engRecord) { absent.push({ id: job.id, reason: 'no-english' }); continue; }
    const p = promptOf(job, engRecord?.text);
    const est = estimateTokens(`${p.system}\n${p.user}`);
    if (out.calls >= caps.calls || out.inputTokens + est > caps.inputTokens) { absent.push({ id: job.id, reason: 'cap' }); log(`cap: stop before ${job.id}`); continue; }
    ledger.append({ at: now(), key: job.key, id: job.id, kind: job.kind, status: 'uncertain', model: TEXT_MODEL, promptSha256: job.prompt.sha256, digest });
    out.calls++;
    let res;
    try {
      res = await textRoute({ system: p.system, prompt: p.user, effort: EFFORT, maxTokens: MAX_OUTPUT_TOKENS, client, env });
    } catch (err) {
      out.inputTokens += err.usage?.input_tokens ?? 0; out.outputTokens += err.usage?.output_tokens ?? 0; out.costUsd += costUsd(err.usage);
      ledger.append({ at: now(), key: job.key, id: job.id, status: 'failed', code: err.code ?? 'error', usage: err.usage ?? null });
      absent.push({ id: job.id, reason: `call-${err.code ?? 'error'}` }); results.push({ job, error: err.code ?? err.message });
      continue;
    }
    out.inputTokens += res.usage?.input_tokens ?? 0; out.outputTokens += res.usage?.output_tokens ?? 0; out.costUsd += res.costUsd;
    let answer;
    try {
      if (res.model !== TEXT_MODEL) throw new Error(`model-${res.model}`);
      answer = parseAnswer(job, res.text);
    } catch (err) {
      ledger.append({ at: now(), key: job.key, id: job.id, status: 'rejected', reason: err.message, usage: res.usage, costUsd: res.costUsd });
      absent.push({ id: job.id, reason: `rejected-${err.message}` }); results.push({ job, raw: res.text, model: res.model, error: err.message });
      continue;
    }
    const record = subtitleRecord(job, answer, { model: res.model, engRecord });
    cache.put(job.key, { record, raw: res.text, usage: res.usage });
    ledger.append({ at: now(), key: job.key, id: job.id, status: 'ok', usage: res.usage, costUsd: res.costUsd });
    records.set(job.key, record); results.push({ job, record, raw: res.text, model: res.model });
  }
  return out;
}

// ---- samples (SAMPLES.md "Model run", BL4d gate) -------------------------------------------------------------------
export const SAMPLE_CASES = Object.freeze([
  ...['MRK-1-1-13', 'MRK-2-23-3-6', 'MRK-5-21-34', 'MRK-7-9-13', 'MRK-8-31-9-1', 'MRK-11-12-26', 'MRK-14-43-52', 'MRK-16-1-8'].map((p) => `eng.${p}`),
  ...['MRK-1-1-13', 'MRK-5-21-34', 'MRK-16-1-8'].map((p) => `spa.${p}`),
  'zhs.MRK-1-1-13',
  ...['MRK-1-1-13', 'MRK-7-9-13', 'MRK-16-1-8'].map((p) => `rus.${p}`),
]);

/** SAMPLES-MODEL.json body: raw JSON per case with model and promptSha256. */
export function samplesDocument(out, jobs) {
  const byId = new Map(out.results.map((r) => [r.job.id, r]));
  const absent = new Map(out.absent.map((a) => [a.id, a.reason]));
  return {
    schemaVersion: 1, unit: 'cookbook work/active/2026-10-02-fia-pericope-subtitles', model: TEXT_MODEL, effort: EFFORT,
    prompts: Object.fromEntries(Object.entries(PROMPTS).map(([k, v]) => [v.file, v.sha256])),
    cases: jobs.map((job) => {
      const r = byId.get(job.id);
      return {
        id: job.id, lang: job.lang, pericope: job.pericope, kind: job.kind, rung: job.rung, key: job.key,
        model: r?.model ?? r?.record?.model ?? null, promptSha256: job.prompt.sha256, raw: r?.raw ?? null,
        ...(r?.record ? { subtitle: r.record.text } : {}), ...(r?.error || absent.get(job.id) ? { absent: r?.error ?? absent.get(job.id) } : {}),
      };
    }),
    calls: out.calls, inputTokens: out.inputTokens, outputTokens: out.outputTokens, costUsd: Number(out.costUsd.toFixed(4)),
  };
}

// ---- loading (network; used by bin/build-subtitles.mjs) -------------------------------------------------------------
/** {lang: {pericope: title}} for the Mark entries of each language's catalog. */
export async function catalogTitles(langs, dataRoot = DATA_ROOT) {
  const out = {};
  for (const lang of langs) {
    const f = path.join(dataRoot, 'catalog', `${lang}.json`);
    out[lang] = existsSync(f) ? Object.fromEntries(JSON.parse(await readFile(f, 'utf8')).entries.filter((e) => e.book === 'MRK').map((e) => [e.pericope, e.title])) : {};
  }
  return out;
}

/** Fetch each language's grounding edition (§ 3 table) → {lang: {recordId, licence, verses, langName}}. Only its sha256 enters a record. */
export async function loadGrounding({ registry, sources, records }) {
  const byId = new Map(registry.sources.map((s) => [s.id, s]));
  const recById = new Map(records.map((r) => [r.id, r]));
  const engSource = registry.grounding.eng?.source;
  const out = {};
  for (const [lang, g] of Object.entries(registry.grounding)) {
    const src = byId.get(g.source);
    let usfm; let recordId;
    if (g.kind === 'ebible') {
      const got = await fetchSource(src, sources);
      usfm = got.usfm; recordId = recordIdOf(src, got.revision.value);
    } else {
      usfm = (await fetchPinned(sources, g.repo, g.commit, g.path)).bytes.toString('utf8');
      recordId = `${g.repo}@${g.commit.slice(0, 7)}`;
    }
    const licence = src ? licenceClass(src.licence) : licenceClass(recById.get(recordId)?.licenseInfo);
    if (!src && !recById.has(recordId)) throw new Error(`${lang}: grounding ${recordId} has no C-13 record and no registry licence`);
    const langName = g.source === engSource && lang !== 'eng' ? LANGUAGE_INFO.eng.name : LANGUAGE_INFO[lang]?.name ?? lang;
    out[lang] = { source: g.source, recordId, licence, verses: verseTexts(usfm), langName };
  }
  return out;
}
