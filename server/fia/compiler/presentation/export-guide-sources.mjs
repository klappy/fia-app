import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
export const SOURCE_ARCHIVE_SHA256='48f8c768b108f2b9977048db26fa54c82af4eea7f54c66fa650ef84f7d61ecd7';
// Further books ship as sibling retained archives at the same source revision (build.mjs); each is pinned by its own bytes.
export const LUKE_SOURCE_ARCHIVE_SHA256='98537437857e748d48ce8ad639c95a6b9a8b61b315594ffc1b94328fc0df0283';
const retained=(name,sha256)=>({name,sha256,bytes:readFileSync(new URL(`./${name}`,import.meta.url))});
const defaultArchives=()=>[retained('source-packs.json.gz',SOURCE_ARCHIVE_SHA256),retained('source-packs-luk.json.gz',LUKE_SOURCE_ARCHIVE_SHA256)];
const hash=b=>createHash('sha256').update(b).digest('hex');
/** Packages already trusted raw guide metadata; never interprets or prepares it. */
// archiveBytes (one Mark archive, the earlier interface) or archives ([{sha256, bytes}]) override the retained defaults for tests;
// every archive is checked against its own pin, so an override cannot substitute other bytes under a pinned name.
export function exportGuideSources({outputRoot,sourceRevision,archiveBytes,archives=archiveBytes===undefined?defaultArchives():[{sha256:SOURCE_ARCHIVE_SHA256,bytes:archiveBytes}],sourceBindings=JSON.parse(readFileSync(new URL('./source-bindings.json',import.meta.url)))}){
 if(!Array.isArray(archives)||!archives.length)throw Error('canonical-source-archive-pin');
 for(const a of archives)if(![SOURCE_ARCHIVE_SHA256,LUKE_SOURCE_ARCHIVE_SHA256].includes(a?.sha256)||hash(a.bytes)!==a.sha256)throw Error('canonical-source-archive-pin');
 if(!/^[a-f0-9]{40}$/.test(sourceRevision))throw Error('canonical-source-revision');
 const items=[],seen=new Set();for(const archive of archives){const source=JSON.parse(gunzipSync(archive.bytes,{maxOutputLength:134217728}));
 if(source.revision!==sourceRevision)throw Error('canonical-source-revision');
 for(const [packId,pack]of Object.entries(source.packs)){
  if(!/^(eng|spa)\.(?:MRK|LUK)-[0-9-]+$/.test(packId)||pack.guide?.packId!==packId)throw Error('canonical-source-pack');
  if(seen.has(packId))throw Error('canonical-source-duplicate-pack');seen.add(packId);
  const bytes=Buffer.from(JSON.stringify(pack.guide)),sha256=hash(bytes);
  if(bytes.length<1||bytes.length>1048576||sourceBindings[packId]?.guide!==sha256)throw Error('canonical-source-guide-pin');
  items.push({descriptor:{packId,sourceRevision,sha256,bytes:bytes.length,staticPath:`/content/source-guides/${sha256}.json`},bytes});
 }}
 // All trust checks complete before writes; file names derive from verified bytes.
 const dir=resolve(outputRoot,'content/source-guides');mkdirSync(dir,{recursive:true});
 for(const item of items)writeFileSync(join(dir,item.descriptor.sha256+'.json'),item.bytes);
 return items.map(item=>item.descriptor);
}
