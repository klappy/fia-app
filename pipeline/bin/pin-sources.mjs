#!/usr/bin/env node
// Re-resolve every repo in sources.json to its current HEAD via `git ls-remote` and rewrite the pins (C-01 revision key).
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadSources, PIPELINE_ROOT, stableJson } from '../src/lib.mjs';
const sources = await loadSources();
const head = (repo) => execFileSync('git', ['ls-remote', `https://github.com/BibleAquifer/${repo}.git`, 'HEAD'], { encoding: 'utf8' }).split('\t')[0].trim();
for (const repo of Object.keys(sources.fia)) { const sha = head(repo); if (sha !== sources.fia[repo].commitSha) console.log(`${repo}: ${sources.fia[repo].commitSha.slice(0,7)} -> ${sha.slice(0,7)}`); sources.fia[repo].commitSha = sha; }
for (const b of sources.bibles) { const sha = head(b.repo); if (sha !== b.commitSha) console.log(`${b.repo}: ${b.commitSha.slice(0,7)} -> ${sha.slice(0,7)}`); b.commitSha = sha; }
sources.pinnedAt = new Date().toISOString().slice(0, 10);
await writeFile(path.join(PIPELINE_ROOT, 'sources.json'), stableJson(sources));
console.log('pinned', Object.keys(sources.fia).length + sources.bibles.length, 'repos');
