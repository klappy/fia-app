// C-03 catalog manifest: languages x pericopes x resource types, from pinned Aquifer files.
// Reads <lang>/metadata.json + <lang>/json/NN.content.json directly (MCP browse fails on the large English files).
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assert, bookFile2, bookNumber, bookUsfm, DATA_ROOT, fetchJson, fetchPinned, LANGUAGE_INFO, loadSources, parseRef, pericopeId, plainText, pmap, rangesOverlap, sha256, stableJson, guideSteps, headPinned } from './lib.mjs';

const FIA = { guide: 'FIATranslationGuide', image: 'FIAImages', map: 'FIAMaps', term: 'FIAKeyTerms', video: 'VideoBibleDictionary' };
// Text-tier estimate for pericopes with no built pack (calibrated below against the packs that are built). Phone/Medium/Original are
// not emitted until a pack publishes them (R-307): the pack format (C-02) ships only the Text tier today.
const EST = { verseBytes: 160 };

/** Bytes per tier exactly as a save downloads them: sum of the files the C-02 pack manifest lists per tier (R-307). */
export function packTierBytes(packManifest) {
  return Object.fromEntries(Object.entries(packManifest.tiers || {}).map(([tier, t]) => [tier, (t.files || []).reduce((n, f) => n + f.bytes, 0)]));
}

/** Term supplements per packId (term-supplements.json): terms the passage-overlap rule misses because FIAKeyTerms caps
 * associations.passage at 100. The same file pericope.mjs reads for the pack, so catalog and pack count the same terms. */
export async function readTermSupplements(file = new URL('../term-supplements.json', import.meta.url)) {
  const doc = JSON.parse(await readFile(file, 'utf8'));
  return Object.fromEntries(Object.entries(doc.packs || {}).map(([packId, p]) => [packId, new Set(p.terms || [])]));
}

/** Key-term Text articles for one catalog entry: passage overlap plus the pack's supplement ids, overlap first, no duplicates. */
export function entryTerms(termItems, overlaps, supplementIds = new Set()) {
  const text = termItems.filter((i) => i.mediaType === 'Text');
  const byOverlap = text.filter(overlaps);
  const seen = new Set(byOverlap.map((i) => i.contentId));
  return [...byOverlap, ...text.filter((i) => supplementIds.has(i.contentId) && !seen.has(i.contentId))];
}

/** Built pack manifests under data/packs, keyed by packId. */
export async function readBuiltPacks(dataRoot = DATA_ROOT) {
  const dir = path.join(dataRoot, 'packs');
  let ids = [];
  try { ids = await readdir(dir); } catch { return {}; }
  const out = {};
  for (const id of ids) { try { out[id] = JSON.parse(await readFile(path.join(dir, id, 'manifest.json'), 'utf8')); } catch { /* not a pack dir */ } }
  return out;
}

async function loadMediaCollection(sources, repo, kind, log) {
  const sha = sources.fia[repo].commitSha;
  const meta = (await fetchJson(sources, repo, sha, 'eng/metadata.json')).json;
  const items = [];
  for (let i = 1; i < 200; i++) {
    const file = `eng/json/${String(i).padStart(3, '0')}.content.json`;
    const r = await fetchJson(sources, repo, sha, file, { allow404: true });
    if (r.status === 404) break;
    for (const a of r.json) {
      const passages = (a.associations?.passage || []).map((p) => ({ start: p.start_ref, end: p.end_ref }));
      const localizations = Object.keys(meta.article_metadata[a.content_id]?.localizations || {});
      items.push({ contentId: a.content_id, title: a.title, version: a.version, mediaType: a.media_type, kind, file, bytes: Buffer.byteLength(a.content), passages, localizations });
    }
  }
  log(`${repo}: ${items.length} eng articles, ${new Set(items.map((i) => i.file)).size} files`);
  return { repo, sha, items };
}

