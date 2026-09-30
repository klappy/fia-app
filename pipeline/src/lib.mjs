// Shared helpers for the FIA Alpha pipeline. Pinning logic ported from the PoC
// (fia-functional-poc/scripts/prepare-content.mjs + content-lib.mjs): every byte
// enters via raw.githubusercontent.com at a pinned commit SHA (C-01), never `main`.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PIPELINE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(PIPELINE_ROOT, '..');
export const DATA_ROOT = path.join(REPO_ROOT, 'data');
const CACHE_ROOT = process.env.FIA_PIPELINE_CACHE || path.join(PIPELINE_ROOT, '.cache');

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function assert(ok, message) { if (!ok) throw new Error(message); }

export async function loadSources() {
  return JSON.parse(await readFile(path.join(PIPELINE_ROOT, 'sources.json'), 'utf8'));
}

export function rawUrl(sources, repo, sha, filePath) {
  return sources.rawBase.replace('{repo}', repo).replace('{sha}', sha).replace('{path}', filePath);
}

/** Fetch one pinned file. Returns {bytes, sha256, status} — status 404 gives bytes=null. Disk-cached by (repo, sha, path). */
export async function fetchPinned(sources, repo, sha, filePath, { allow404 = false } = {}) {
  assert(/^[a-f0-9]{40}$/.test(sha), `unpinned sha for ${repo}`);
  const cacheFile = path.join(CACHE_ROOT, repo, sha, filePath);
  if (existsSync(cacheFile)) {
    const bytes = await readFile(cacheFile);
    return { bytes, sha256: sha256(bytes), status: 200, cached: true };
  }
  if (existsSync(cacheFile + '.404')) return { bytes: null, sha256: null, status: 404, cached: true };
  const url = rawUrl(sources, repo, sha, filePath);
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(90000), headers: { 'user-agent': 'fia-app-pipeline' } });
      if (res.status === 404 && allow404) {
        await mkdir(path.dirname(cacheFile), { recursive: true });
        await writeFile(cacheFile + '.404', '');
        return { bytes: null, sha256: null, status: 404 };
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      await mkdir(path.dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile, bytes);
      return { bytes, sha256: sha256(bytes), status: 200 };
    } catch (error) {
      last = error;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw last;
}

export async function fetchJson(sources, repo, sha, filePath, opts) {
  const r = await fetchPinned(sources, repo, sha, filePath, opts);
  return r.bytes ? { ...r, json: JSON.parse(r.bytes.toString('utf8')) } : { ...r, json: null };
}

/** Bounded-concurrency map. */
export async function pmap(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

// ---- USFM / Aquifer BBBCCCVVV references ---------------------------------
export const BOOKS = ['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL','MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'];
export const bookNumber = (usfm) => BOOKS.indexOf(usfm) + 1;
export const bookUsfm = (n) => BOOKS[Number(n) - 1];
export const bookFile2 = (usfm) => String(bookNumber(usfm)).padStart(2, '0'); // guide/Bible json/NN.content.json

/** '41001001' -> {book:'MRK', chapter:1, verse:1} */
export function parseRef(ref) {
  const s = String(ref).padStart(9, '0');
  return { book: bookUsfm(Number(s.slice(0, 3)) || Number(s.slice(0, 2))), n: Number(s), chapter: Number(s.slice(3, 6)), verse: Number(s.slice(6, 9)) };
}
function refNumber(ref) { return Number(String(ref).padStart(9, '0')); }

/** '41001001-41001013' -> 'MRK-1-1-13' (M14 default: USFM book + range; cross-chapter -> MRK-1-1-2-5) */
export function pericopeId(indexReference) {
  const [a, b] = indexReference.split('-');
  const s = parseRef(a), e = parseRef(b || a);
  assert(s.book && s.book === e.book, `cross-book pericope ${indexReference}`);
  if (s.chapter === e.chapter) return `${s.book}-${s.chapter}-${s.verse}-${e.verse}`;
  return `${s.book}-${s.chapter}-${s.verse}-${e.chapter}-${e.verse}`;
}

/** 'MRK-1-1-13' -> {book, start:'41001001', end:'41001013', passage:'MRK 1:1-13'} */
export function parsePericope(id) {
  const m = id.match(/^([1-3A-Z]{3})-(\d{1,3})-(\d{1,3})(?:-(\d{1,3}))?(?:-(\d{1,3}))?$/);
  assert(m, `bad pericope id ${id}`);
  const [, book, c1, v1, x, y] = m;
  const bn = String(bookNumber(book)).padStart(2, '0');
  const pad = (c, v) => `${bn}${String(c).padStart(3, '0')}${String(v).padStart(3, '0')}`;
  let c2 = c1, v2 = v1;
  if (y !== undefined) { c2 = x; v2 = y; } else if (x !== undefined) { v2 = x; }
  const passage = c1 === c2 ? `${book} ${c1}:${v1}-${v2}` : `${book} ${c1}:${v1}-${c2}:${v2}`;
  return { book, start: pad(c1, v1), end: pad(c2, v2), passage };
}

export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return refNumber(aStart) <= refNumber(bEnd) && refNumber(bStart) <= refNumber(aEnd);
}

