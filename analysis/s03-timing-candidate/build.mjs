// Read-only analysis: never writes a runtime sidecar or admits a timing map.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {activityWords} from '../../apps/web/src/lib/transcript.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pin = {
  raw: '6ad7a8af089f7a99201359634da6b0766021924b6fcdffdcdd40e804602fb401',
  ranges: '9554578b9dee829b4dc2d61eb13a8fc60786f7cfa42f732edceb18c537f38428',
  boundaries: '3bce23b761fabf14b9099d585f31ec03e2e4c3ee2e3bd16a67b4bea983ec8f16',
  delivery: '4396f92c538c1292ccff0c9026f6608686006970df9f1b7028892edbfede05b9',
  source: '6ac21beefbcc42b721de90e499b842c07f6a63f0e6a8f91391ce511613412538',
};
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const evidence = hash => {
  const bytes = readFileSync(resolve(root, `apps/web/public/content/recording-evidence/${hash}.json`));
  if (createHash('sha256').update(bytes).digest('hex') !== hash) throw Error('Evidence hash mismatch');
  return JSON.parse(bytes);
};
const norm = text => text.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}']/gu, '');
export function buildCandidate() {
  const raw = evidence(pin.raw), ranges = evidence(pin.ranges), boundaries = evidence(pin.boundaries);
  const old = read(`apps/web/public/transcripts/${pin.delivery}.words.json`);
  if (raw.recordingSha256 !== pin.source || ranges.sourceSha256 !== pin.source || old.sourceAudioSha256 !== pin.source) throw Error('Source identity mismatch');
  // Identity conversion is proposed ONLY: raw decoded-pcm and delivery-media clocks
  // are different domains. Existing sidecar's mapping alone is not independent proof.
  if (old.timingMapping.scale !== 1 || old.timingMapping.offsetSeconds !== 0) throw Error('Unexpected mapping');
  const rows = [];
  for (const id of ['S03-U009','S03-U010','S03-U011','S03-U012','S03-U013','S03-U014','S03-U015','S03-U016','S03-U024']) {
    const accepted = ranges.ranges.find(r => r.activityId === id), before = old.activities[id];
    const {first, lastExclusive} = accepted.wordSpan;
    const sourceWords = raw.words.slice(first, lastExclusive);
    if (sourceWords.length !== before.words.length) throw Error(`${id}: token count differs; manual review required`);
    let matched = 0;
    const words = sourceWords.map((word, i) => {
      const original = before.words[i], tokenMatches = norm(word.text) === norm(original.text);
      if (tokenMatches) matched++;
      return {text: original.text, from: original.from, to: original.to,
        startMs: Math.round(word.startSeconds * 1000), endMs: Math.round(word.endSeconds * 1000),
        rawWordIndex: first + i, rawText: word.text, tokenMatches};
    });
    const after = {startMs: before.startMs, endMs: before.endMs, matched, total: words.length, words};
    const boundary = boundaries.rows.find(r => r.activityId === id);
    rows.push({id, acceptedSourceRange: accepted.sourceRange, rawWordSpan: accepted.wordSpan,
      boundaryReview: {status: boundary?.status, verdict: boundary?.verdict, reason: boundary?.reason},
      before, proposedAfter: after, beforePassesRuntimeGuard: !!activityWords(before),
      proposedPassesRuntimeGuard: !!activityWords(after),
      zeroDurationRawIndices: words.filter(w => w.endMs <= w.startMs).map(w => w.rawWordIndex),
      tokenMismatches: words.filter(w => !w.tokenMatches).map(w => ({rawWordIndex:w.rawWordIndex, canonical:w.text, raw:w.rawText}))});
  }
  return {status:'UNAPPROVED-ANALYSIS-ONLY', pins:pin,
    clockQualification:'BLOCKED: decoded-pcm to delivery-media-seconds identity requires independent qualification; no admission performed',
    rows, summary:{rows:rows.length, beforePassing:rows.filter(r=>r.beforePassesRuntimeGuard).length,
      proposedPassing:rows.filter(r=>r.proposedPassesRuntimeGuard).length,
      admitted:0}};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(buildCandidate(), null, 2));
