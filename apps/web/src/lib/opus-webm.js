// Safari does not read the timeline of Opus in an Ogg container: it estimates the length from the file size
// and the bit rate near the start (WebKit bug 293310), so currentTime and seeks drift from the real audio and the
// error grows with the position in the recording. The same Opus packets in a WebM container get a correct
// timeline. This copies the packets, changes no sample, and leaves the stored ranges, which are seconds of the
// decoded audio, valid. Any input it does not fully understand is returned as it came.
const text = s => Uint8Array.from(s, c => c.charCodeAt(0));
const cat = parts => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const size = n => { // minimal EBML length
  let len = 1; while (len < 8 && n >= 2 ** (7 * len) - 1) len++;
  const out = new Uint8Array(len); let v = n;
  for (let i = len - 1; i >= 0; i--) { out[i] = v % 256; v = Math.floor(v / 256); }
  out[0] |= 1 << (8 - len); return out;
};
const el = (id, ...body) => { const b = cat(body); return cat([Uint8Array.from(id), size(b.length), b]); };
const uint = (id, n, width) => { let bytes = []; let v = n; do { bytes.unshift(v % 256); v = Math.floor(v / 256); } while (v > 0); while (width && bytes.length < width) bytes.unshift(0); return el(id, Uint8Array.from(bytes)); };
const float64 = (id, x) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, x); return el(id, b); };
// Ogg: the packets of the one logical stream, and the final granule position.
function oggPackets(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const packets = []; let partial = [], serial = null, lastGranule = null, offset = 0;
  while (offset < bytes.length) {
    if (offset + 27 > bytes.length || view.getUint32(offset) !== 0x4f676753) throw Error('not ogg');
    const segments = bytes[offset + 26], pageSerial = view.getUint32(offset + 14, true);
    if (serial === null) serial = pageSerial; else if (serial !== pageSerial) throw Error('chained ogg');
    const granule = view.getBigInt64(offset + 6, true); if (granule >= 0n) lastGranule = granule;
    let at = offset + 27 + segments, body = 0;
    for (let i = 0; i < segments; i++) body += bytes[offset + 27 + i];
    if (at + body > bytes.length) throw Error('truncated ogg');
    for (let i = 0; i < segments; i++) {
      const n = bytes[offset + 27 + i]; partial.push(bytes.subarray(at, at + n)); at += n;
      if (n < 255) { packets.push(cat(partial)); partial = []; }
    }
    offset = at;
  }
  if (partial.length || lastGranule === null) throw Error('truncated ogg');
  return { packets, lastGranule: Number(lastGranule) };
}
// Samples at 48 kHz in one Opus packet, from its table-of-contents byte.
function packetSamples(p) {
  const toc = p[0], config = toc >> 3, code = toc & 3;
  const ms = config < 12 ? [10, 20, 40, 60][config % 4] : config < 16 ? [10, 20][config % 2] : [2.5, 5, 10, 20][config % 4];
  const frames = code === 0 ? 1 : code < 3 ? 2 : p[1] & 0x3f;
  if (!frames) throw Error('empty opus packet');
  return frames * ms * 48;
}
export function oggOpusToWebm(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const { packets, lastGranule } = oggPackets(bytes);
  const head = packets[0];
  if (!head || head.length < 19 || String.fromCharCode(...head.subarray(0, 8)) !== 'OpusHead' || head[8] !== 1 || String.fromCharCode(...(packets[1] || []).subarray(0, 8)) !== 'OpusTags') throw Error('not opus');
  const channels = head[9], preSkip = head[10] | head[11] << 8;
  if (head[18] !== 0 || packets.length < 3) throw Error('unsupported opus');
  const audio = packets.slice(2);
  // Clusters of about five seconds, each indexed in Cues, as ffmpeg writes them.
  const clusters = []; let samples = 0, current = null;
  for (const p of audio) {
    const ms = Math.round(samples / 48);
    if (!current || ms - current.start >= 5000) { current = { start: ms, blocks: [] }; clusters.push(current); }
    const rel = ms - current.start;
    current.blocks.push(el([0xa3], Uint8Array.from([0x81, rel >> 8, rel & 255, 0x80]), p));
    samples += packetSamples(p);
  }
  const durationMs = (lastGranule - preSkip) / 48;
  const header = el([0x1a, 0x45, 0xdf, 0xa3], uint([0x42, 0x86], 1), uint([0x42, 0xf7], 1), uint([0x42, 0xf2], 4), uint([0x42, 0xf3], 8), el([0x42, 0x82], text('webm')), uint([0x42, 0x87], 4), uint([0x42, 0x85], 2));
  const info = el([0x15, 0x49, 0xa9, 0x66], uint([0x2a, 0xd7, 0xb1], 1000000), el([0x4d, 0x80], text('fia-opus-webm')), el([0x57, 0x41], text('fia-opus-webm')), float64([0x44, 0x89], durationMs));
  const track = el([0x16, 0x54, 0xae, 0x6b], el([0xae], uint([0xd7], 1), uint([0x73, 0xc5], 1), uint([0x83], 2), uint([0x9c], 0), el([0x86], text('A_OPUS')), uint([0x56, 0xaa], Math.round(preSkip * 1e9 / 48000)), uint([0x56, 0xbb], 80000000), el([0x63, 0xa2], head), el([0xe1], float64([0xb5], 48000), uint([0x9f], channels))));
  const clusterBytes = clusters.map(c => el([0x1f, 0x43, 0xb6, 0x75], uint([0xe7], c.start), ...c.blocks));
  const seek = (id, pos) => el([0x4d, 0xbb], el([0x53, 0xab], Uint8Array.from(id)), uint([0x53, 0xac], pos, 4));
  const seekHeadLength = seek([0x15, 0x49, 0xa9, 0x66], 0).length * 3 + 5; // id(4) + size(1) + three fixed-width entries
  const infoAt = seekHeadLength, tracksAt = infoAt + info.length, firstCluster = tracksAt + track.length;
  let at = firstCluster; const cuePoints = clusters.map((c, i) => { const p = el([0xbb], uint([0xb3], c.start), el([0xb7], uint([0xf7], 1), uint([0xf1], at))); at += clusterBytes[i].length; return p; });
  const cues = el([0x1c, 0x53, 0xbb, 0x6b], ...cuePoints);
  const seekHead = el([0x11, 0x4d, 0x9b, 0x74], seek([0x15, 0x49, 0xa9, 0x66], infoAt), seek([0x16, 0x54, 0xae, 0x6b], tracksAt), seek([0x1c, 0x53, 0xbb, 0x6b], at));
  if (seekHead.length !== seekHeadLength) throw Error('seek head size');
  return cat([header, el([0x18, 0x53, 0x80, 0x67], seekHead, info, track, ...clusterBytes, cues)]);
}
// What to hand the media element: a WebM copy of an Ogg Opus recording, otherwise exactly what came in.
export function playableAudio(bytes, mime, { canPlay = type => typeof document === 'object' && document.createElement('audio').canPlayType(type) } = {}) {
  if (!/ogg/i.test(mime || '') || !canPlay('audio/webm; codecs=opus')) return { bytes, mime };
  try { return { bytes: oggOpusToWebm(bytes), mime: 'audio/webm' }; } catch { return { bytes, mime }; }
}

// A verified saved Ogg Opus clip plays through the same WebM remux as an online one. The saved file is read
// through the page's own request, so the worker's verified response is the source; its length and sha256 must
// still match the manifest descriptor. Anything else (no fetch, a refusal, other bytes, not Ogg Opus) returns
// null and the caller plays the saved path exactly as before.
export async function downloadedWebm(path, descriptor, { signal, fetchImpl = globalThis.fetch, canPlay } = {}) {
  try {
    if (!descriptor?.playbackRange || !/ogg/i.test(descriptor.mime || '') || typeof fetchImpl !== 'function' || !globalThis.crypto?.subtle) return null;
    const response = await fetchImpl(path, { signal });
    if (!response?.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== descriptor.bytes) return null;
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
    if (sha !== descriptor.sha256) return null;
    const media = playableAudio(bytes, descriptor.mime, canPlay ? { canPlay } : undefined);
    return media.mime === 'audio/webm' ? media : null;
  } catch { return null; }
}
