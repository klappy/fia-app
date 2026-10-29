// Q18 execution seam: pluggable transports. Interface: {name, respond({request, requestSha256}) → {modelId, modelVersion, raw}}.
// Only `recorded` (fixture replay) and `none` (requests only) ship. The Jev transport is an unactivated stub.
export const RECORDED_SCHEMA = 'fia-association-question-recorded@1';

export class TransportError extends Error {
  constructor(reason) { super(reason); this.name = 'TransportError'; this.reason = reason; }
}

/** Replays recorded responses keyed by request sha256. A miss is an error, never a fabricated answer. */
export function createRecordedTransport(file) {
  if (!file || file.schema !== RECORDED_SCHEMA || !Array.isArray(file.records)) throw new TransportError('recorded-file-invalid');
  const records = new Map();
  for (const r of file.records) {
    if (typeof r?.requestSha256 !== 'string' || records.has(r.requestSha256) || !('response' in r)) throw new TransportError('recorded-record-invalid');
    records.set(r.requestSha256, r);
  }
  const used = new Set();
  return {
    name: 'recorded',
    used,
    records,
    async respond({requestSha256}) {
      const r = records.get(requestSha256);
      if (!r) throw new TransportError(`recorded-response-missing:${requestSha256}`);
      used.add(requestSha256);
      return {modelId: r.modelId ?? null, modelVersion: r.modelVersion ?? null, raw: r.response};
    }
  };
}

/** Writes requests only. It has no respond(), so no decision is ever produced through it. */
export function createNoTransport() {
  return {name: 'none', respond: null};
}

/**
 * Jev transport seam (NOT ACTIVATED). Shape borrowed from createJevCueRoleAdapter
 * (server/fia/preparation/jev/adapter.mjs) and the pilot connector wire
 * (scripts/jev-cue-role-pilot/providers/connector-snippet.js): CF-Extras POST /accounts/{id}/ai/run,
 * body {model: 'typesafe/jev', input: {state, questions}}; the pilot observed jev-1.13.0 on 2026-10-06.
 * The cue-role questions and decisions are not reused. A live transport needs everything in README.md
 * "Live transport requirement"; until then every call throws.
 */
export const JEV_SEAM = Object.freeze({route: 'POST /accounts/{id}/ai/run', model: 'typesafe/jev', lastObservedModelVersion: 'jev-1.13.0', status: 'not-activated'});
export function createJevTransport() {
  return {
    name: 'jev',
    async respond() { throw new TransportError('not-activated'); }
  };
}
