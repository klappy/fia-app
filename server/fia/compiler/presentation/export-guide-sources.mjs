import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
export const SOURCE_ARCHIVE_SHA256='48f8c768b108f2b9977048db26fa54c82af4eea7f54c66fa650ef84f7d61ecd7';
const hash=b=>createHash('sha256').update(b).digest('hex');
/** Packages already trusted raw guide metadata; never interprets or prepares it. */
export function exportGuideSources({outputRoot,sourceRevision,archiveBytes=readFileSync(new URL('./source-packs.json.gz',import.meta.url)),sourceBindings=JSON.parse(readFileSync(new URL('./source-bindings.json',import.meta.url)))}){
 if(hash(archiveBytes)!==SOURCE_ARCHIVE_SHA256)throw Error('canonical-source-archive-pin');
 const source=JSON.parse(gunzipSync(archiveBytes,{maxOutputLength:134217728}));
 if(!/^[a-f0-9]{40}$/.test(sourceRevision)||source.revision!==sourceRevision)throw Error('canonical-source-revision');
 const items=[];for(const [packId,pack]of Object.entries(source.packs)){
  if(!/^(eng|spa)\.(?:MRK|LUK)-[0-9-]+$/.test(packId)||pack.guide?.packId!==packId)throw Error('canonical-source-pack');
  const bytes=Buffer.from(JSON.stringify(pack.guide)),sha256=hash(bytes);
  if(bytes.length<1||bytes.length>1048576||sourceBindings[packId]?.guide!==sha256)throw Error('canonical-source-guide-pin');
  items.push({descriptor:{packId,sourceRevision,sha256,bytes:bytes.length,staticPath:`/content/source-guides/${sha256}.json`},bytes});
 }
 // All trust checks complete before writes; file names derive from verified bytes.
 const dir=resolve(outputRoot,'content/source-guides');mkdirSync(dir,{recursive:true});
 for(const item of items)writeFileSync(join(dir,item.descriptor.sha256+'.json'),item.bytes);
 return items.map(item=>item.descriptor);
}
// Association inputs for the source-association index, one content-addressed file per pack beside its guide: the pack's compiled
// manifest, resources and guide-units (each checked against source-bindings.json before any write, as the guide is) and the pack's
// archive inventory rows. Rows have the canonical-source shape, so the Worker reads them through the same re-hashing reader.
export const ASSOCIATION_SOURCE_SCHEMA='fia-association-source@1';
export function exportAssociationSources({outputRoot,sourceRevision,archiveBytes=readFileSync(new URL('./source-packs.json.gz',import.meta.url)),sourceBindings=JSON.parse(readFileSync(new URL('./source-bindings.json',import.meta.url)))}){
 if(hash(archiveBytes)!==SOURCE_ARCHIVE_SHA256)throw Error('canonical-source-archive-pin');
 const source=JSON.parse(gunzipSync(archiveBytes,{maxOutputLength:134217728}));
 if(!/^[a-f0-9]{40}$/.test(sourceRevision)||source.revision!==sourceRevision||!Array.isArray(source.inventory))throw Error('canonical-source-revision');
 const items=[];for(const [packId,pack]of Object.entries(source.packs)){
  if(!/^(eng|spa)\.(?:MRK|LUK)-[0-9-]+$/.test(packId)||pack.guide?.packId!==packId)throw Error('canonical-source-pack');
  for(const k of ['manifest','resources','guide-units'])if(!pack[k]||hash(Buffer.from(JSON.stringify(pack[k])))!==sourceBindings[packId]?.[k])throw Error('association-source-pin');
  const inventory=source.inventory.filter(f=>f.path.startsWith(`data/packs/${packId}/`)).map(f=>({path:f.path,bytes:f.bytes,sha256:f.sha256}));
  if(!inventory.some(f=>f.path===`data/packs/${packId}/guide.json`))throw Error('association-source-inventory');
  const bytes=Buffer.from(JSON.stringify({schema:ASSOCIATION_SOURCE_SCHEMA,packId,sourceRevision,manifest:pack.manifest,resources:pack.resources,'guide-units':pack['guide-units'],inventory})),sha256=hash(bytes);
  if(bytes.length>1048576)throw Error('association-source-size');
  items.push({descriptor:{packId,sourceRevision,sha256,bytes:bytes.length,staticPath:`/content/source-guides/${sha256}.json`},bytes});
 }
 const dir=resolve(outputRoot,'content/source-guides');mkdirSync(dir,{recursive:true});
 for(const item of items)writeFileSync(join(dir,item.descriptor.sha256+'.json'),item.bytes);
 return items.map(item=>item.descriptor);
}
