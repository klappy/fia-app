// Content checks per built pack (Mark eng+spa ticket item 2). Offline: reads only data/packs/<id>/*.json,
// data/rights/records.json and pipeline/sources.json. The network half (every image/map/video URL answers 200)
// lives in bin/check-urls.mjs, outside CI. Each check returns a list of problems; an empty list is a pass.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { DATA_ROOT, parsePericope, plainText, sha256 } from './lib.mjs';

// Verses per chapter (versification of the Aquifer Bibles' BBBCCCVVV refs). Books not listed here fall back to the
// union of the verse refs the pack's editions carry (a gap shared by every edition is then invisible).
export const VERSE_COUNTS = { MRK: [45, 28, 35, 41, 43, 56, 37, 38, 50, 52, 33, 44, 37, 72, 47, 20] };

// Verses that critical-text editions omit by design (the verse number is absent, not lost). Reported as `omitted`,
// never as a failure. Keyed by book; a verse missing anywhere else is a failure.
export const KNOWN_OMISSIONS = {
  MRK: { refs: ['41007016', '41009044', '41009046', '41011026', '41015028'] },
};

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

export function loadRightsIds(dataRoot = DATA_ROOT) {
  return new Set(readJson(path.join(dataRoot, 'rights', 'records.json')).map((r) => r.id));
}

export function listPacks(dataRoot = DATA_ROOT, filter = () => true) {
  const dir = path.join(dataRoot, 'packs');
  return readdirSync(dir).filter((d) => /^[a-z]{3}\./.test(d) && existsSync(path.join(dir, d, 'manifest.json')) && filter(d)).sort();
}

export function loadPack(packId, dataRoot = DATA_ROOT) {
  const dir = path.join(dataRoot, 'packs', packId);
  const pack = { id: packId };
  for (const f of ['manifest', 'guide', 'guide-units', 'scripture', 'resources', 'rights', 'narration', 'narration-plan']) {
    const file = path.join(dir, `${f}.json`);
    pack[f] = existsSync(file) ? readJson(file) : null;
  }
  return pack;
}

/** Expected BBBCCCVVV refs for a pericope range, from VERSE_COUNTS (null when the book is not tabled). */
export function expectedRefs(pericope) {
  const book = pericope.split('-')[0];
  const counts = VERSE_COUNTS[book];
  if (!counts) return null;
  const { start, end } = parsePericope(pericope);
  const s = String(start).padStart(8, '0'), e = String(end).padStart(8, '0');
  const bn = s.slice(0, 2);
  const refs = [];
  for (let c = Number(s.slice(2, 5)); c <= Number(e.slice(2, 5)); c++) {
    for (let v = 1; v <= counts[c - 1]; v++) {
      const ref = `${bn}${String(c).padStart(3, '0')}${String(v).padStart(3, '0')}`;
      if (ref >= s && ref <= e) refs.push(ref);
    }
  }
  return refs;
}

// 1. every guide step has units (guide.json and guide-units.json agree on steps and unit ids)
export function checkGuide(pack) {
  const out = [];
  if (!pack.guide || !pack['guide-units']) return [`${pack.id}: guide.json or guide-units.json missing`];
  const steps = pack.guide.steps || [];
  if (!steps.length) out.push(`${pack.id}: guide has no steps`);
  for (const s of steps) {
    if (!s.units?.length) out.push(`${pack.id}: guide step ${s.id} has no units`);
    for (const u of s.units || []) if (!u.text?.trim()) out.push(`${pack.id}: unit ${u.id} has no text`);
  }
  const unitIds = (doc) => doc.steps.map((s) => `${s.id}:${s.units.map((u) => u.id).join(',')}`).join('|');
  if (unitIds(pack.guide) !== unitIds(pack['guide-units'])) out.push(`${pack.id}: guide.json and guide-units.json disagree on steps/units`);
  return out;
}

// 2. every verse of the range has Scripture in each listed edition; the language's own editions are all present;
//    fallbacks are badged and never AI
export function checkScripture(pack, sources, omitted = []) {
  const out = [];
  const sc = pack.scripture;
  if (!sc) return [`${pack.id}: scripture.json missing`];
  if (sc.scriptureNeverAI !== true) out.push(`${pack.id}: scripture.json lacks scriptureNeverAI: true`);
  const lang = pack.manifest.language;
  const own = sources.bibles.filter((b) => b.language === lang).map((b) => b.short);
  const listed = sc.editions.map((e) => e.short);
  const sourceEds = sc.editions.filter((e) => e.status === 'source').map((e) => e.short);
  if (own.length) for (const s of own) if (!sourceEds.includes(s)) out.push(`${pack.id}: ${lang} edition ${s} is not in the pack as source`);
  if (!sc.editions.length) out.push(`${pack.id}: no Scripture editions`);
  const expected = expectedRefs(pack.manifest.pericope) || [...new Set(sc.editions.flatMap((e) => e.verses.map((v) => v.ref)))].sort();
  const known = new Set(KNOWN_OMISSIONS[pack.manifest.pericope.split('-')[0]]?.refs || []);
  for (const e of sc.editions) {
    if (e.ai === true || e.provenance?.status === 'generated') out.push(`${pack.id}: edition ${e.short} is marked AI — Scripture is never AI`);
    if (e.status === 'absent-fallback' && !(e.badge && e.fallback && e.ai === false)) out.push(`${pack.id}: fallback edition ${e.short} is not badged (badge, fallback, ai:false)`);
    if (!['source', 'absent-fallback'].includes(e.status)) out.push(`${pack.id}: edition ${e.short} has status ${e.status}`);
    const have = new Map(e.verses.map((v) => [v.ref, v]));
    // A bridged verse (usfm "Mark 5:7-8", one entry at ref 41005007) covers every verse of its bridge.
    for (const v of e.verses) {
      const b = v.usfm?.match(/:(\d+)-(\d+)$/);
      if (!b) continue;
      for (let n = Number(b[1]) + 1; n <= Number(b[2]); n++) {
        const ref = `${v.ref.slice(0, 5)}${String(n).padStart(3, '0')}`;
        if (!have.has(ref)) have.set(ref, v);
      }
    }
    for (const ref of expected) {
      const v = have.get(ref);
      if (v && v.text?.trim()) continue;
      if (known.has(ref)) { omitted.push(`${pack.id} ${e.short} ${ref}`); continue; }
      out.push(`${pack.id}: ${e.short} has no text for ${ref}`);
    }
  }
  if (listed.length !== new Set(listed).size) out.push(`${pack.id}: duplicate edition in scripture.json`);
  return out;
}

