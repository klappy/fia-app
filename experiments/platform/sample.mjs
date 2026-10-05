// Borrowed sample (6B: borrow by reference): one accepted bundled recording,
// read in place and checked against the shipped audio manifest. Never copied.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const SAMPLE_ID = process.env.PLATFORM_SAMPLE_ID || 'S05-U018';

export function resolveSample(id = SAMPLE_ID) {
  const manifest = JSON.parse(readFileSync(`${ROOT}apps/web/public/content/source/audio-manifest.json`, 'utf8'));
  const entry = manifest.entries.find(e => e.id === id);
  if (!entry) throw Error(`sample ${id} is not in audio-manifest.json`);
  const file = `${ROOT}apps/web/public${entry.path}`;
  const bytes = readFileSync(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== entry.sha256 || bytes.length !== entry.bytes) throw Error(`sample ${id} does not match its manifest identity`);
  return {id, path: entry.path, file, sha256, bytes: bytes.length, mime: entry.mime, duration: entry.duration, recordingSource: entry.recordingSource, ai: entry.ai};
}
