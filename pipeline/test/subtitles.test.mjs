// BL4d (cookbook work/active/2026-10-02-fia-pericope-subtitles § 3–§ 5): subtitle generator with a mocked client — no key,
// no network. Rung choice, key stability, cache hit = 0 calls, cap stop, ledger before call, stop_reason guard,
// C-03 1.1.0 validity, prompt sha mismatch fails loud.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { PIPELINE_ROOT, sha256 } from '../src/lib.mjs';
import { ACCEPTED_STOP, TEXT_MODEL, textRoute } from '../src/text-route.mjs';
import {
  batchDigest, fileCache, fileLedger, loadPrompt, loadPrompts, planJobs, PROMPT_DIR, PROMPTS, PromptShaError, rungFor, runJobs, samplesDocument, SAMPLE_CASES, subtitleKey, verseTexts,
} from '../src/subtitles.mjs';

const prompts = await loadPrompts();
const tmp = () => mkdtempSync(path.join(tmpdir(), 'bl4d-'));
const clone = (x) => JSON.parse(JSON.stringify(x));

const registry = {
  sources: [
    { id: 'BSB', lang: 'eng', kind: 'aquifer', repo: 'BereanStandardBible', freshness: { commit: '87858d1e28ab728249d9fb50667170c194c6b013' }, licence: 'CC0-1.0' },
    { id: 'TCENT', lang: 'eng', kind: 'ebible', ebibleId: 'engtcent', freshness: { sha256: '13ef9e47'.padEnd(64, '0') }, licence: 'CC-BY-4.0' },
    { id: 'PEV', lang: 'eng', kind: 'ebible', ebibleId: 'engPEV', freshness: { sha256: '79f49ed1'.padEnd(64, '0') }, licence: 'CC-BY-SA-4.0' },
    { id: 'OEB', lang: 'eng', kind: 'git', freshness: { commit: '1965127'.padEnd(40, '0') }, licence: 'CC0-1.0' },
    { id: 'spaonbv', lang: 'spa', kind: 'ebible', ebibleId: 'spaonbv', freshness: { sha256: '8f8e1027'.padEnd(64, '0') }, licence: 'CC-BY-SA-4.0' },
  ],
};
const usfm = ['\\id MRK', '\\c 1', '\\s1 The Mission of John', '\\p', ...Array.from({ length: 20 }, (_, i) => `\\v ${i + 1} Verse one-${i + 1} text.`), '\\c 7', '\\p', ...Array.from({ length: 13 }, (_, i) => `\\v ${i + 1} Verse seven-${i + 1}.`)].join('\n');
const verses = verseTexts(usfm);
const grounding = {
  eng: { recordId: 'BereanStandardBible@87858d1', licence: null, verses, langName: 'English' },
  spa: { recordId: 'ReinaValera1909@84a0713', licence: null, verses, langName: 'Spanish' },
  rus: { recordId: 'RussianSynodalBible@1e33b99', licence: null, verses, langName: 'Russian' },
};
const titles = {
  eng: { 'MRK-1-1-13': 'Mark 1:1–13', 'MRK-1-14-20': 'Mark 1:14–20', 'MRK-7-9-13': 'Mark 7:9–13' },
  spa: { 'MRK-1-1-13': 'Marcos 1:1–13', 'MRK-1-14-20': 'Marcos 1:14–20' },
  rus: { 'MRK-1-1-13': 'Марка 1:1–13' },
};
const H = (source, verse, last, text, past = false) => ({ source, verse, last, text, past, marker: 's1' });
const byLang = {
  eng: {
    'MRK-1-1-13': [H('BSB', '1:1', '1:11', 'The Mission of John the Baptist'), H('TCENT', '1:9', '1:11', 'The Baptism of Jesus'), H('PEV', '1:12', '1:13', 'Satan tested Jesus'), H('BSB', '1:12', '1:15', 'The Temptation and Preaching of Jesus', true)],
    'MRK-1-14-20': [H('OEB', '1:14', '1:20', 'Jesus calls fishermen')],
    'MRK-7-9-13': [],
  },
  spa: { 'MRK-1-1-13': [H('spaonbv', '1:1', '1:8', 'Juan el Bautista prepara el camino')], 'MRK-1-14-20': [] },
};
const plan = (over = {}) => planJobs({ byLang, titles, grounding, registry, prompts, ...over });

