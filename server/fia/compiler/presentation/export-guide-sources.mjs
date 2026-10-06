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
  if(!/^(eng|spa)\.MRK-[0-9-]+$/.test(packId)||pack.guide?.packId!==packId)throw Error('canonical-source-pack');
  const bytes=Buffer.from(JSON.stringify(pack.guide)),sha256=hash(bytes);
  if(bytes.length<1||bytes.length>1048576||sourceBindings[packId]?.guide!==sha256)throw Error('canonical-source-guide-pin');
  items.push({descriptor:{packId,sourceRevision,sha256,bytes:bytes.length,staticPath:`/content/source-guides/${sha256}.json`},bytes});
 }
 // All trust checks complete before writes; file names derive from verified bytes.
 const dir=resolve(outputRoot,'content/source-guides');mkdirSync(dir,{recursive:true});
 for(const item of items)writeFileSync(join(dir,item.descriptor.sha256+'.json'),item.bytes);
 return items.map(item=>item.descriptor);
}
