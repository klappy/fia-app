// Isolated progress record for the feasibility shell. Namespaced so it never
// touches the shipped guide's storage; a damaged or missing record falls back
// to a clean default instead of throwing.
export const KEY = 'fia-platform-probe:v1';
export const DEFAULT = Object.freeze({version: 1, sampleSha256: null, position: 0, savedAt: null});

function checksum(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export function encode(record) {
  const body = JSON.stringify({version: 1, sampleSha256: record.sampleSha256, position: record.position, savedAt: record.savedAt});
  return JSON.stringify({body, sum: checksum(body)});
}

// Returns {record, status}; status is 'restored', 'empty' or 'recovered:<reason>'.
export function decode(raw, sampleSha256) {
  if (raw == null) return {record: {...DEFAULT, sampleSha256}, status: 'empty'};
  try {
    const {body, sum} = JSON.parse(raw);
    if (typeof body !== 'string' || checksum(body) !== sum) throw Error('checksum');
    const r = JSON.parse(body);
    if (r.version !== 1) throw Error('version');
    if (r.sampleSha256 !== sampleSha256) return {record: {...DEFAULT, sampleSha256}, status: 'recovered:other-sample'};
    if (!Number.isFinite(r.position) || r.position < 0) throw Error('position');
    return {record: r, status: 'restored'};
  } catch (e) {
    return {record: {...DEFAULT, sampleSha256}, status: `recovered:${e.message === 'checksum' || e.message === 'version' || e.message === 'position' ? e.message : 'parse'}`};
  }
}

export function load(store, sampleSha256) {
  let raw = null;
  try { raw = store.getItem(KEY); } catch { return {record: {...DEFAULT, sampleSha256}, status: 'recovered:storage-unavailable'}; }
  return decode(raw, sampleSha256);
}

export function save(store, record) {
  try { store.setItem(KEY, encode(record)); return true; } catch { return false; }
}
