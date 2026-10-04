import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createStamp} from '../../scripts/version-stamp.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyBuildParameters(root,version){
 const stamp=JSON.parse(readFileSync(new URL('version.json',root))),expected=createStamp();
 for(const key of ['version','commit','branch','built_by','attestation'])assert.equal(stamp[key],expected[key],`build identity ${key}`);
 assert.equal(stamp.version,version);assert.equal(stamp.built_at,stamp.builtAt);assert.ok(Number.isFinite(Date.parse(stamp.builtAt)));
 const index=readFileSync(new URL('index.html',root),'utf8');
 const tags=index.match(/<meta name="fia-release" content="[^"]*">/g)||[];
 assert.deepEqual(tags,[`<meta name="fia-release" content="${version}+${stamp.commit.slice(0,7)}">`]);
 const normalizedIndex=index.replace(tags[0],`<meta name="fia-release" content="${version}+0000000">`);
 const manifest=JSON.parse(readFileSync(new URL('offline/eng.MRK-1-1-13.json',root)));
 const shell=manifest.files.filter(f=>!f.path.startsWith('/content/')&&f.group==='core');
 const buildId=hash(JSON.stringify(shell)).slice(0,12);
 const sw=readFileSync(new URL('sw.js',root),'utf8');
 assert.equal((sw.match(/const VERSION='[a-f0-9]{12}'/g)||[]).length,1);
 assert.ok(sw.includes(`const VERSION='${buildId}'`),'SW identity must equal actual shell digest');
 return {normalizedIndex,indexHash:hash(normalizedIndex),indexBytes:Buffer.byteLength(normalizedIndex),buildId};
}
export function normalizeGenerated(path,bytes,p){
 if(path==='index.html')return p.normalizedIndex;
 if(path==='sw.js')return bytes.toString().replace(`const VERSION='${p.buildId}'`,"const VERSION='000000000000'");
 if(path==='offline-manifest.json'||path.startsWith('offline/')){
  const manifest=JSON.parse(bytes);const entries=manifest.files.filter(f=>f.path==='/index.html');assert.equal(entries.length,1);
  entries[0].sha256=p.indexHash;entries[0].bytes=p.indexBytes;
  manifest.revision=hash(JSON.stringify(manifest.files)).slice(0,12);
  return JSON.stringify(manifest);
 }
 return bytes;
}
