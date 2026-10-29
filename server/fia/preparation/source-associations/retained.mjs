import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
// The retained source archives already in the repo (no network): Mark, plus Luke at the same source revision.
const ARCHIVES=['../../compiler/presentation/source-packs.json.gz','../../compiler/presentation/source-packs-luk.json.gz'];
export function readRetainedArchives(paths=ARCHIVES.map(p=>new URL(p,import.meta.url))){return paths.map(p=>JSON.parse(gunzipSync(readFileSync(p))));}
