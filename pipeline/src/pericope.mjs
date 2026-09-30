// One (language, pericope) content pack: C-02 manifest, C-04 guide units, scripture slice, resource references with
// C-08 derivative slots (no transcoding here), C-05 narration manifest shell (no AI generation in this lane; slots marked ai:true).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assert, bookFile2, DATA_ROOT, fetchJson, guideSteps, guideUnitsDocument, indexReferenceMatches, LANGUAGE_INFO, loadSources, parsePericope, parseRef, plainText, rangesOverlap, sha256, stableJson } from './lib.mjs';

const FIA = { image: 'FIAImages', map: 'FIAMaps', term: 'FIAKeyTerms', video: 'VideoBibleDictionary' };

async function mediaOverlapping(sources, repo, lang, start, end) {
  const sha = sources.fia[repo].commitSha;
  const meta = (await fetchJson(sources, repo, sha, 'eng/metadata.json')).json;
  const out = [];
  for (let i = 1; i < 200; i++) {
    const file = `eng/json/${String(i).padStart(3, '0')}.content.json`;
    const r = await fetchJson(sources, repo, sha, file, { allow404: true });
    if (r.status === 404) break;
    for (const a of r.json) {
      if (!(a.associations?.passage || []).some((p) => rangesOverlap(start, end, p.start_ref, p.end_ref))) continue;
      const loc = meta.article_metadata[a.content_id]?.localizations?.[lang];
      out.push({ article: a, file, fileSha256: r.sha256, localized: lang === 'eng' ? { contentId: a.content_id, title: a.title } : loc ? { contentId: loc.content_id, title: loc.title } : null, sha });
    }
  }
  return out;
}