// ---- Guide HTML -> steps/units (ported from PoC content-lib.mjs) ------------
export function plainText(html) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', mdash: '—', ndash: '–' };
  return html.replace(/<[^>]*>/g, '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, entity) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number(entity.slice(1)));
    return entity in entities ? entities[entity] : m;
  }).replace(/\s+/gu, ' ').trim();
}

/** Pause/stop detection: a unit that tells the group to pause the recording. Multilingual keyword net; recorded as a
 *  'discussion' stop after the unit. Terminal stop is always the last unit of S06. */
const PAUSE_RE = /\b(pause|pausa|pauser|pausez|mettez en pause|pausa\w*|jeda|hentikan|pumzika|simamisha|prestem|stopim|stop\w*|рауза|пауза|остановит\w*|توقف|أوقف|रोक\w*|रुक\w*|रोकें|रोक्\w*|暂停|暫停|停)\b/iu;
export function isPauseDirective(text) {
  return PAUSE_RE.test(text) && /(recording|rikoding|record|grabaci|enregistr|rekaman|kinasa|kurekodi|áudio|audio|gravaç|запис|التسجيل|रिकॉर्डिंग|录音|錄音|録音|odio)/iu.test(text);
}

export function guideSteps(html) {
  const sections = [...html.matchAll(/<h2>(.*?)<\/h2>([\s\S]*?)(?=<h2>|$)/g)];
  return sections.map((section, index) => {
    const id = `S${String(index + 1).padStart(2, '0')}`;
    const units = [...section[2].matchAll(/<(p|li|h3|h4)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((match, i) => {
      const text = plainText(match[2]);
      const tag = match[1];
      const kind = tag === 'li' ? 'list-item' : (tag === 'h3' || tag === 'h4') ? 'heading' : (/<(i|em)>\s*(example|ejemplo|exemple|exemplo|contoh|mfano)/i.test(match[2]) ? 'example' : 'paragraph');
      return { id: `${id}-U${String(i + 1).padStart(3, '0')}`, tag, html: match[2], text, textSha256: sha256(text), kind, pause: isPauseDirective(text) };
    }).filter((u) => u.text.length > 0);
    return { id, title: plainText(section[1]), units };
  });
}

export function guideUnitsDocument(packId, guideHtml, steps) {
  const stops = [];
  let n = 0;
  for (const step of steps) for (const unit of step.units) {
    if (unit.pause) stops.push({ id: `stop-${String(++n).padStart(3, '0')}`, afterUnitId: unit.id, kind: 'discussion', promptSha256: unit.textSha256 });
  }
  const last = steps.at(-1)?.units.at(-1);
  if (last) stops.push({ id: `stop-${String(++n).padStart(3, '0')}`, afterUnitId: last.id, kind: 'terminal' });
  return {
    schemaVersion: 1, packId, guideSha256: sha256(guideHtml),
    steps: steps.slice(0, 6).map((s) => ({ id: s.id, title: s.title, units: s.units.map((u) => ({ id: u.id, textSha256: u.textSha256, kind: u.kind, ...(u.resources?.length ? { resources: u.resources } : {}) })) })),
    stops,
  };
}

export const LANGUAGE_INFO = {
  eng: { autonym: 'English', name: 'English', direction: 'ltr', script: 'Latn' },
  arb: { autonym: 'العربية', name: 'Arabic', direction: 'rtl', script: 'Arab' },
  hin: { autonym: 'हिन्दी', name: 'Hindi', direction: 'ltr', script: 'Deva' },
  ind: { autonym: 'Bahasa Indonesia', name: 'Indonesian', direction: 'ltr', script: 'Latn' },
  por: { autonym: 'Português', name: 'Portuguese', direction: 'ltr', script: 'Latn' },
  fra: { autonym: 'Français', name: 'French', direction: 'ltr', script: 'Latn' },
  swh: { autonym: 'Kiswahili', name: 'Swahili', direction: 'ltr', script: 'Latn' },
  spa: { autonym: 'Español', name: 'Spanish', direction: 'ltr', script: 'Latn' },
  zhs: { autonym: '简体中文', name: 'Chinese (Simplified)', direction: 'ltr', script: 'Hans' },
  zht: { autonym: '繁體中文', name: 'Chinese (Traditional)', direction: 'ltr', script: 'Hant' },
  nep: { autonym: 'नेपाली', name: 'Nepali', direction: 'ltr', script: 'Deva' },
  rus: { autonym: 'Русский', name: 'Russian', direction: 'ltr', script: 'Cyrl' },
  hau: { autonym: 'Hausa', name: 'Hausa', direction: 'ltr', script: 'Latn' },
  apd: { autonym: 'عربي سوداني', name: 'Sudanese Arabic', direction: 'rtl', script: 'Arab' },
  bis: { autonym: 'Bislama', name: 'Bislama', direction: 'ltr', script: 'Latn' },
  tpi: { autonym: 'Tok Pisin', name: 'Tok Pisin', direction: 'ltr', script: 'Latn' },
  fas: { autonym: 'فارسی', name: 'Persian', direction: 'rtl', script: 'Arab' },
};

export const stableJson = (v) => JSON.stringify(v, null, 2) + '\n';