/** Mocked client: answers by prompt kind; records every call and lets a test inspect state at call time. */
function mockClient({ onCall, reply } = {}) {
  const calls = [];
  return {
    calls,
    messages: {
      async create(params) {
        calls.push(params);
        onCall?.(params);
        const translate = params.system.startsWith('You translate');
        const empty = /HEADINGS \(0 lines/.test(params.messages[0].content);
        const text = translate ? '{"subtitle": "Перевод строки"}' : JSON.stringify({ subtitle: 'John prepares the way; Jesus is baptized', basis: empty ? 'passage' : 'headings', used: ['h1'] });
        return { model: TEXT_MODEL, stop_reason: 'end_turn', usage: { input_tokens: 1200, output_tokens: 80 }, content: [{ type: 'text', text }], ...reply?.(params) };
      },
    },
  };
}
const store = () => { const d = tmp(); return { dir: d, cache: fileCache(path.join(d, 'cache')), ledger: fileLedger(path.join(d, 'cache', 'ledger.jsonl')) }; };

test('prompts are the unit\'s bytes: sha256 matches TICKET § 3/§ 4 and the slots fill', async () => {
  for (const { file, sha256: want } of Object.values(PROMPTS)) assert.equal(sha256(readFileSync(path.join(PROMPT_DIR, file))), want, file);
  assert.equal(prompts.subtitle.sha256, '34b544c421208d5def994f4691bd6f8989d3215872791cb84dc67ffae92ba5ec');
  assert.equal(prompts.translate.sha256, 'd885dc8382e1b90a1da86dfa29665888ef315c693f094064895475a7a7710fb7');
  assert.match(prompts.subtitle.system, /^You write one short subtitle/);
  assert.match(prompts.subtitle.user, /^REFERENCE: \{REF_LOCAL\}/);
});

test('prompt sha mismatch fails loud', async () => {
  const d = tmp();
  for (const { file } of Object.values(PROMPTS)) copyFileSync(path.join(PROMPT_DIR, file), path.join(d, file));
  writeFileSync(path.join(d, PROMPTS.subtitle.file), readFileSync(path.join(d, PROMPTS.subtitle.file), 'utf8').replace('at most', 'at most  '));
  await assert.rejects(loadPrompt('subtitle', { dir: d }), (e) => e instanceof PromptShaError && /does not match 34b544c4/.test(e.message));
  await assert.rejects(loadPrompt('translate', { expected: 'f'.repeat(64) }), PromptShaError);
  await assert.doesNotReject(loadPrompt('translate', { dir: d }));
});

test('rung choice: headings → 1; English with none → 1p (passage); others with none → 2 (translate the English)', () => {
  assert.equal(rungFor('eng', 3), 1); assert.equal(rungFor('eng', 0), '1p'); assert.equal(rungFor('spa', 1), 1); assert.equal(rungFor('spa', 0), 2); assert.equal(rungFor('rus', 0), 2);
  const jobs = plan();
  const by = Object.fromEntries(jobs.map((j) => [j.id, j]));
  assert.deepEqual(jobs.map((j) => j.id), ['eng.MRK-1-1-13', 'eng.MRK-1-14-20', 'eng.MRK-7-9-13', 'spa.MRK-1-1-13', 'spa.MRK-1-14-20', 'rus.MRK-1-1-13'], 'English, then rung 1, then rung 2');
  assert.equal(by['eng.MRK-7-9-13'].rung, '1p'); assert.equal(by['eng.MRK-7-9-13'].vars.HEADING_LINES, '(none)');
  assert.equal(by['spa.MRK-1-14-20'].kind, 'translation'); assert.equal(by['spa.MRK-1-14-20'].engKey, by['eng.MRK-1-14-20'].key);
  assert.equal(by['rus.MRK-1-1-13'].rung, 2);
  const e = by['eng.MRK-1-1-13'];
  assert.equal(e.vars.N, 4);
  assert.equal(e.vars.HEADING_LINES.split('\n')[0], 'h1 | 1:1-1:11 | The Mission of John the Baptist');
  assert.match(e.vars.HEADING_LINES, /h3 \| 1:12-1:15 \| past \| The Temptation and Preaching of Jesus\nh4 \| 1:12-1:13 \| Satan tested Jesus$/);
  assert.equal(e.vars.CONTEXT_TEXT, '(none)', 'no CONTEXT before Mark 1:1');
  assert.equal(e.vars.MAX_WORDS, 10); assert.equal(e.vars.MAX_CHARS, 60);
  assert.doesNotMatch(Object.values(e.vars).join('\n'), /BSB|TCENT|PEV|Berean/, 'Bible names are withheld from the prompt');
  assert.match(by['eng.MRK-1-14-20'].vars.CONTEXT_TEXT, /^1:10 .*\n1:11 .*\n1:12 .*\n1:13 /);
});

test('key stability: same inputs → same key; a changed heading changes only that pericope and its translations', () => {
  const a = plan(); const b = plan();
  assert.deepEqual(a.map((j) => j.key), b.map((j) => j.key));
  for (const j of a) assert.match(j.key, /^[a-f0-9]{64}$/);
  const edited = clone(byLang); edited.eng['MRK-1-14-20'][0].text = 'Jesus calls four fishermen';
  const c = plan({ byLang: edited });
  const changed = a.filter((j, i) => j.key !== c[i].key).map((j) => j.id);
  assert.deepEqual(changed, ['eng.MRK-1-14-20', 'spa.MRK-1-14-20']);
  // a revision bump with the same content (an edit elsewhere in the book) changes no key
  const d = plan({ revisions: { BSB: 'abcdef1'.padEnd(40, '0') } });
  assert.deepEqual(d.map((j) => j.key), a.map((j) => j.key));
  assert.equal(d[0].inputs[0].source, 'BereanStandardBible@abcdef1', 'only the revision stamp moves');
  // input order does not matter; model and prompt are in the key
  const base = { kind: 'subtitle', lang: 'eng', pericope: 'P', model: 'm', promptSha256: 'p', passageSha256: 's', inputs: [{ sourceName: 'A', verse: '1:2', last: '1:3', textSha256: 'x' }, { sourceName: 'B', verse: '1:1', last: '1:3', textSha256: 'y' }] };
  assert.equal(subtitleKey(base), subtitleKey({ ...base, inputs: [...base.inputs].reverse() }));
  assert.notEqual(subtitleKey(base), subtitleKey({ ...base, model: 'm2' }));
  assert.notEqual(subtitleKey(base), subtitleKey({ ...base, promptSha256: 'p2' }));
});

test('ledger row is written uncertain BEFORE each call; cache hit on re-run = 0 calls', async () => {
  const s = store(); const jobs = plan();
  const ledgerFile = path.join(s.dir, 'cache', 'ledger.jsonl');
  const client = mockClient({
    onCall: () => {
      const rows = readFileSync(ledgerFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      const last = rows.at(-1);
      assert.equal(last.status, 'uncertain', 'the row on disk at call time is the uncertain one');
      assert.equal(last.model, TEXT_MODEL);
    },
  });
  const first = await runJobs(jobs, { client, cache: s.cache, ledger: s.ledger, approve: true });
  assert.equal(first.calls, 6); assert.equal(client.calls.length, 6); assert.equal(first.absent.length, 0);
  for (const p of client.calls) { assert.equal(p.output_config.effort, 'low'); assert.equal(p.model, TEXT_MODEL); }
  const rows = readFileSync(ledgerFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(rows.map((r) => r.status), Array(6).fill(['uncertain', 'ok']).flat());
  // translation prompt carries the English line that was just made
  assert.match(client.calls[4].messages[0].content, /ENGLISH: John prepares the way; Jesus is baptized/);
  const again = mockClient();
  const second = await runJobs(plan(), { client: again, cache: fileCache(path.join(s.dir, 'cache')), ledger: fileLedger(ledgerFile), approve: true });
  assert.equal(again.calls.length, 0); assert.equal(second.calls, 0); assert.equal(second.hits, 6); assert.equal(second.plan.need, 0);
});

test('a revision bump re-run makes 0 calls and the emitted record carries the new source stamp (TICKET § 5)', async () => {
  const s = store();
  await runJobs(plan(), { client: mockClient(), cache: s.cache, ledger: s.ledger, approve: true });
  const bumped = plan({ revisions: { BSB: 'abcdef1'.padEnd(40, '0') } });
  const client = mockClient();
  const out = await runJobs(bumped, { client, cache: s.cache, ledger: s.ledger, approve: true });
  assert.equal(client.calls.length, 0); assert.equal(out.calls, 0); assert.equal(out.hits, 6);
  const eng = out.records.get(bumped[0].key);
  assert.deepEqual(eng.inputs.map((i) => i.source), ['BereanStandardBible@abcdef1', 'engtcent@13ef9e4', 'BereanStandardBible@abcdef1', 'engPEV@79f49ed', 'BereanStandardBible@87858d1']);
  assert.deepEqual(eng.inputs, bumped[0].inputs);
  assert.deepEqual(eng.licence, { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' });
  assert.equal(s.cache.get(bumped[0].key).record.inputs[0].source, 'BereanStandardBible@87858d1', 'the cache entry is not rewritten');
});

test('cap stop: no call past the call cap or the input-token cap; the rest is named, not dropped', async () => {
  const s = store(); const client = mockClient();
  const out = await runJobs(plan(), { client, cache: s.cache, ledger: s.ledger, caps: { calls: 2, inputTokens: 600_000 }, approve: true });
  assert.equal(client.calls.length, 2); assert.equal(out.plan.batch, 2); assert.equal(out.plan.deferred, 4);
  assert.deepEqual(out.absent.map((a) => a.reason), Array(4).fill('cap-next-batch'));
  const t = store(); const c2 = mockClient();
  const out2 = await runJobs(plan(), { client: c2, cache: t.cache, ledger: t.ledger, caps: { calls: 300, inputTokens: 10 }, approve: true });
  assert.equal(c2.calls.length, 0); assert.equal(out2.absent.length, 6);
});

test('a batch runs only under its approved digest; a key with a prior attempt is never re-called', async () => {
  const s = store(); const jobs = plan();
  const dry = await runJobs(jobs, { client: mockClient(), cache: s.cache, ledger: s.ledger, dryRun: true });
  assert.equal(dry.calls, 0); assert.equal(dry.plan.need, 6); assert.equal(dry.plan.digest, batchDigest(jobs.map((j) => j.key)));
  assert.ok(dry.plan.projectedCostUsd > 0);
  await assert.rejects(runJobs(jobs, { client: mockClient(), cache: s.cache, ledger: s.ledger, approve: 'f'.repeat(64) }), /not approved/);
  s.ledger.append({ key: jobs[1].key, status: 'uncertain' });
  const client = mockClient();
  const out = await runJobs(jobs, { client, cache: s.cache, ledger: s.ledger, approve: true });
  assert.equal(client.calls.length, 4);
  assert.deepEqual(out.absent, [{ id: 'eng.MRK-1-14-20', reason: 'prior-attempt' }, { id: 'spa.MRK-1-14-20', reason: 'no-english' }]);
});

test('stop_reason guard: only end_turn/stop_sequence leave the text route; anything else is never cached', async () => {
  assert.deepEqual([...ACCEPTED_STOP].sort(), ['end_turn', 'stop_sequence']);
  const one = (stop) => ({ messages: { create: async () => ({ model: TEXT_MODEL, stop_reason: stop, usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: '{"subtitle":"x"}' }] }) } });
  assert.equal((await textRoute({ prompt: 'x', client: one('stop_sequence') })).text, '{"subtitle":"x"}');
  for (const stop of ['pause_turn', 'tool_use', undefined]) await assert.rejects(textRoute({ prompt: 'x', client: one(stop) }), (e) => e.code === 'bad-stop', String(stop));
  const s = store(); const jobs = plan().slice(0, 1);
  const out = await runJobs(jobs, { client: mockClient({ reply: () => ({ stop_reason: 'max_tokens' }) }), cache: s.cache, ledger: s.ledger, approve: true });
  assert.deepEqual(out.absent, [{ id: 'eng.MRK-1-1-13', reason: 'call-max-tokens' }]);
  assert.equal(s.cache.get(jobs[0].key), null);
  assert.deepEqual(s.ledger.rows.map((r) => r.status), ['uncertain', 'failed']);
  const t = store();
  const wrong = await runJobs(jobs, { client: mockClient({ reply: () => ({ model: 'other-model' }) }), cache: t.cache, ledger: t.ledger, approve: true });
  assert.match(wrong.absent[0].reason, /^rejected-model-other-model/);
  const u = store();
  const long = await runJobs(jobs, { client: mockClient({ reply: () => ({ content: [{ type: 'text', text: '{"subtitle":"one two three four five six seven eight nine ten eleven","basis":"headings"}' }] }) }), cache: u.cache, ledger: u.ledger, approve: true });
  assert.equal(long.absent[0].reason, 'rejected-over-10-words');
});

test('emitted subtitles are C-03 1.1.0: rung 1, 1p and 2 validate inside a catalog entry; licence rule holds', async () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true }); addFormats(ajv);
  const dir = path.join(PIPELINE_ROOT, '..', 'contracts');
  for (const f of await readdir(dir)) if (f.endsWith('.schema.json')) ajv.addSchema(JSON.parse(await readFile(path.join(dir, f), 'utf8')));
  const validate = ajv.getSchema('https://fia.klappy.dev/contracts/c03-catalog-manifest.schema.json');
  const example = JSON.parse(await readFile(path.join(dir, 'c03-catalog-manifest.schema.json'), 'utf8')).examples[0];
  const s = store();
  const out = await runJobs(plan(), { client: mockClient(), cache: s.cache, ledger: s.ledger, approve: true });
  const recs = [...out.records.values()];
  assert.equal(recs.length, 6);
  for (const rec of recs) {
    const m = clone(example); m.entries[0].subtitle = rec;
    assert.ok(validate(m), `${rec.lang} ${rec.generator}: ${JSON.stringify(validate.errors)}`);
  }
  const eng = recs.find((r) => r.lang === 'eng' && r.inputs.length === 5);
  assert.deepEqual(eng.licence, { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' }, 'PEV is BY-SA');
  assert.deepEqual(eng.inputs.map((i) => i.source), ['BereanStandardBible@87858d1', 'engtcent@13ef9e4', 'BereanStandardBible@87858d1', 'engPEV@79f49ed', 'BereanStandardBible@87858d1'], 'sorted by verse, then registry order');
  assert.deepEqual(eng.inputs.at(-1), { source: 'BereanStandardBible@87858d1', verse: '1:1-13', kind: 'passage', textSha256: eng.inputs.at(-1).textSha256 });
  assert.equal(recs.find((r) => r.lang === 'eng' && r.basis === 'passage').licence, null, 'BSB passage alone is CC0/PD');
  const oeb = recs.find((r) => r.lang === 'eng' && r.inputs[0]?.source.startsWith('OEB@'));
  assert.equal(oeb.licence, null);
  const rus = recs.find((r) => r.lang === 'rus');
  assert.equal(rus.generator, 'translation'); assert.equal(rus.basis, undefined);
  assert.deepEqual(rus.translatedFrom, { lang: 'eng', key: eng.key, text: eng.text });
  assert.equal(rus.provenance.generatedFrom, `subtitle@${eng.key}:eng.MRK-1-1-13`);
  assert.deepEqual(rus.licence, eng.licence, 'rung 2 licence resolves through the English record');
});

test('samples: the 15 SAMPLES.md cases, raw JSON per case with model and promptSha256', async () => {
  assert.equal(SAMPLE_CASES.length, 15);
  const s = store(); const jobs = plan().filter((j) => ['eng.MRK-1-1-13', 'rus.MRK-1-1-13'].includes(j.id));
  const out = await runJobs(jobs, { client: mockClient(), cache: s.cache, ledger: s.ledger, approve: true });
  const doc = samplesDocument(out, jobs);
  assert.equal(doc.model, TEXT_MODEL);
  assert.deepEqual(doc.cases.map((c) => [c.id, c.model, c.promptSha256]), [['eng.MRK-1-1-13', TEXT_MODEL, PROMPTS.subtitle.sha256], ['rus.MRK-1-1-13', TEXT_MODEL, PROMPTS.translate.sha256]]);
  assert.equal(JSON.parse(doc.cases[0].raw).basis, 'headings');
});

test('no key and no client: the generator never reaches the network', async () => {
  const s = store(); mkdirSync(s.dir, { recursive: true });
  const out = await runJobs(plan().slice(0, 1), { env: {}, cache: s.cache, ledger: s.ledger, approve: true });
  assert.deepEqual(out.absent, [{ id: 'eng.MRK-1-1-13', reason: 'call-no-key' }]);
});
