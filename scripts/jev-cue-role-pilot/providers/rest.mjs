// Fallback provider (PLAN.md D1-fallback, step 4): Cloudflare REST, same path and body as the verified connector wire.
// Needs a least-scope Workers AI token minted by Otto, read from a 0600 file named by $CF_AI_TOKEN_FILE; the token is
// never logged or written. Output rows have the connector snippet's shape so `run.mjs --phase import` treats both alike.
import {readFile, stat} from 'node:fs/promises';
import {MODEL} from '../../../server/fia/preparation/jev/adapter.mjs';
import {normalizeJevResponse} from './replay.mjs';

export const API = 'https://api.cloudflare.com/client/v4';

async function readToken(tokenFile) {
  if (!tokenFile) throw Error('CF_AI_TOKEN_FILE unset');
  const s = await stat(tokenFile);
  if ((s.mode & 0o077) !== 0) throw Error('token file must be mode 0600');
  const token = (await readFile(tokenFile, 'utf8')).trim();
  if (!token) throw Error('token file empty');
  return token;
}

async function post({accountId, token, fetchImpl, state, questions}) {
  const res = await fetchImpl(`${API}/accounts/${encodeURIComponent(accountId)}/ai/run`, {method: 'POST', headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'}, body: JSON.stringify({model: MODEL, input: {state, questions}})});
  const body = await res.json().catch(() => null);
  if (!res.ok) throw Error(`http-${res.status}`);
  // REST wraps the connector's r.result in {success, result}; keep the connector-shaped object.
  return body && typeof body === 'object' && 'result' in body && body.result && typeof body.result === 'object' && !('answers' in body) ? body.result : body;
}

/** Fire requests (≤ 8 per batch, concurrency ≤ 6, no retries) → [{rawKey, ms, response, error?}]. */
export async function fireRequests(requests, {accountId = process.env.CF_ACCOUNT_ID, tokenFile = process.env.CF_AI_TOKEN_FILE, fetchImpl = globalThis.fetch, concurrency = 6} = {}) {
  if (!accountId) throw Error('CF_ACCOUNT_ID unset');
  if (!Array.isArray(requests) || requests.length < 1 || requests.length > 8) throw Error('batch must hold 1..8 requests');
  const token = await readToken(tokenFile), out = new Array(requests.length);
  let next = 0;
  async function worker() {
    while (next < requests.length) {
      const i = next++, q = requests[i], t = Date.now();
      try { out[i] = {rawKey: q.rawKey, ms: Date.now() - t, response: await post({accountId, token, fetchImpl, state: q.state, questions: q.questions})}; out[i].ms = Date.now() - t; }
      catch (e) { out[i] = {rawKey: q.rawKey, ms: Date.now() - t, response: null, error: String(e?.message ?? e).slice(0, 300)}; }
    }
  }
  await Promise.all(Array.from({length: Math.min(Math.max(1, concurrency), 6, requests.length)}, worker));
  return out;
}

/** Direct AI shim for the adapter (D4 normalization applied). Not used by the cached pilot flow. */
export function createRestAI(options = {}) {
  return {
    async run(model, wire) {
      if (model !== MODEL) throw Error('model');
      const token = await readToken(options.tokenFile ?? process.env.CF_AI_TOKEN_FILE);
      return normalizeJevResponse(await post({accountId: options.accountId ?? process.env.CF_ACCOUNT_ID, token, fetchImpl: options.fetchImpl ?? globalThis.fetch, state: wire.state, questions: wire.questions}));
    }
  };
}
