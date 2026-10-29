#!/usr/bin/env node
// Q18 CLI evaluation adapter: case file → requests → transport → scorer-shaped decisions file.
// node server/fia/preparation/association-question/cli.mjs --cases <file> --transport recorded|none
//   [--responses <recorded file>] [--only <caseId,...>] --out <file>
// Output is a PR289 decisions file that scripts/association-eval/score.mjs reads unchanged.
// Recorded-response output is a PIPELINE TEST, never a measure of Jev accuracy.
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {canonical, sha256} from '../jev/adapter.mjs';
import {buildRequest, fixedIdentity} from './request.mjs';
import {normalizeOutput, provenanceFor, AUTHORITY} from './normalize.mjs';
import {createRecordedTransport, createNoTransport, TransportError} from './transports.mjs';
import {createJevNoulTransport, createRecordedJevWire} from './jev-noul.mjs';

// PR289 score.mjs DECISIONS_SCHEMA, exactly.
export const DECISIONS_SCHEMA = 'fia-association-eval-decisions@1';
export const PRODUCER_ID = 'fia-association-question-adapter@1';
export const REQUESTS_SCHEMA = 'fia-association-question-requests@1';
export const RECORDED_LABEL = 'pipeline-test: recorded responses; not a measure of Jev accuracy';
export const WIRE_LABEL = 'wire-test: recorded documented-wire fixtures; not a measure of Jev quality';

// Case files are PR289 scripts/association-eval/inputs.json exactly: {schema: 'fia-association-eval@1', kind: 'inputs', cases: [...]}.
export function caseInputs(file) {
  if (file?.schema !== 'fia-association-eval@1' || file?.kind !== 'inputs' || !Array.isArray(file.cases) || !file.cases.length) throw new TransportError('cases-file-invalid');
  return file.cases;
}

/** Keeps only the named case ids, in file order (for runs over a chosen subset such as tuning cases). */
export function selectCases(file, ids) {
  if (!ids) return file;
  const want = new Set(ids), cases = file.cases.filter(c => want.has(c.caseId));
  if (cases.length !== want.size) throw new TransportError('case-id-unknown');
  return {...file, cases};
}

/** Pure run: returns the document to write. */
export async function runAdapter({casesFile, transport}) {
  const built = [];
  for (const input of caseInputs(casesFile)) built.push(await buildRequest(input));
  const ids = built.map(b => b.request.caseId);
  if (new Set(ids).size !== ids.length) throw new TransportError('case-id-duplicate');
  built.sort((a, b) => a.request.caseId < b.request.caseId ? -1 : 1);
  const casesSha256 = await sha256(canonical(built.map(b => b.requestSha256)));
  const producer = {id: PRODUCER_ID, kind: 'model', authority: AUTHORITY, transport: transport.name, label: transport.name === 'recorded' ? RECORDED_LABEL : transport.name === 'jev-recorded-wire' ? WIRE_LABEL : `transport:${transport.name}`, ...(await fixedIdentity())};
  if (!transport.respond) return {schema: REQUESTS_SCHEMA, producer, casesSha256, requests: built};
  const decisions = [];
  for (const b of built) {
    const {modelId, modelVersion, raw, wire = null} = await transport.respond(b); // errors propagate; nothing is retried or invented
    const n = normalizeOutput(raw, b.request);
    decisions.push({caseId: b.request.caseId, output: n.output, confidence: n.confidence, provenance: await provenanceFor({transport: transport.name, modelId, modelVersion, request: b.request, requestSha256: b.requestSha256, raw, normalization: n.normalization, wire})});
  }
  return {schema: DECISIONS_SCHEMA, producer, casesSha256, decisions};
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw Error(`usage: bad argument ${argv[i]}`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

export async function main(argv) {
  const a = args(argv);
  if (!a.cases || !a.out || !a.transport) throw Error('usage: --cases <inputs.json> --transport recorded|none|jev-recorded-wire [--responses <file>] [--wire <file> --calibration <file>] [--only <caseId,...>] --out <file>');
  const casesFile = selectCases(JSON.parse(await readFile(a.cases, 'utf8')), a.only ? a.only.split(',') : null);
  let transport;
  if (a.transport === 'recorded') {
    if (!a.responses) throw Error('usage: --transport recorded needs --responses');
    transport = createRecordedTransport(JSON.parse(await readFile(a.responses, 'utf8')));
  } else if (a.transport === 'none') transport = createNoTransport();
  else if (a.transport === 'jev-recorded-wire') {
    if (!a.wire || !a.calibration) throw Error('usage: --transport jev-recorded-wire needs --wire and --calibration');
    transport = createJevNoulTransport({mode: 'recorded-wire', AI: createRecordedJevWire(JSON.parse(await readFile(a.wire, 'utf8'))), calibration: JSON.parse(await readFile(a.calibration, 'utf8'))});
  } else if (a.transport === 'jev') {
    // Live: refuses unless the registration and a verified execution entitlement are both present. No entitlement is supplied here.
    const registration = JSON.parse(await readFile(new URL('./jev-noul-registration.json', import.meta.url), 'utf8'));
    const calibration = JSON.parse(await readFile(a.calibration ?? new URL('./jev-noul-calibration.json', import.meta.url), 'utf8'));
    transport = createJevNoulTransport({mode: 'live', AI: null, calibration, registration, entitlement: null});
  }
  else throw Error(`unknown transport ${a.transport}`);
  const doc = await runAdapter({casesFile, transport});
  await writeFile(a.out, JSON.stringify(doc, null, 2) + '\n');
  return doc;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch(e => { console.error(String(e?.message ?? e)); process.exitCode = 1; });
}