// 4. every rights line resolves to data/rights/records.json, and every source revision the pack uses has a line
export function checkRights(pack, rightsIds) {
  const out = [];
  if (!pack.rights) return [`${pack.id}: rights.json missing`];
  for (const s of pack.rights.sources) if (!rightsIds.has(s.id)) out.push(`${pack.id}: rights line ${s.id} is not in data/rights/records.json`);
  const lined = new Set(pack.rights.sources.map((s) => s.collection));
  for (const repo of Object.keys(pack.manifest.sourceRevisions || {})) if (!lined.has(repo)) out.push(`${pack.id}: source ${repo} has no rights line`);
  return out;
}

// 5. AI slots carry ai: true — anything absent with a generator, every generated narration slot; nothing that is
//    source-available claims to be AI
export function checkAiSlots(pack) {
  const out = [];
  const walk = (o, where) => {
    if (Array.isArray(o)) return o.forEach((v, i) => walk(v, `${where}[${i}]`));
    if (!o || typeof o !== 'object') return;
    if (o.status === 'absent' && o.generator && o.ai !== true) out.push(`${pack.id}: ${where} is an absent ${o.generator} slot without ai: true`);
    if (o.recordingSource === 'generated' && o.ai !== true) out.push(`${pack.id}: ${where} is generated without ai: true`);
    if (o.recordingSource === 'source' && o.ai === true) out.push(`${pack.id}: ${where} is a source recording marked ai: true`);
    for (const [k, v] of Object.entries(o)) walk(v, `${where}.${k}`);
  };
  for (const f of ['resources', 'narration-plan', 'narration', 'scripture']) walk(pack[f], f);
  if (pack.narration?.entries?.some((e) => e.recordingSource !== 'source' && e.ai !== true)) out.push(`${pack.id}: narration.json carries a non-source clip without ai: true`);
  return out;
}

/** Media URLs a pack points at (images, maps, videos, term recordings) — for bin/check-urls.mjs. */
export function mediaUrls(pack) {
  const r = pack.resources || {};
  const urls = [...(r.images || []), ...(r.maps || []), ...(r.videos || [])].map((m) => ({ id: m.id, kind: m.kind, url: m.url, sourceFile: m.sourceFile }));
  for (const t of r.terms || []) if (t.audio?.url) urls.push({ id: t.id, kind: 'term-audio', url: t.audio.url, sourceFile: t.sourceFile });
  return urls.filter((u) => u.url);
}

/**
 * Characters to synthesise for a pack's narration plan: every slot that would be generated (not a source
 * recording) whose text resolves in the pack by sha256. `clipChars` counts each clip; `uniqueChars` counts each
 * distinct text once. Slots whose text is not written yet (pending-script / pending-text) are counted, not sized.
 */
export function narrationChars(pack) {
  const texts = new Map();
  const add = (t) => { if (typeof t === 'string') texts.set(sha256(t), t); };
  for (const s of pack.guide?.steps || []) for (const u of s.units) add(u.text);
  for (const e of pack.scripture?.editions || []) add(e.verses.map((v) => v.text).join('\n'));
  for (const t of pack.resources?.terms || []) if (t.text?.html) add(plainText(t.text.html));
  const res = { slots: 0, sized: 0, unsized: 0, sourceRecordings: 0, clipChars: 0, uniqueChars: 0, byKind: {} };
  const seen = new Set();
  for (const e of pack['narration-plan']?.entries || []) {
    if (e.recordingSource === 'source') { res.sourceRecordings++; continue; }
    res.slots++;
    const text = typeof e.script === 'string' ? e.script : typeof e.text === 'string' ? e.text : e.sourceSha256 ? texts.get(e.sourceSha256) : undefined;
    if (text === undefined) { res.unsized++; continue; }
    const n = [...text].length;
    res.sized++;
    res.clipChars += n;
    res.byKind[e.kind] = (res.byKind[e.kind] || 0) + n;
    const key = sha256(text);
    if (!seen.has(key)) { seen.add(key); res.uniqueChars += n; }
  }
  return res;
}

export function checkPack(pack, { sources, rightsIds, omitted = [] }) {
  return [...checkGuide(pack), ...checkScripture(pack, sources, omitted), ...checkRights(pack, rightsIds), ...checkAiSlots(pack)];
}
