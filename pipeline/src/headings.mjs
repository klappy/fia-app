// BL4a: gather the existing Bible section headings that fall inside each Mark pericope, across the § 3 USE sources in
// heading-sources.json (cookbook work/active/2026-10-02-fia-pericope-subtitles TICKET.md § 3 and § 8 row BL4a).
// Port of that unit's check/gather.py: the counts printed here must reproduce it (469 English headings with \ms dropped).
// No LLM call happens here; the reword (BL4d+) reads this output.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { assert, DATA_ROOT, fetchPinned, loadSources, PIPELINE_ROOT, sha256, USER_AGENT } from './lib.mjs';

// MARK-CENSUS ranges (68 pericopes), borrowed verbatim from check/gather.py. 6:6 splits into a/b parts.
export const MARK_CENSUS = 'MRK-1-1-13 1:1-1:13;MRK-1-14-20 1:14-1:20;MRK-1-21-28 1:21-1:28;MRK-1-29-34 1:29-1:34;MRK-1-35-39 1:35-1:39;MRK-1-40-45 1:40-1:45;MRK-2-1-12 2:1-2:12;MRK-2-13-17 2:13-2:17;MRK-2-18-22 2:18-2:22;MRK-2-23-3-6 2:23-3:6;MRK-3-7-12 3:7-3:12;MRK-3-13-19 3:13-3:19;MRK-3-20-35 3:20-3:35;MRK-4-1-20 4:1-4:20;MRK-4-21-25 4:21-4:25;MRK-4-26-34 4:26-4:34;MRK-4-35-41 4:35-4:41;MRK-5-1-20 5:1-5:20;MRK-5-21-34 5:21-5:34;MRK-5-35-43 5:35-5:43;MRK-6-1-6 6:1-6:6a;MRK-6-6-13 6:6b-6:13;MRK-6-14-29 6:14-6:29;MRK-6-30-44 6:30-6:44;MRK-6-45-56 6:45-6:56;MRK-7-1-8 7:1-7:8;MRK-7-9-13 7:9-7:13;MRK-7-14-23 7:14-7:23;MRK-7-24-30 7:24-7:30;MRK-7-31-37 7:31-7:37;MRK-8-1-10 8:1-8:10;MRK-8-11-21 8:11-8:21;MRK-8-22-26 8:22-8:26;MRK-8-27-30 8:27-8:30;MRK-8-31-9-1 8:31-9:1;MRK-9-2-13 9:2-9:13;MRK-9-14-29 9:14-9:29;MRK-9-30-50 9:30-9:50;MRK-10-1-12 10:1-10:12;MRK-10-13-31 10:13-10:31;MRK-10-32-45 10:32-10:45;MRK-10-46-52 10:46-10:52;MRK-11-1-11 11:1-11:11;MRK-11-12-26 11:12-11:26;MRK-11-27-33 11:27-11:33;MRK-12-1-12 12:1-12:12;MRK-12-13-17 12:13-12:17;MRK-12-18-27 12:18-12:27;MRK-12-28-34 12:28-12:34;MRK-12-35-37 12:35-12:37;MRK-12-38-44 12:38-12:44;MRK-13-1-8 13:1-13:8;MRK-13-9-23 13:9-13:23;MRK-13-24-31 13:24-13:31;MRK-13-32-37 13:32-13:37;MRK-14-1-11 14:1-14:11;MRK-14-12-26 14:12-14:26;MRK-14-27-31 14:27-14:31;MRK-14-32-42 14:32-14:42;MRK-14-43-52 14:43-14:52;MRK-14-53-65 14:53-14:65;MRK-14-66-72 14:66-14:72;MRK-15-1-15 15:1-15:15;MRK-15-16-32 15:16-15:32;MRK-15-33-39 15:33-15:39;MRK-15-40-47 15:40-15:47;MRK-16-1-8 16:1-16:8;MRK-16-9-20 16:9-16:20';

