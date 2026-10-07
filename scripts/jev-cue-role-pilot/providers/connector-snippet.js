// Paste into CF-Extras `execute` with __DATA__ replaced by ≤ 8 entries of evidence/requests*.json
// (`node scripts/jev-cue-role-pilot/run.mjs --phase snippet --batch <n>` prints it filled).
// Verified wire (door probe 2026-10-06 18:08Z): POST /accounts/{id}/ai/run, body {model, input:{state, questions}};
// r.result = {state:'Completed', result:{model, answers, usage}}. /ai/run/typesafe/jev is not routed.
// No retries: a failed call is returned as an error row and never re-fired.
// Concurrency ≤ 6 (CEILINGS.concurrency) deviates from PLAN step 4 (sequential): the 2026-10-06 paid passes ran this way,
// so latency p50/max are measured under concurrency ≤ 6 and RESULTS must say so.
async () => {
  const D = __DATA__;
  if (!Array.isArray(D) || D.length < 1 || D.length > 8) throw new Error('batch must hold 1..8 requests');
  const out = new Array(D.length);
  let next = 0;
  async function worker() {
    while (next < D.length) {
      const i = next++, q = D[i], t = Date.now();
      try {
        const r = await cloudflare.request({method: 'POST', path: `/accounts/${accountId}/ai/run`, body: {model: 'typesafe/jev', input: {state: q.state, questions: q.questions}}});
        out[i] = {rawKey: q.rawKey, ms: Date.now() - t, response: r.result};
      } catch (e) {
        out[i] = {rawKey: q.rawKey, ms: Date.now() - t, response: null, error: String(e && e.message || e).slice(0, 300)};
      }
    }
  }
  await Promise.all(Array.from({length: Math.min(6, D.length)}, worker));
  return out;
}
