import {readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync, realpathSync, existsSync, statSync} from 'node:fs';
import {resolve, join, dirname, basename, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {compilePresentation, validatePresentationInput, sourceBinding, describe, digest, SOURCE, RECIPE} from './compile.mjs';

export const PREPARATION_RECIPE = '47a527c475d8926a9617c6e56363629c380623fa';
export const REGISTRY_SHA = '4aea7044189e7e6413deaff4e69c72e3b75ab4a1d72cf1dc63f4ced9cc4ec28c';
const root = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const load = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const lists = load('./lists.json'), examples = load('./examples.json');
const inventory = JSON.parse(gunzipSync(readFileSync(new URL('./source-packs.json.gz', import.meta.url)))).inventory;
const compilerSha = digest(readFileSync(new URL('./compile.mjs', import.meta.url)));
const implementationSha = digest(readFileSync(new URL('./incremental.mjs', import.meta.url)));
const buildSha = digest(readFileSync(new URL('./build.mjs', import.meta.url)));
const json = value => { validateJson(value); return JSON.stringify(value); };
function validateJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object') throw Error('non-json-input');
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) throw Error('non-json-input');
    for (let i = 0; i < value.length; i++) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) throw Error('non-json-input');
      validateJson(d.value);
    }
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype) throw Error('non-json-input');
    for (const key of Reflect.ownKeys(value)) {
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !Object.hasOwn(d, 'value') || !d.enumerable) throw Error('non-json-input');
      validateJson(d.value);
    }
  }
}
const orderedFiles = files => [...files].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
function validateAuthority(input, options) {
  json(input); json(options);
  validatePresentationInput(input, options);
  const id = input.manifest.packId;
  if (id === 'eng.MRK-1-1-13') throw Error('passthrough-not-cacheable');
  const expectedFiles = orderedFiles(inventory.filter(file => file.path.startsWith(`data/packs/${id}/`)));
  if (json(options.listEvidence) !== json(lists.packs.find(pack => pack.packId === id)) ||
      json(options.exampleEvidence) !== json(examples.packs.find(pack => pack.packId === id))) throw Error('unapproved-semantic-evidence');
  if (json(options.sourceFiles) !== json(expectedFiles)) throw Error('source-inventory-mismatch');
}
// This helper only calculates dependencies; it does not grant content authority.
export function presentationBuildKey(input, options, identities = {}) {
  json(input); json(options); json(identities);
  const binding = sourceBinding(input.manifest.packId);
  return digest(json({schema: 'fia-presentation-build@1', packId: input.manifest.packId,
    source: SOURCE, recipe: identities.recipe ?? RECIPE, preparationRecipe: PREPARATION_RECIPE,
    compilerSha: identities.compilerSha ?? compilerSha, implementationSha: identities.implementationSha ?? implementationSha,
    buildSha: identities.buildSha ?? buildSha,
    sourceObjects: input, sourceFiles: options.sourceFiles, listEvidence: options.listEvidence,
    exampleEvidence: options.exampleEvidence, sourceBinding: binding}));
}
function anchor() {
  try {
    const bytes = readFileSync(join(root, 'apps/web/public/content/registry.json'));
    if (digest(bytes) !== REGISTRY_SHA) return {reason: 'acceptance-anchor-mismatch'};
    return {registry: JSON.parse(bytes)};
  } catch { return {reason: 'acceptance-anchor-unavailable'}; }
}
function canonicalPath(path) {
  let current = resolve(path), tail = [];
  while (!existsSync(current)) {tail.unshift(basename(current)); const parent = dirname(current); if (parent === current) throw Error('invalid-cache-path'); current = parent;}
  return resolve(realpathSync(current), ...tail);
}
function inside(parent, child) {const part = relative(parent, child); return part === '' || !part.startsWith('..' + '/') && part !== '..' && !isAbsolute(part);}
export function validateCacheDirectory(directory, outputDirectory) {
  const cache = canonicalPath(directory);
  if (inside(canonicalPath(join(root, 'apps/web/public')), cache) || inside(canonicalPath(outputDirectory), cache)) throw Error('cache-inside-public-output');
  return cache;
}
function readEntry(path, id, key, accepted) {
  let entry;
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > Math.ceil(accepted.presentation.bytes / 3) * 4 + 1024) return {reason: 'cache-malformed'};
    entry = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {return {reason: error.code === 'ENOENT' ? 'cache-missing' : 'cache-malformed'};}
  if (!entry || Object.keys(entry).sort().join(',') !== 'buildKey,bytes,data,outputSha,packId,schema' || entry.schema !== 'fia-presentation-cache@1') return {reason: 'cache-malformed'};
  if (entry.packId !== id) return {reason: 'cache-wrong-pack'};
  if (entry.buildKey !== key) return {reason: 'cache-stale-key'};
  if (typeof entry.data !== 'string' || entry.bytes !== accepted.presentation.bytes || entry.outputSha !== accepted.presentation.sha256) return {reason: 'cache-unaccepted-output'};
  const bytes = Buffer.from(entry.data, 'base64');
  if (bytes.toString('base64') !== entry.data || bytes.length !== accepted.presentation.bytes || digest(bytes) !== accepted.presentation.sha256) return {reason: 'cache-corrupt'};
  return {bytes};
}
function writeEntry(path, id, key, bytes) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    mkdirSync(dirname(path), {recursive: true});
    writeFileSync(temp, JSON.stringify({schema: 'fia-presentation-cache@1', packId: id, buildKey: key,
      outputSha: digest(bytes), bytes: bytes.length, data: bytes.toString('base64')}), {flag: 'wx'});
    renameSync(temp, path);
    return null;
  } catch {return 'cache-write-failed';}
  finally {try {unlinkSync(temp);} catch { /* No completed temp remains. */ }}
}
export function preparePresentation(input, options, {cacheDirectory = null, outputDirectory} = {}) {
  validateAuthority(input, options);
  const id = input.manifest.packId, buildKey = presentationBuildKey(input, options);
  const cache = cacheDirectory ? validateCacheDirectory(cacheDirectory, outputDirectory) : null;
  const authority = cache ? anchor() : {reason: 'cache-disabled'};
  const accepted = authority.registry?.packs.find(pack => pack.id === id);
  let reason = authority.reason ?? (!accepted ? 'output-not-accepted' : 'cache-missing');
  const path = cache && join(cache, `${id}.json`);
  if (cache && accepted) {
    const old = readEntry(path, id, buildKey, accepted);
    if (old.bytes) return {bytes: old.bytes, result: {pack: JSON.parse(old.bytes), capabilities: structuredClone(accepted.capabilities),
      defaultScriptureId: accepted.defaultScriptureId, diagnostics: structuredClone(accepted.diagnostics)}, receipt: {disposition: 'reused', buildKey}};
    reason = old.reason;
  }
  const result = compilePresentation(input, options), bytes = Buffer.from(JSON.stringify(result.pack, null, 2) + '\n');
  const descriptor = describe(input.manifest, bytes, result);
  let cacheWrite = null;
  if (cache && accepted && json(descriptor) === json(accepted)) cacheWrite = writeEntry(path, id, buildKey, bytes);
  else if (cache && accepted) cacheWrite = 'fresh-output-not-accepted';
  return {bytes, result, receipt: {disposition: 'built', buildKey, reason, ...(cacheWrite ? {cacheWrite} : {})}};
}