const mediaUrl = (html) => html.match(/href='([^']+\.(?:png|jpg|jpeg|mp3|mp4))'/)?.[1] || html.match(/src='([^']+)'/)?.[1] || null;
const guessBytes = (kind) => ({ image: 114_000, map: 6_646_608, audio: 1_455_212, video: 10_000_000 })[kind];
function derivativeSlots(kind, sourcePath, sourceSha256, sourceBytes) {
  // C-08 descriptors are only complete after transcoding; here we lay out the slots with the whitelisted recipes.
  const recipes = kind === 'audio' ? [['phone', 'a=opus,br=32k', 'audio/ogg'], ['medium', 'a=opus,br=64k', 'audio/ogg']] : [['phone', 'w=640,q=medium,f=webp', 'image/webp'], ['medium', 'w=1280,q=medium,f=webp', 'image/webp']];
  return recipes.map(([tier, recipe, mime]) => ({ sourcePath, sourceSha256, sourceBytes, kind, tier, recipe, mime, eligible: true, status: 'pending-transcode', ...(kind === 'audio' ? { fallbackMime: 'audio/mpeg' } : {}) }));
}

export async function buildPack(lang, pericope, { log = console.error } = {}) {
  const sources = await loadSources();
  assert(sources.languages.includes(lang), `unknown language ${lang}`);
  const { book, start, end, passage } = parsePericope(pericope);
  const packId = `${lang}.${pericope}`;
  const guideRepo = 'FIATranslationGuide', guideSha = sources.fia[guideRepo].commitSha;
  const nn = bookFile2(book);

  // guide
  const meta = (await fetchJson(sources, guideRepo, guideSha, `${lang}/metadata.json`)).json;
  const entry = Object.entries(meta.article_metadata).find(([, a]) => indexReferenceMatches(a.index_reference, start, end));
  assert(entry, `${lang} has no guide pericope ${pericope} (${start}-${end}) on Aquifer at ${guideSha.slice(0, 7)} — nothing invented`);
  const [contentId, am] = entry;
  const gf = await fetchJson(sources, guideRepo, guideSha, `${lang}/json/${nn}.content.json`);
  const article = gf.json.find((a) => a.content_id === contentId);
  assert(article, `content body ${contentId} missing in ${lang}/json/${nn}.content.json`);
  const steps = guideSteps(article.content);
  assert(steps.length === 6, `${contentId}: expected 6 <h2> steps, found ${steps.length}`);

  // key terms (text + audio), images, maps, videos by passage overlap
  const [terms, images, maps, videos] = await Promise.all([mediaOverlapping(sources, FIA.term, lang, start, end), mediaOverlapping(sources, FIA.image, lang, start, end), mediaOverlapping(sources, FIA.map, lang, start, end), mediaOverlapping(sources, FIA.video, lang, start, end)]);
  const termText = terms.filter((t) => t.article.media_type === 'Text');
  const termAudioByNumber = new Map(terms.filter((t) => t.article.media_type === 'Audio').map((t) => [t.article.content_id.match(/-t(\d+)-/)[1], t]));
  // localized term bodies + audio from the language's own files (only where the language has them)
  const termSha = sources.fia.FIAKeyTerms.commitSha;
  const langTermMeta = lang === 'eng' ? meta && null : (await fetchJson(sources, FIA.term, termSha, `${lang}/metadata.json`, { allow404: true })).json;
  const langTermIds = new Set(langTermMeta ? Object.keys(langTermMeta.article_metadata) : []);
  const langTermBodies = {};
  if (langTermMeta) for (let i = 1; i < 200; i++) {
    const r = await fetchJson(sources, FIA.term, termSha, `${lang}/json/${String(i).padStart(3, '0')}.content.json`, { allow404: true });
    if (r.status === 404) break;
    for (const a of r.json) langTermBodies[a.content_id] = a;
  }
  const termRecords = termText.map((t) => {
    const n = t.article.content_id.match(/-t(\d+)-/)[1];
    const localId = lang === 'eng' ? t.article.content_id : [...langTermIds].find((id) => id.match(/-t(\d+)-v/)?.[1] === n && !id.endsWith('-audio'));
    const local = lang === 'eng' ? t.article : localId && langTermBodies[localId];
    const audioLocalId = lang === 'eng' ? termAudioByNumber.get(n)?.article.content_id : [...langTermIds].find((id) => id.match(/-t(\d+)-v/)?.[1] === n && id.endsWith('-audio'));
    const audioArticle = lang === 'eng' ? termAudioByNumber.get(n)?.article : audioLocalId && langTermBodies[audioLocalId];
    const audioUrl = audioArticle ? mediaUrl(audioArticle.content) : null;
    return {
      id: `term-${lang}-t${n}`, termNumber: n, engSourceId: t.article.content_id, title: local ? local.title : t.article.title,
      text: local ? { status: 'source', sourceId: local.content_id, html: local.content, textSha256: sha256(plainText(local.content)), provenance: { status: 'source', collection: 'FIAKeyTerms', revision: termSha } }
        : { status: 'absent', fallback: 'eng', ai: true, generator: 'translation', engSourceId: t.article.content_id, html: t.article.content, provenance: { status: 'missing' }, generatedFromSlot: `FIAKeyTerms@${termSha}:${t.file}#${t.article.content_id}` },
      audio: audioUrl ? { status: 'source', sourceId: audioArticle.content_id, url: audioUrl, provenance: { status: 'source', collection: 'FIAKeyTerms', revision: termSha }, derivatives: derivativeSlots('audio', `/packs/${packId}/audio/${audioArticle.content_id}.mp3`, '0'.repeat(64), guessBytes('audio')) }
        : { status: 'absent', ai: true, generator: 'narration', provenance: { status: 'missing' } },
      passages: (t.article.associations?.passage || []).map((p) => `${p.start_ref_usfm}-${p.end_ref_usfm}`),
    };
  });
  const visual = (list, kind) => list.map((m) => ({ id: m.article.content_id, kind, title: m.localized?.title || m.article.title, titleProvenance: m.localized ? { status: 'source', collection: FIA[kind], revision: m.sha } : kind === 'map' ? { status: 'missing', badge: 'not-yet-in-language', fallback: 'eng', ai: false } : { status: 'missing', fallback: 'eng', ai: true, generator: 'translation' }, engTitle: m.article.title, url: mediaUrl(m.article.content), sourceFile: m.file, sourceFileSha256: m.fileSha256, description: { status: 'absent', ai: true, generator: 'description' }, packaged: kind !== 'video', ...(kind !== 'video' ? { derivatives: derivativeSlots('image', `/packs/${packId}/${kind}s/${m.article.content_id}.${kind === 'map' ? 'png' : 'jpg'}`, '0'.repeat(64), guessBytes(kind)) } : { streamOnly: true }) }));
  const resources = { schemaVersion: 1, packId, terms: termRecords, images: visual(images, 'image'), maps: visual(maps, 'map'), videos: visual(videos, 'video') };

  // attach terms to units by title mention (passage association is pericope-level; ACAI confidence is too low to auto-attach)
  const unitResources = {};
  for (const step of steps) for (const u of step.units) {
    const hits = termRecords.filter((t) => t.title && t.title.length > 2 && new RegExp(`(^|[^\\p{L}])${t.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu').test(u.text)).map((t) => t.id);
    const refs = [...u.html.matchAll(/data-content-id="([^"]+)"/g)].map((m) => m[1]);
    const all = [...new Set([...hits, ...refs])];
    if (all.length) { u.resources = all; unitResources[u.id] = all; }
  }
  const guideUnits = guideUnitsDocument(packId, article.content, steps);
  const guide = { schemaVersion: 1, packId, sourceId: contentId, engSourceId: am.localizations?.eng?.content_id || (lang === 'eng' ? contentId : null), title: article.title, version: article.version, reviewLevel: article.review_level, passage, sourceFile: `${lang}/json/${nn}.content.json`, sourceFileSha256: gf.sha256, contentSha256: sha256(article.content),
    provenance: { status: 'source', collection: guideRepo, revision: guideSha },
    steps: steps.map((s) => ({ id: s.id, title: s.title, units: s.units.map((u) => ({ id: u.id, kind: u.kind, html: u.html, text: u.text, textSha256: u.textSha256, pause: u.pause, ...(u.resources ? { resources: u.resources } : {}) })) })) };

  // scripture: every edition the language has on Aquifer for this book; else English editions marked absent-fallback (never AI)
  const own = sources.bibles.filter((b) => b.language === lang);
  const engEditions = sources.bibles.filter((b) => b.language === 'eng');
  const editions = [];
  const slice = async (b, fallback) => {
    const r = await fetchJson(sources, b.repo, b.commitSha, `${b.language}/json/${nn}.content.json`, { allow404: true });
    if (!r.json) return { repo: b.repo, short: b.short, language: b.language, status: 'absent', reason: `no ${book} in ${b.repo}` };
    const verses = r.json.filter((v) => rangesOverlap(start, end, v.index_reference, v.index_reference)).map((v) => ({ ref: v.index_reference, usfm: v.title, html: v.content, text: plainText(v.content), contentId: v.content_id, version: v.version, reviewLevel: v.review_level }));
    return { repo: b.repo, short: b.short, language: b.language, status: fallback ? 'absent-fallback' : 'source', ...(fallback ? { fallback: 'eng', ai: false, badge: 'not-yet-in-language' } : {}), provenance: { status: 'source', collection: b.repo, revision: b.commitSha }, sourceFile: `${b.language}/json/${nn}.content.json`, sourceFileSha256: r.sha256, verses, textSha256: sha256(verses.map((v) => v.text).join('\n')) };
  };
  for (const b of own) editions.push(await slice(b, false));
  const ownPresent = editions.filter((e) => e.status === 'source');
  if (!ownPresent.length) for (const b of engEditions) editions.push(await slice(b, true));
  const scripture = { schemaVersion: 1, packId, passage, scriptureNeverAI: true, editions };

  // narration manifest shell (C-05): no clips generated in this lane; plan lists every slot that M11 generates on demand server-side
  const narrationPlan = [];
  for (const s of steps) for (const u of s.units) narrationPlan.push({ id: u.id, sourceSha256: u.textSha256, ai: true, recordingSource: 'generated', generator: 'narration', generatedFrom: `${guideRepo}@${guideSha}:${lang}/json/${nn}.content.json#${contentId}/${u.id}`, status: 'pending' });
  for (const e of editions.filter((e) => e.verses)) narrationPlan.push({ id: `scripture-${e.short.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`, sourceSha256: e.textSha256, ai: true, recordingSource: 'generated', generator: 'narration', status: 'pending' });
  for (const t of termRecords) narrationPlan.push({ id: t.id, sourceSha256: t.text.textSha256 || null, ai: t.audio.status !== 'source', recordingSource: t.audio.status === 'source' ? 'source' : 'generated', status: t.audio.status === 'source' ? 'source-available' : 'pending' });
  const narration = { schemaVersion: 1, packId, language: lang, entries: [] };

  // write files, then the C-02 manifest with bytes + sha256 per file
  const dir = path.join(DATA_ROOT, 'packs', packId);
  await mkdir(dir, { recursive: true });
  const files = [];
  const put = async (name, doc) => { const bytes = Buffer.from(stableJson(doc)); await writeFile(path.join(dir, name), bytes); files.push({ path: `/packs/${packId}/${name}`, bytes: bytes.length, sha256: sha256(bytes), mime: 'application/json' }); };
  await put('guide.json', guide); await put('guide-units.json', guideUnits); await put('scripture.json', scripture); await put('resources.json', resources); await put('narration.json', narration); await put('narration-plan.json', { schemaVersion: 1, packId, strategy: 'M11 default: generated on demand server-side, cached, shipped marked ai:true; nothing generated in lane L1', entries: narrationPlan });
  const units = steps.reduce((n, s) => n + s.units.length, 0);
  // same rule as inventory.mjs: a media pin is recorded only when the pack has >=1 item of it, so catalog sourceRevision === sha256(this map) (C-03)
  const sourceRevisions = { [guideRepo]: guideSha, ...(termRecords.length ? { FIAKeyTerms: sources.fia.FIAKeyTerms.commitSha } : {}), ...(resources.images.length ? { FIAImages: sources.fia.FIAImages.commitSha } : {}), ...(resources.maps.length ? { FIAMaps: sources.fia.FIAMaps.commitSha } : {}), ...(resources.videos.length ? { VideoBibleDictionary: sources.fia.VideoBibleDictionary.commitSha } : {}), ...Object.fromEntries(editions.filter((e) => e.verses).map((e) => [e.repo, sources.bibles.find((b) => b.repo === e.repo).commitSha])) };
  const textBytes = files.reduce((n, f) => n + f.bytes, 0);
  const mediaRefs = [...resources.images, ...resources.maps];
  const termAudioSrc = termRecords.filter((t) => t.audio.status === 'source').length;
  const manifest = {
    schemaVersion: 1, packId, language: lang, direction: LANGUAGE_INFO[lang].direction, pericope, passage, preparedAt: new Date().toISOString(), sourceRevisions,
    resourceTypes: [...new Set(['guide', ...(ownPresent.length ? ['scripture'] : []), ...(termRecords.length ? ['term'] : []), ...(resources.images.length ? ['image'] : []), ...(resources.maps.length ? ['map'] : []), ...(resources.videos.length ? ['video'] : []), ...(termAudioSrc ? ['audio'] : [])])],
    tiers: { text: { bytes: textBytes, files } },
    counts: { steps: steps.length, units, stops: guideUnits.stops.length, terms: termRecords.length, termAudio: termAudioSrc, images: resources.images.length, maps: resources.maps.length, videos: resources.videos.length, scripture: ownPresent.length, scriptureFallback: editions.filter((e) => e.status === 'absent-fallback').length },
    provenance: { text: { source: units + ownPresent.length + termRecords.filter((t) => t.text.status === 'source').length, generated: 0, missing: termRecords.filter((t) => t.text.status !== 'source').length + (ownPresent.length ? 0 : editions.filter((e) => e.verses).length) }, audio: { source: termAudioSrc, generated: 0, missing: narrationPlan.filter((p) => p.status === 'pending').length }, description: { source: 0, generated: 0, missing: mediaRefs.length } },
    rights: [...new Set(Object.keys(sourceRevisions).map((repo) => `${repo}@${sourceRevisions[repo].slice(0, 7)}`))],
  };
  await writeFile(path.join(dir, 'manifest.json'), stableJson(manifest));
  log(`${packId}: ${steps.length} steps, ${units} units, ${guideUnits.stops.length} stops, ${termRecords.length} terms (${termAudioSrc} audio), ${resources.images.length} images, ${resources.maps.length} maps, ${resources.videos.length} videos, scripture ${editions.map((e) => `${e.short}:${e.status}`).join(',')}; text tier ${textBytes} B`);
  return { manifest, dir };
}
