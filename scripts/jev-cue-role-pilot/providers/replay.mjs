// Replay provider: an AI shim answering adapter calls from the raw cache (PLAN.md §9, DoD 5). Zero network.
import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {canonical, sha256, MODEL} from '../../../server/fia/preparation/jev/adapter.mjs';

// §9: raw key binds model, state, questions and pass; independent of calibration and rules.
export async function rawKeyFor({model = MODEL, state, questions, pass}) {
  if (typeof state !== 'string' || !questions || !Number.isSafeInteger(pass)) throw Error('raw-key-input');
  return sha256(canonical({model, state, questions, pass}, 262144));
}

// D4: the live wire reports the revision as `model`; the adapter (adapter.mjs:147) reads model_version ?? version.
// Accepts the connector envelope {state, result:{model, answers, usage}} and the bare {model, answers, usage}.
export function normalizeJevResponse(res) {
  if (res === null || typeof res !== 'object') return res;
  const inner = res.result && typeof res.result === 'object' && res.result.answers ? res.result : res;
  return {...inner, model_version: inner.model_version ?? inner.version ?? inner.model};
}

export function observedModel(res) {
  const inner = normalizeJevResponse(res);
  return typeof inner?.model_version === 'string' ? inner.model_version : null;
}

// required: derive, score (arms B/D), report and replay read paid evidence, so a missing or empty raw dir is a
// refusal, never an empty cache. Optional only for the pre-import gates (snippet probe check, observed usage).
export async function loadRawCache(rawDir, {required = false} = {}) {
  const cache = new Map();
  let names = [];
  try { names = await readdir(rawDir); } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    if (required) throw Error(`raw-cache-missing:${rawDir} (no imported responses: run --phase import first)`);
  }
  for (const name of names.filter(n => n.endsWith('.json')).sort()) {
    const record = JSON.parse(await readFile(join(rawDir, name), 'utf8'));
    if (`${record.rawKey}.json` !== name) throw Error(`raw-file-name:${name}`);
    cache.set(record.rawKey, record);
  }
  if (required && cache.size === 0) throw Error(`raw-cache-empty:${rawDir} (no imported responses: run --phase import first)`);
  return cache;
}

/** AI shim for createJevCueRoleAdapter: run(model, {state, questions}) → normalized cached response. */
export function createReplayAI({cache, pass}) {
  const misses = [], hits = [];
  return {
    misses, hits,
    async run(model, wire) {
      const rawKey = await rawKeyFor({model, state: wire.state, questions: wire.questions, pass});
      const record = cache.get(rawKey);
      if (!record || record.response == null) { misses.push(rawKey); throw Error('raw-cache-miss'); }
      hits.push(rawKey);
      return normalizeJevResponse(record.response);
    }
  };
}
