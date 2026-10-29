// Builds sources/raw-unit-fragments.json: the minimal raw publisher fragments for each candidate gold unit, so tests can
// prove offline that no input carries a resource tag absent from raw source. It never fetches; pass local copies of
// the public BibleAquifer/FIATranslationGuide files and their whole-file sha256 is verified before use.
//
//   node scripts/association-eval/raw-fragments.mjs <dir-with-eb744452-tree> <dir-with-96bb023-tree>
// where each dir holds eng/json/41.content.json and spa/json/41.content.json at that revision.
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {collectCases} from './cases.mjs';

const sha256 = x => createHash('sha256').update(x).digest('hex');
export const RAW_REPOSITORY = 'BibleAquifer/FIATranslationGuide';
export const RAW_REVISIONS = Object.freeze({
  pinned: {revision: 'eb744452eb8d7c852caadde9d3181cddfe571119', files: {
    'eng/json/41.content.json': '7d22f64be2a993c583eef1cb47168be4be2ea8e1de92d4a02d2d93bf7c475a4c',
    'spa/json/41.content.json': 'f3115ec318cc774bdf463f278540e3cac6671ee13376e29dd7eeb6add18c078a'}},
  current: {revision: '96bb023ab1852ab8bdc3a469fcc820e9f9ea1e30', files: {
    'eng/json/41.content.json': 'b57450d0beb8b95e3e2722519ae79793879689aec3b54362fa5e5c59f272e893',
    'spa/json/41.content.json': 'fec6054321797d13eae301705630ebcf0fa8c6591b1effd21ade8a2d09443028'}},
});
const TAG = /<data\b[^>]*\bdata-resource-code="[^"]*"[^>]*>/g;
export const resourceTags = html => html.match(TAG) || [];
const strip = html => html.replace(/<[^>]+>/g, '');

// The raw fragment for a unit: the compiled unit html when it is an exact substring of the raw article, otherwise the
// innermost raw <p>/<li> element whose text equals the unit text.
function fragment(article, unit) {
  if (article.includes(unit.html)) return {match: 'exact-html', html: unit.html};
  const els = [...article.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(m => m[2]).filter(inner => strip(inner).trim() === unit.text.trim());
  if (els.length !== 1) throw Error(`raw-fragment-${els.length ? 'ambiguous' : 'absent'}:${unit.unitId}`);
  return {match: 'text-equal-element', html: els[0]};
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const [pinnedDir, currentDir] = process.argv.slice(2);
  if (!pinnedDir || !currentDir) throw Error('usage: raw-fragments.mjs <eb744452-dir> <96bb023-dir>');
  const dirs = {pinned: pinnedDir, current: currentDir}, articles = {};
  for (const [name, spec] of Object.entries(RAW_REVISIONS)) {
    articles[name] = {};
    for (const [path, want] of Object.entries(spec.files)) {
      const raw = readFileSync(join(dirs[name], path));
      if (sha256(raw) !== want) throw Error(`raw-file-sha-mismatch:${name}:${path}`);
      articles[name][path.slice(0, 3)] = new Map(JSON.parse(raw).map(a => [a.content_id, a.content]));
    }
  }
  const fragments = collectCases().built.map(({input}) => {
    const out = {caseId: input.caseId, contentId: input.source.guide.sourceId};
    for (const name of Object.keys(RAW_REVISIONS)) {
      const article = articles[name][input.language].get(input.source.guide.sourceId);
      if (!article) throw Error(`raw-article-absent:${name}:${input.source.guide.sourceId}`);
      const f = fragment(article, input.source.unit);
      out[name] = {match: f.match, html: f.html, htmlSha256: sha256(f.html), resourceTags: resourceTags(f.html)};
    }
    return out;
  });
  const doc = {schema: 'fia-association-eval-raw-fragments@1', repository: RAW_REPOSITORY,
    sources: Object.fromEntries(Object.entries(RAW_REVISIONS).map(([k, v]) => [k, {revision: v.revision,
      files: Object.entries(v.files).map(([path, sha]) => ({path, sha256: sha, url: `https://raw.githubusercontent.com/${RAW_REPOSITORY}/${v.revision}/${path}`}))}])),
    note: 'Minimal fragments of public CC BY-SA 4.0 guide text, one per candidate gold unit, kept only to prove input tags exist in raw publisher source. Read with the native GitHub raw read; no credential.',
    fragments};
  writeFileSync(new URL('./sources/raw-unit-fragments.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
  console.log(`${fragments.length} fragments`);
}
