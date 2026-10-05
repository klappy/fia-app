const sha=/^[a-f0-9]{64}$/;
const local=/^\/(?!\/|.*(?:\.\.|[?#]))/;
const pack=/^(eng|spa)\.MRK-\d+(?:-\d+)+$/;
const positive=n=>Number.isSafeInteger(n)&&n>0;
function videoKeys(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.split(',').sort().join(','))throw Error('Unknown or missing video contract field.');}
export function validateDeliveryIndex(index){
 if(index?.schema!==1||!Array.isArray(index.packs))throw Error('Invalid media delivery index.');
 const seen=new Set();
 for(const p of index.packs){const d=p.delivery;
  if(!pack.test(p.packId)||seen.has(p.packId)||!sha.test(p.presentationRevision)||!d||!sha.test(d.sha256)||!positive(d.bytes)||d.url!==`/content/delivery/${p.packId}/${d.sha256}.json`)throw Error('Invalid media delivery identity.');seen.add(p.packId);
 }return index;
}
export function validateDelivery(sidecar,identity){
 if(![1,2].includes(sidecar?.schema)||sidecar.packId!==identity.packId||sidecar.presentationRevision!==identity.presentationRevision||!sidecar.recipeRevision||!Array.isArray(sidecar.entries))throw Error('Media belongs to a different passage revision.');
 if(sidecar.schema===2){if(Object.keys(sidecar).sort().join(',')!=='entries,packId,presentationRevision,recipeRevision,schema,sourceLedger')throw Error('Unknown video sidecar field.');const l=sidecar.sourceLedger;videoKeys(l,'url,sha256,bytes');if(!l||!sha.test(l.sha256)||!positive(l.bytes)||l.url!==`/content/video-sources/${l.sha256}.json`)throw Error('Invalid video source ledger.');}
 const seen=new Set();
 for(const e of sidecar.entries){const s=e.source,d=e.delivery,t=e.timing;
  if(!local.test(e.path)||seen.has(e.path)||!s||!sha.test(s.sha256)||!positive(s.bytes)||!/^https:\/\//.test(s.url)||!d||!sha.test(d.sha256)||!positive(d.bytes)||!['audio','image','video'].includes(d.kind)||!['transformed','passthrough'].includes(d.status)||!d.format||!d.q)throw Error('Invalid media delivery entry.');
  const url=new URL(d.url);if(url.origin!=='https://transcode.klappy.dev'||!url.pathname.startsWith('/'+d.kind+'/')||url.username||url.password||url.hash||!d.url.endsWith('/'+s.url))throw Error('Unapproved media delivery URL.');
  if(d.status==='passthrough'&&(d.sha256!==s.sha256||d.bytes!==s.bytes))throw Error('Pass-through bytes changed.');
  if(d.duration!==undefined&&(!Number.isFinite(d.duration)||d.duration<=0))throw Error('Invalid recording duration.');
  if(d.kind==='image'&&(!positive(d.width)||!positive(d.height)))throw Error('Invalid image dimensions.');
  if(!['low','medium','high'].includes(d.q))throw Error('Invalid quality tier.');
  if(d.kind==='video'){if(sidecar.schema!==2)throw Error('Video requires delivery schema2.');validateVideoDelivery(e);}else if(e.logicalSource)throw Error('Source replacement is video-only.');
  const options=['audio','video'].includes(d.kind)?`preset=${d.preset},q=${d.q},f=${d.format}`:`q=${d.q},f=${d.format}`;
  if(d.kind==='audio'&&(d.preset!=='voice'||d.format!=='opus')||d.kind==='image'&&!['webp','avif','jpeg'].includes(d.format)||d.url!==`https://transcode.klappy.dev/${d.kind}/${options}/${s.url}`)throw Error('Delivery options do not match the URL.');
  if(!new RegExp('^'+d.kind+'/').test(d.mime))throw Error('Invalid media MIME.');
  if(!t||!['verified','not-applicable'].includes(t.status))throw Error('Media timing is not verified.');
  if(t.status==='verified'){
   if(t.sourceAudioSha256!==s.sha256||t.deliveryAudioSha256!==d.sha256||(t.alignmentSha256!==undefined&&!sha.test(t.alignmentSha256))||!t.method||!t.evidence)throw Error('Media timing identity does not match.');
   if(t.mapping&&(!Number.isFinite(t.mapping.scale)||t.mapping.scale<=0||!Number.isFinite(t.mapping.offsetSeconds)))throw Error('Invalid media time mapping.');
   if(t.alignment)throw Error('Calibrated alignment delivery is not supported by this adapter yet.');
  }
  seen.add(e.path);
 }return sidecar;
}

export function validateVideoDelivery(e){
 const d=e.delivery,l=e.logicalSource;
 videoKeys(e.source,'url,sha256,bytes,provenance');videoKeys(e.source.provenance,'metadata,rights,review');videoKeys(e.source.provenance.metadata,'repository,revision,path,sha256,contentId,assetVersion,collectionVersion');videoKeys(e.source.provenance.rights,'metadataPath,metadataSha256,holder,licenseUrl');videoKeys(e.source.provenance.review,'recipeRevision,evidenceUrl,evidenceSha256');
 videoKeys(d,'url,sha256,bytes,mime,kind,format,preset,q,status,duration,width,height,videoCodec,audioCodec,encoderRevision,recipeRevision,serverContractSha256,cacheKey,qualification');videoKeys(d.qualification,'evidenceUrl,evidenceSha256');
 if(Object.keys(e).sort().join(',')!=='delivery,logicalSource,path,source,timing')throw Error('Unknown video replacement field.');
 if(!l||Object.keys(l).sort().join(',')!=='assetId,bytes,ledgerEntryId,sha256'||!l.assetId||!l.ledgerEntryId||!sha.test(l.sha256)||!positive(l.bytes))throw Error('Invalid logical video source.');
 if(d.kind!=='video'||d.mime!=='video/mp4'||d.format!=='mp4'||d.preset!=='fia'||d.q!=='medium'||d.status!=='transformed'||d.videoCodec!=='h264'||d.audioCodec!=='aac'||!positive(d.width)||!positive(d.height)||!Number.isFinite(d.duration)||d.duration<=0||!sha.test(d.encoderRevision)||!sha.test(d.serverContractSha256)||!d.recipeRevision||!/^video-v1\/[a-f0-9]{64}\.mp4$/.test(d.cacheKey)||!d.qualification?.evidenceUrl?.startsWith('https://')||!sha.test(d.qualification.evidenceSha256)||e.timing?.status!=='not-applicable'||Object.keys(e.timing).length!==1)throw Error('Unqualified video delivery.');
 validateVideoSize({group:'video',bytes:d.bytes});
}
export function validateVideoSize(file){if((file.group==='video'||file.kind==='video')&&(!positive(file.bytes)||file.bytes>16777216))throw Error('Video exceeds the16 MiB app limit.');}

export async function readVerifiedMedia(response,file,{signal}={}){
 validateVideoSize(file);
 if(!response?.ok||response.type==='opaque')throw Error('The recording could not be received.');
 const mime=(response.headers.get('Content-Type')||'').split(';')[0].trim();
 if(mime!==file.mime)throw Error('The recording format did not match.');
 const declared=response.headers.get('Content-Length');if(declared!==null&&Number(declared)!==file.bytes)throw Error('The recording size did not match.');
 const reader=response.body?.getReader();if(!reader)throw Error('The recording body is missing.');
 const chunks=[];let count=0;
 try{while(true){if(signal?.aborted)throw Error('Playback canceled.');const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>file.bytes)throw Error('The recording exceeded its approved size.');chunks.push(value);}if(count!==file.bytes)throw Error('The recording size did not match.');}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}chunks.length=0;
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 if(digest!==file.sha256)throw Error('The recording could not be verified.');return bytes;
}
