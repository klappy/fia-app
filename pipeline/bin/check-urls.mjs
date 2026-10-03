#!/usr/bin/env node
// Network half of the content checks (Mark ticket item 2): every image/map/video/term-audio URL a pack points at
// answers 200, and the Aquifer file it was read from answers 200 at the repo's pinned sha. Not in CI (it depends
// on S3 and raw.githubusercontent.com being reachable); run before a release or after `npm run pack`.
//   node bin/check-urls.mjs [--book MRK]
import { listPacks, loadPack, mediaUrls } from '../src/content-check.mjs';
import { loadSources, rawUrl, USER_AGENT } from '../src/lib.mjs';

const args = process.argv.slice(2);
const book = args.includes('--book') ? args[args.indexOf('--book') + 1] : null;
const sources = await loadSources();
const REPO = { image: 'FIAImages', map: 'FIAMaps', video: 'VideoBibleDictionary', 'term-audio': 'FIAKeyTerms' };

const targets = new Map(); // url -> [where]
const note = (url, where) => targets.set(url, [...(targets.get(url) || []), where]);
for (const id of listPacks(undefined, (p) => !book || p.split('.')[1].startsWith(`${book}-`))) {
  const pack = loadPack(id);
  for (const m of mediaUrls(pack)) {
    note(m.url, `${id} ${m.kind} ${m.id}`);
    const repo = REPO[m.kind];
    const sha = pack.manifest.sourceRevisions?.[repo] || sources.fia[repo].commitSha;
    if (m.sourceFile) note(rawUrl(sources, repo, sha, m.sourceFile), `${id} ${repo}@${sha.slice(0, 7)}:${m.sourceFile}`);
  }
}

async function status(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { method: 'HEAD', headers: { 'user-agent': USER_AGENT }, redirect: 'follow' });
      if (r.status < 500 && r.status !== 429) return r.status;
    } catch (err) { if (attempt === 2) return `error ${err.cause?.code || err.message}`; }
    await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
  }
  return 'retries exhausted';
}

const urls = [...targets.keys()];
const bad = [];
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < urls.length) {
    const url = urls[next++];
    const s = await status(url);
    if (s !== 200) bad.push({ url, status: s, usedBy: targets.get(url) });
  }
}));
for (const b of bad) console.error(`FAIL ${b.status} ${b.url} (${b.usedBy.length} use(s), e.g. ${b.usedBy[0]})`);
console.error(`url check: ${urls.length} unique URLs, ${bad.length} not 200`);
process.exit(bad.length ? 1 : 0);