export async function buildCatalog({ appVersion = '0.2.0+0000000', log = console.error } = {}) {
  const sources = await loadSources();
  const languages = sources.languages;
  const guideRepo = FIA.guide, guideSha = sources.fia[guideRepo].commitSha;

  // 1. media collections (English passage associations; same asset bytes for every localization)
  const media = {};
  for (const [kind, repo] of Object.entries(FIA)) if (kind !== 'guide') media[kind] = await loadMediaCollection(sources, repo, kind, log);
  // key terms: text + audio pairs; per-language article sets from each language's metadata
  const termsByLang = {};
  await pmap(languages, 6, async (lang) => {
    const r = await fetchJson(sources, FIA.term, media.term.sha, `${lang}/metadata.json`, { allow404: true });
    termsByLang[lang] = r.json ? Object.keys(r.json.article_metadata) : [];
  });
  const termSupplements = await readTermSupplements();
  const termNumber = (id) => id.match(/-t(\d+)-/)?.[1];
  const langTermSets = Object.fromEntries(languages.map((l) => [l, { text: new Set(), audio: new Set() }]));
  for (const [l, ids] of Object.entries(termsByLang)) for (const id of ids) (id.endsWith('-audio') ? langTermSets[l].audio : langTermSets[l].text).add(termNumber(id));

  // 2. Bible editions per language, with book coverage probed for partial editions (metadata article_metadata is empty on Bible repos)
  const fiaBooks = new Set();
  const bibles = {};
  for (const b of sources.bibles) (bibles[b.language] ||= []).push({ ...b, books: null });

  // 3. guides per language
  const perLang = {};
  await pmap(languages, 4, async (lang) => {
    const meta = (await fetchJson(sources, guideRepo, guideSha, `${lang}/metadata.json`)).json;
    const skipped = [];
    const articles = Object.entries(meta.article_metadata).map(([id, a]) => ({ contentId: id, indexReference: a.index_reference, engContentId: a.localizations?.eng?.content_id || (lang === 'eng' ? id : null) }))
      .filter((a) => { try { pericopeId(a.indexReference); return true; } catch (e) { skipped.push({ contentId: a.contentId, indexReference: a.indexReference, reason: e.message }); return false; } });
    if (skipped.length) log(`${lang}: skipped ${skipped.length} article(s) with unparseable index_reference: ${skipped.map((s) => `${s.contentId}=${s.indexReference}`).join(', ')}`);
    const books = [...new Set(articles.map((a) => a.indexReference.slice(0, 2)))].sort();
    for (const b of books) fiaBooks.add(b);
    const contentById = {};
    const files = {};
    await pmap(books, 4, async (nn) => {
      const file = `${lang}/json/${nn}.content.json`;
      const r = await fetchJson(sources, guideRepo, guideSha, file, { allow404: true });
      if (!r.json) { log(`missing ${file}`); return; }
      files[file] = { sha256: r.sha256, bytes: r.bytes.length };
      for (const a of r.json) contentById[a.content_id] = { file, title: a.title, version: a.version, bytes: Buffer.byteLength(a.content), steps: guideSteps(a.content).length, contentSha256: sha256(a.content), reviewLevel: a.review_level };
    });
    perLang[lang] = { meta, articles, books, contentById, files, skipped };
    log(`${lang}: ${articles.length} pericopes, ${books.length} books, ${Object.keys(contentById).length} bodies`);
  });

  // probe partial Bibles for the FIA books only
  const fiaBookList = [...fiaBooks].sort();
  for (const list of Object.values(bibles)) for (const b of list) {
    if (b.wholeBible) { b.books = fiaBookList; continue; }
    b.books = (await pmap(fiaBookList, 8, async (nn) => (await headPinned(sources, b.repo, b.commitSha, `${b.language}/json/${nn}.content.json`)) ? nn : null)).filter(Boolean);
    log(`${b.repo}: ${b.books.length}/${fiaBookList.length} FIA books`);
  }

  // 4. entries
  const manifestEntries = [];
  const perLangOut = {};
  const coverage = {};
  const engMeta = perLang.eng;
  for (const lang of languages) {
    const L = perLang[lang];
    const entries = [];
    const langCounts = { pericopes: 0, books: L.books.length, guideUnitsEstimate: 0, scriptureEditions: (bibles[lang] || []).length, terms: langTermSets[lang].text.size, termAudio: langTermSets[lang].audio.size,
      images: media.image.items.filter((i) => lang === 'eng' || i.localizations.includes(lang)).length, maps: lang === 'eng' ? media.map.items.length : 0,
      videos: media.video.items.filter((i) => lang === 'eng' || i.localizations.includes(lang)).length };
    for (const a of L.articles) {
      const pericope = pericopeId(a.indexReference);
      const [start, endRef] = a.indexReference.split('-'); const end = endRef || start; // 4 upstream articles carry a single ref (e.g. 54006002 '1 Timothy 6:2f–10')
      const body = L.contentById[a.contentId];
      const book = pericope.split('-')[0];
      const nn = bookFile2(book);
      const overlap = (item) => item.passages.some((p) => rangesOverlap(start, end, p.start, p.end));
      const terms = entryTerms(media.term.items, overlap, termSupplements[`${lang}.${pericope}`]);
      const images = media.image.items.filter(overlap);
      const maps = media.map.items.filter(overlap);
      const videos = media.video.items.filter(overlap);
      const editions = (bibles[lang] || []).filter((b) => b.books.includes(nn));
      const engEditions = (bibles.eng || []).filter((b) => b.books.includes(nn));
      const verses = parseRef(end).n - parseRef(start).n + 1; // over-estimate across chapters; fine for sizing
      const slot = (present, fallback, ai, generator) => present ? { status: 'source' } : fallback ? { status: 'absent', fallback: 'eng', ai, ...(ai ? { generator } : {}) } : { status: 'absent', ai: false };
      const termSlots = terms.map((t) => { const n = termNumber(t.contentId); const hasText = lang === 'eng' || langTermSets[lang].text.has(n); const hasAudio = langTermSets[lang].audio.has(n); return { sourceId: t.contentId.replace(/^eng-/, `${lang}-`), engSourceId: t.contentId, title: t.title, text: slot(hasText, true, true, 'translation'), audio: hasAudio ? { status: 'source' } : { status: 'absent', ai: true, generator: 'narration' } }; });
      const imageSlots = images.map((i) => ({ sourceId: i.contentId, title: i.title, localizedTitle: lang === 'eng' || i.localizations.includes(lang) ? { status: 'source' } : { status: 'absent', fallback: 'eng', ai: true, generator: 'translation' }, description: { status: 'absent', ai: true, generator: 'description' } }));
      const mapSlots = maps.map((m) => ({ sourceId: m.contentId, title: m.title, localizedTitle: lang === 'eng' ? { status: 'source' } : { status: 'absent', fallback: 'eng', ai: false, badge: 'not-yet-in-language' }, description: { status: 'absent', ai: true, generator: 'description' } }));
      const videoSlots = videos.map((v) => ({ sourceId: v.contentId, title: v.title, localizedTitle: lang === 'eng' || v.localizations.includes(lang) ? { status: 'source' } : { status: 'absent', fallback: 'eng', ai: true, generator: 'translation' }, packaged: false }));
      const scriptureSlots = editions.length ? editions.map((b) => ({ repo: b.repo, short: b.short, status: 'source' })) : engEditions.map((b) => ({ repo: b.repo, short: b.short, status: 'absent-fallback', fallback: 'eng', ai: false, badge: 'not-yet-in-language' }));
      const unitsEstimate = body ? Math.max(1, Math.round(body.bytes / 260)) : 0; // ≈ measured PoC ratio (117 units / 30 KB)
      const resourceTypes = ['guide', ...(editions.length ? ['scripture'] : []), ...(terms.length ? ['term'] : []), ...(images.length ? ['image'] : []), ...(maps.length ? ['map'] : []), ...(videos.length ? ['video'] : []), ...(termSlots.some((t) => t.audio.status === 'source') ? ['audio'] : [])];
      const termTextBytes = terms.reduce((s, t) => s + t.bytes, 0);
      const textBytes = (body?.bytes || 0) + editions.length * verses * EST.verseBytes + termTextBytes;
      const termAudioSource = termSlots.filter((t) => t.audio.status === 'source').length;
      const tierBytes = { text: textBytes }; // raw estimate; replaced below by the pack manifest (built) or the calibrated estimate
      const provenance = {
        text: { source: (body ? 1 : 0) + editions.length + termSlots.filter((t) => t.text.status === 'source').length, generated: 0, missing: termSlots.filter((t) => t.text.status !== 'source').length + (editions.length ? 0 : engEditions.length) },
        audio: { source: termAudioSource, generated: 0, missing: unitsEstimate + (termSlots.length - termAudioSource) },
        description: { source: 0, generated: 0, missing: images.length + maps.length },
      };
      const sourceRevisions = { [guideRepo]: guideSha, ...(terms.length ? { FIAKeyTerms: media.term.sha } : {}), ...(images.length ? { FIAImages: media.image.sha } : {}), ...(maps.length ? { FIAMaps: media.map.sha } : {}), ...(videos.length ? { VideoBibleDictionary: media.video.sha } : {}), ...Object.fromEntries((editions.length ? editions : engEditions).map((b) => [b.repo, b.commitSha])) };
      const detail = { packId: `${lang}.${pericope}`, language: lang, pericope, book, sourceId: a.contentId, engSourceId: a.engContentId, indexReference: a.indexReference, title: body?.title || a.contentId, version: body?.version, reviewLevel: body?.reviewLevel,
        guide: body ? { file: body.file, contentSha256: body.contentSha256, bytes: body.bytes, steps: body.steps, unitsEstimate, narration: { status: 'absent', ai: true, generator: 'narration' } } : { status: 'missing' },
        scripture: scriptureSlots, terms: termSlots, images: imageSlots, maps: mapSlots, videos: videoSlots, resourceTypes, tierBytes, tierBytesAreEstimates: true, tierBytesSource: 'estimate', provenance, sourceRevisions };
      entries.push(detail);
      manifestEntries.push({ packId: detail.packId, language: lang, pericope, book, title: detail.title, resourceTypes, tierBytes, sourceRevision: sha256(JSON.stringify(sourceRevisions)), provenance, manifestSha256: null });
      langCounts.pericopes++; langCounts.guideUnitsEstimate += unitsEstimate;
    }
    perLangOut[lang] = { schemaVersion: 1, language: lang, ...LANGUAGE_INFO[lang], builtAt: null, counts: langCounts, books: L.books.map(bookUsfm), files: L.files, skipped: L.skipped, entries };
    coverage[lang] = langCounts;
  }

  // 5. tier sizes (R-307): a built pack's manifest is the truth (sum of its listed file bytes per published tier); every other entry
  // gets a Text-only estimate scaled by the measured/estimated ratio of the built packs. Tiers a pack does not publish are absent (C-03).
  const built = await readBuiltPacks();
  const details = Object.fromEntries(Object.values(perLangOut).flatMap((d) => d.entries).map((e) => [e.packId, e]));
  const ratios = manifestEntries.filter((e) => built[e.packId] && e.tierBytes.text > 0).map((e) => packTierBytes(built[e.packId]).text / e.tierBytes.text);
  const textCalibration = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1;
  log(`tier sizes: ${ratios.length} built pack(s) measured; text estimate calibration x${textCalibration.toFixed(3)}`);
  for (const e of manifestEntries) {
    const d = details[e.packId];
    const measured = built[e.packId] ? packTierBytes(built[e.packId]) : null;
    e.tierBytes = measured || { text: Math.round(e.tierBytes.text * textCalibration) };
    Object.assign(d, { tierBytes: e.tierBytes, tierBytesAreEstimates: !measured, tierBytesSource: measured ? 'pack-manifest' : 'estimate' });
    e.manifestSha256 = sha256(JSON.stringify(d));
  }

  const builtAt = new Date().toISOString();
  const manifest = { schemaVersion: 1, builtAt, appVersion, languages: languages.map((code) => ({ code, ...LANGUAGE_INFO[code] })), entries: manifestEntries };
  const outDir = path.join(DATA_ROOT, 'catalog');
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'manifest.json'), stableJson(manifest));
  for (const [lang, doc] of Object.entries(perLangOut)) { doc.builtAt = builtAt; await writeFile(path.join(outDir, `${lang}.json`), JSON.stringify(doc) + '\n'); }
  await writeFile(path.join(outDir, 'COVERAGE.md'), coverageMarkdown(coverage, sources, builtAt));
  return { manifest, coverage };
}