// Sources that are never read (licence or HOLD); fetchSource refuses them even if a registry entry names them.
export const NEVER_READ = new Set(['TBI', 'CUV-T', 'TPI2008', 'VanDyck', 'Van Dyck', 'LSG1910', 'TerjemahanBaruIndonesia', 'ChineseUnionVersionTraditional', 'TokPisinBible2008', 'ArabicVanDyckBible', 'LouisSegond1910']);

const parseVerse = (s) => { const [c, v] = s.split(':'); const m = /^(\d+)([ab]?)$/.exec(v); return [Number(c), Number(m[1]), m[2]]; };
export const PERICOPES = MARK_CENSUS.split(';').map((item) => { const [id, rng] = item.split(' '); const [a, b] = rng.split('-'); return { id, start: parseVerse(a), end: parseVerse(b) }; });
// Order (c, v, part) with '' and 'a' before 'b'.
const ord = ([c, v, p]) => c * 1e6 + v * 10 + (p === 'b' ? 1 : 0);
const fmt = ([c, v, p]) => `${c}:${v}${p}`;

export function locate(anchor) {
  return PERICOPES.findIndex(({ start, end }) => ord(start) <= ord(anchor)
    && (ord(anchor) <= ord(end) || (end[2] === 'a' && anchor[0] === end[0] && anchor[1] === end[1] && anchor[2] !== 'b')));
}

const HEAD = new Set(['s', 's1', 's2']);
const SKIP = new Set(['ms', 'ms1', 'ms2', 'mr', 'sr', 'r', 'd', 's3', 's4', 'mt', 'mt1', 'mt2', 'h', 'toc1', 'toc2', 'toc3', 'id', 'ide', 'ip', 'is', 'cl', 'rem', 'usfm', 'sts', 'imt', 'imt1', 'mte']);
const PARA = /^\\(p|m|nb|pi\d?|q\d?|qm\d?|li\d?|pmo|mi|pc|pm|pmc|pmr|b|cls)\b/;
const F35_DATE = /\s*[—–]\s*(?:begins\s+)?(?:Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day.*$/i;
const REF_ONLY = /^(Mark|Marcos|Marc)\s+\d+[:.]\d+([-–]\d+([:.]\d+)?)?$/;

export function cleanInline(t) {
  return t.replace(/\\w ([^|\\]*)(\|[^\\]*)?\\w\*/g, '$1')
    .replace(/\\\+?[a-z]+\d? ?([^\\]*)\\\+?[a-z]+\d?\*/g, '$1')
    .replace(/\\[a-z]+\d?\*?/g, '');
}

// § 3 Normalize, plus per-source strips named in the registry (A5: portft "TEMA: ", OBBR " // "; F35 date tails).
export function normalizeHeading(raw, strip = []) {
  let t = cleanInline(raw).replace(/\s+/g, ' ').trim().normalize('NFC');
  if (strip.includes('f35-date-tail')) t = t.replace(F35_DATE, '').trim();
  if (strip.includes('tema-label')) t = t.replace(/^TEMA:\s*/, '');
  if (strip.includes('line-break-slashes')) t = t.replace(/\s*\/\/\s*/g, ' ').trim();
  return t;
}

/** Headings of one USFM book, each anchored to the verse that follows it (b-part when text of the current verse follows). */
export function parseHeadings(usfm, { strip = [] } = {}) {
  const raw = usfm.replace(/^﻿/, '').replace(/\\f .*?\\f\*/gs, '').replace(/\\x .*?\\x\*/gs, '');
  const out = []; let c = 0; let v = 0; let pending = [];
  const flush = (anchor) => { for (const [marker, text] of pending) out.push({ anchor, text, marker }); pending = []; };
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    const m = /^\\([a-z]+\d?)\s*(.*)$/s.exec(s);
    const [mk, rest] = m ? [m[1], m[2]] : ['', s];
    if (mk === 'c') { c = Number(rest.split(/\s+/)[0]); v = 0; continue; }
    if (HEAD.has(mk)) {
      const text = normalizeHeading(rest, strip);
      if (!text || REF_ONLY.test(text)) continue;
      pending.push([mk, text]); continue;
    }
    if (SKIP.has(mk)) continue;
    const body = PARA.test(s) ? s.replace(PARA, '').trim() : s;
    const vm = /\\v (\d+)/.exec(body);
    const before = vm ? body.slice(0, vm.index) : body;
    if (pending.length && cleanInline(before).replace(/\\[a-z]+\d?\*?/g, '').trim() && c > 0 && v > 0) flush([c, v, 'b']);
    for (const vv of body.matchAll(/\\v (\d+)/g)) { v = Number(vv[1]); if (pending.length) flush([c, v, '']); }
  }
  return out;
}