export function coverageMarkdown(coverage, sources, builtAt) {
  const rows = Object.entries(coverage).map(([l, c]) => `| ${l} | ${c.pericopes} | ${c.books} | ${c.scriptureEditions || '—'} | ${c.terms || '—'} | ${c.termAudio || '—'} | ${c.images || '—'} | ${c.maps || '—'} | ${c.videos || '—'} | ${c.guideUnitsEstimate} |`);
  return `# FIA Alpha catalog coverage\n\nGenerated ${builtAt} by \`@fia-app/pipeline\` (\`npm run catalog\`). Counts are what Aquifer has per language at the pinned commits in \`pipeline/sources.json\` (FIATranslationGuide @ ${sources.fia.FIATranslationGuide.commitSha.slice(0, 7)}). "—" = nothing on Aquifer for that language: the app shows the English item badged (maps, Scripture where the language has none) or an AI-backfill slot marked \`ai: true\` (term text, image/video titles, narration, descriptions). Nothing is invented; Scripture is never AI-backfilled.\n\n| Lang | Guide pericopes | Books | Scripture editions | Key terms (text) | Key-term audio | Images (localized title) | Maps | Videos (localized title) | Guide units (est.) |\n|---|---|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n\nGuide units are estimated from body bytes (≈260 B/unit, PoC ratio); a built pack carries the exact count. Maps are English-only on Aquifer and are served to every language badged "not yet in <language>". Image and video bytes are the same for every localization; only titles are localized.\n`;
}