/** Highest verse per chapter; a bridge (\v 42-43) counts as its last verse (A2). */
export function maxVerses(usfm) {
  const mv = new Map(); let c = 0;
  for (const m of usfm.matchAll(/\\(c|v) (\d+)(?:-(\d+))?/g)) {
    if (m[1] === 'c') c = Number(m[2]); else mv.set(c, Math.max(mv.get(c) || 0, Number(m[3] || m[2])));
  }
  return mv;
}
function before([c, v, p], mv) {
  if (p === 'b') return [c, v, 'a'];
  if (v > 1) return [c, v - 1, ''];
  return c > 1 ? [c - 1, mv.get(c - 1) || 1, ''] : [c, v, ''];
}

/** Place one source's headings into pericopes: span, span-aware forward rule (A1), `past`, per-source dedup. */
export function placeHeadings(source, usfm, { strip = [], forwardAll = false } = {}) {
  const hs = parseHeadings(usfm, { strip }); const mv = maxVerses(usfm);
  const placed = []; const unplaced = []; const seen = new Set();
  hs.forEach((h, j) => {
    const next = hs.slice(j + 1).find((n) => ord(n.anchor) !== ord(h.anchor) || n.anchor[2] !== h.anchor[2]);
    const last = next ? before(next.anchor, mv) : [16, mv.get(16) || 20, ''];
    let i = locate(h.anchor);
    if (i < 0) { unplaced.push({ source, verse: fmt(h.anchor), text: h.text }); return; }
    const B = PERICOPES[i].end;
    // Forward rule (span-aware, A1): a heading on a pericope's last whole verse moves on only when its span runs past it.
    if (B[2] === '' && h.anchor[0] === B[0] && h.anchor[1] === B[1] && (forwardAll || ord(last) > ord(B))) {
      if (i + 1 >= PERICOPES.length) { unplaced.push({ source, verse: fmt(h.anchor), text: h.text }); return; }
      i += 1;
    }
    const { id, end } = PERICOPES[i];
    const key = `${id}\u0000${h.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    const past = ord(last) > ord(end) && !(end[2] === 'a' && last[0] === end[0] && last[1] === end[1] && last[2] === 'a');
    placed.push({ pericope: id, source, verse: fmt(h.anchor), last: fmt(last), past, text: h.text, marker: h.marker });
  });
  return { placed, unplaced };
}

// ---- fetching -------------------------------------------------------------------------------------------------------
const CACHE_ROOT = path.join(PIPELINE_ROOT, '.cache', 'headings');

/** Minimal zip reader (central directory, stored or deflate) — eBible ships each Bible as one zip. */
export function unzipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  assert(eocd >= 0, 'zip: no end of central directory');
  const n = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16); const out = new Map();
  for (let k = 0; k < n; k++) {
    assert(buf.readUInt32LE(p) === 0x02014b50, 'zip: bad central directory');
    const method = buf.readUInt16LE(p + 10); const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28); const extra = buf.readUInt16LE(p + 30); const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42); const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    out.set(name, () => {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 0 ? data : inflateRawSync(data);
    });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

async function fetchUrl(url, cacheFile) {
  if (existsSync(cacheFile)) return { bytes: await readFile(cacheFile), headers: {}, cached: true };
  const res = await fetch(url, { signal: AbortSignal.timeout(120000), headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(cacheFile), { recursive: true }); await writeFile(cacheFile, bytes);
  return { bytes, headers: { etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified') }, cached: false };
}

/** Fetch one registry source's Mark USFM. Returns {usfm, revision:{kind, value}, drift} — drift names a changed sha256. */
export async function fetchSource(src, sources) {
  assert(!NEVER_READ.has(src.id) && !NEVER_READ.has(src.repo), `${src.id}: never read (TICKET § 3)`);
  if (src.kind === 'aquifer') {
    const r = await fetchPinned(sources, src.repo, src.freshness.commit, src.path);
    return { usfm: r.bytes.toString('utf8'), revision: { kind: 'git', value: src.freshness.commit }, fileSha256: r.sha256 };
  }
  if (src.kind === 'git') {
    const url = src.rawUrl.replace('{commit}', src.freshness.commit).replace('{path}', src.path);
    const r = await fetchUrl(url, path.join(CACHE_ROOT, 'git', src.id, src.freshness.commit, path.basename(src.path)));
    return { usfm: r.bytes.toString('utf8'), revision: { kind: 'git', value: src.freshness.commit }, fileSha256: sha256(r.bytes) };
  }
  assert(src.kind === 'ebible', `${src.id}: unknown kind ${src.kind}`);
  const r = await fetchUrl(src.url, path.join(CACHE_ROOT, 'ebible', `${src.ebibleId}_usfm.zip`));
  const zipSha = sha256(r.bytes);
  const entries = unzipEntries(r.bytes);
  const name = [...entries.keys()].find((k) => /MRK/i.test(k) && /\.u?sfm$/i.test(k));
  assert(name, `${src.id}: no Mark file in ${src.url}`);
  return { usfm: entries.get(name)().toString('utf8'), revision: { kind: 'sha256', value: zipSha }, drift: zipSha !== src.freshness.sha256 ? { pinned: src.freshness.sha256, got: zipSha, ...r.headers } : null };
}

export async function loadHeadingSources(file = path.join(PIPELINE_ROOT, 'heading-sources.json')) {
  return JSON.parse(await readFile(file, 'utf8'));
}

/** Mark catalog entries per language (data/catalog/<lang>.json) — the denominator of rung coverage. */
export async function markCatalog(langs, dataRoot = DATA_ROOT) {
  const out = {};
  for (const lang of langs) {
    const f = path.join(dataRoot, 'catalog', `${lang}.json`);
    out[lang] = existsSync(f) ? JSON.parse(await readFile(f, 'utf8')).entries.filter((e) => e.book === 'MRK').map((e) => e.pericope) : [];
  }
  return out;
}

/**
 * Rung per catalog entry: 1 = has ≥ 1 heading; 1p = English with none (the passage path, § 3 "Zero headings");
 * 2 = any other language with none (translation fallback, § 4).
 */
export function rungCoverage(byLang, catalog) {
  const perLang = {}; const totals = { 1: 0, '1p': 0, 2: 0 };
  for (const [lang, ids] of Object.entries(catalog)) {
    let withHeadings = 0;
    for (const id of ids) {
      const n = byLang[lang]?.[id]?.length || 0;
      const rung = n > 0 ? 1 : lang === 'eng' ? '1p' : 2;
      if (n > 0) withHeadings++;
      totals[rung]++;
    }
    perLang[lang] = { withHeadings, entries: ids.length };
  }
  return { perLang, totals };
}

/** Gather every registry source; returns {byLang: {lang: {pericope: [heading]}}, unplaced, fetched: [{id, revision, drift}], held}. */
export async function gatherHeadings({ registry, sources, log = console.error } = {}) {
  registry ??= await loadHeadingSources(); sources ??= await loadSources();
  const byLang = {}; const unplaced = []; const fetched = []; const held = [];
  for (const src of registry.sources) {
    let got;
    try { got = await fetchSource(src, sources); } catch (err) { held.push({ id: src.id, reason: err.message }); log(`held ${src.id}: ${err.message}`); continue; }
    const { placed, unplaced: u } = placeHeadings(src.id, got.usfm, { strip: src.strip || [] });
    const lang = (byLang[src.lang] ??= Object.fromEntries(PERICOPES.map((p) => [p.id, []])));
    for (const h of placed) lang[h.pericope].push(h);
    unplaced.push(...u);
    fetched.push({ id: src.id, lang: src.lang, revision: got.revision, drift: got.drift || null, kept: placed.length });
  }
  return { byLang, unplaced, fetched, held };
}
