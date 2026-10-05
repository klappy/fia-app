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
export function deliveryVariant(entry,size){
 const variant=entry.variants?.[size];if(!variant)throw Error('This media size is not prepared.');
 const {variants,defaultSize,...base}=entry;return {...base,...variant};
}
export function validatePlaybackRange(range,duration){
 videoKeys(range,'startSeconds,endSeconds');
 if(!Number.isFinite(range.startSeconds)||!Number.isFinite(range.endSeconds)||range.startSeconds<0||range.endSeconds<=range.startSeconds||!Number.isFinite(duration)||duration<=0||range.endSeconds>duration)throw Error('Invalid recorded guide playback range.');
 return range;
}
export function validateRecordedAudioEntry(entry){
 videoKeys(entry.audioReplacement,'ledgerEntryId,logicalSource'+(Object.hasOwn(entry.audioReplacement,'recordingLedgerSha256')?',recordingLedgerSha256':''));if(Object.hasOwn(entry.audioReplacement,'recordingLedgerSha256')&&!sha.test(entry.audioReplacement.recordingLedgerSha256))throw Error('Invalid selected recording ledger.');videoKeys(entry.audioReplacement.logicalSource,'sha256,bytes');
 if(entry.delivery?.kind!=='audio'||!entry.audioReplacement.ledgerEntryId||typeof entry.audioReplacement.ledgerEntryId!=='string'||!sha.test(entry.audioReplacement.logicalSource.sha256)||!positive(entry.audioReplacement.logicalSource.bytes)||entry.logicalSource)throw Error('Invalid recorded guide replacement.');
 videoKeys(entry.source,'url,sha256,bytes');
 const check=e=>{validatePlaybackRange(e.playbackRange,e.delivery.duration);if(e.timing?.status!=='verified'||!e.timing.mapping||!Number.isFinite(e.timing.mapping.scale)||e.timing.mapping.scale<=0||!Number.isFinite(e.timing.mapping.offsetSeconds)||e.timing.sourceAudioSha256!==entry.source.sha256||e.timing.deliveryAudioSha256!==e.delivery.sha256||!sha.test(e.timing.mappingEvidenceSha256))throw Error('Recorded guide requires measured mapping evidence.');};
 check(entry);for(const v of Object.values(entry.variants||{}))check(v);
}
export function validateScriptureAlignment(a,{audioSha256,duration,assetId}={}){
 videoKeys(a,'schemaVersion,id,clockDomain,audioSha256,duration,sourceSha256,verses');
 if(a.schemaVersion!==2||(typeof a.id!=='string'||!a.id)||a.clockDomain!=='delivery-media-seconds'||a.audioSha256!==audioSha256||a.duration!==duration||!sha.test(a.sourceSha256)||!Array.isArray(a.verses)||!a.verses.length)throw Error('Invalid Scripture alignment identity.');
 let lastEnd=0;const seen=new Set();
 for(const v of a.verses){videoKeys(v,'verse,text,sourceId,start,end,highlightMode,words'+(v.reason!==undefined?',reason':''));
  if(!Number.isSafeInteger(v.verse)||v.verse<1||seen.has(v.verse)||typeof v.text!=='string'||!v.text||typeof v.sourceId!=='string'||!v.sourceId||!Number.isFinite(v.start)||!Number.isFinite(v.end)||v.start<lastEnd||v.end<=v.start||v.end>duration||!Array.isArray(v.words)||!['word','verse'].includes(v.highlightMode))throw Error('Invalid Scripture verse interval.');
  seen.add(v.verse);lastEnd=v.end;
  if(v.highlightMode==='verse'){if(v.words.length||typeof v.reason!=='string'||!v.reason)throw Error('Verse-only alignment must explain untimed text.');continue;}
  if(!v.words.length)throw Error('Word alignment is empty.');let charEnd=0,timeEnd=v.start;
  for(const w of v.words){videoKeys(w,'from,to,start,end');if(!Number.isSafeInteger(w.from)||!Number.isSafeInteger(w.to)||w.from<charEnd||/[\p{L}\p{N}]/u.test(v.text.slice(charEnd,w.from))||w.to<=w.from||w.to>v.text.length||!v.text.slice(w.from,w.to).trim()||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<timeEnd||w.end<=w.start||w.end>v.end)throw Error('Invalid Scripture word interval.');charEnd=w.to;timeEnd=w.end;}
  if(/[\p{L}\p{N}]/u.test(v.text.slice(charEnd)))throw Error('Word alignment omits displayed text.');
 }return a;
}
export function validateScriptureAudioEntry(entry){
 videoKeys(entry.scriptureReplacement,'ledgerEntryId,assetId,logicalSource');videoKeys(entry.scriptureReplacement.logicalSource,'sha256,bytes');
 const r=entry.scriptureReplacement;if(!r.ledgerEntryId||!r.assetId||!sha.test(r.logicalSource.sha256)||!positive(r.logicalSource.bytes)||entry.audioReplacement||entry.logicalSource||entry.delivery?.kind!=='audio')throw Error('Invalid Scripture replacement.');
 const check=e=>{validatePlaybackRange(e.playbackRange,e.delivery.duration);const a=e.scriptureAlignment;videoKeys(a,'url,sha256,bytes,evidenceSha256');if(!sha.test(a.sha256)||!positive(a.bytes)||!sha.test(a.evidenceSha256)||a.url!==`/content/scripture-alignments/${a.sha256}.json`||e.timing?.status!=='verified'||e.timing.sourceAudioSha256!==entry.source.sha256||e.timing.deliveryAudioSha256!==e.delivery.sha256||!e.timing.mapping||!Number.isFinite(e.timing.mapping.scale)||e.timing.mapping.scale<=0||!Number.isFinite(e.timing.mapping.offsetSeconds)||!sha.test(e.timing.mappingEvidenceSha256))throw Error('Invalid Scripture alignment reference.');};
 check(entry);for(const v of Object.values(entry.variants||{}))check(v);
}
export function validateDelivery(sidecar,identity){
 if(sidecar?.schema===5){
  videoKeys(sidecar,'schema,packId,presentationRevision,recipeRevision,sourceLedger,recordingLedger,scriptureSourceLedger,entries'+(Object.hasOwn(sidecar,'recordingLedgers')?',recordingLedgers':''));
  const ref=sidecar.scriptureSourceLedger;videoKeys(ref,'url,sha256,bytes');if(!sha.test(ref.sha256)||!positive(ref.bytes)||ref.url!==`/content/scripture-sources/${ref.sha256}.json`||!Array.isArray(sidecar.entries))throw Error('Invalid Scripture source ledger.');
  const entries=sidecar.entries.map(entry=>{if(!entry.scriptureReplacement)return entry;
   videoKeys(entry,'path,source,delivery,timing,defaultSize,variants,scriptureReplacement,playbackRange,scriptureAlignment');validateScriptureAudioEntry(entry);
   const {scriptureReplacement,playbackRange,scriptureAlignment,...base}=entry;
   base.variants=Object.fromEntries(Object.entries(entry.variants).map(([size,v])=>{videoKeys(v,'delivery,timing,playbackRange,scriptureAlignment');const {playbackRange,scriptureAlignment,...rest}=v;return [size,rest];}));
   if(JSON.stringify(entry.variants[entry.defaultSize]?.playbackRange)!==JSON.stringify(playbackRange)||JSON.stringify(entry.variants[entry.defaultSize]?.scriptureAlignment)!==JSON.stringify(scriptureAlignment))throw Error('Default Scripture selection changed.');return base;
  });const {scriptureSourceLedger,...base}=sidecar;validateDelivery({...base,schema:4,entries},identity);return sidecar;
 }
 if(sidecar?.schema===4){
  videoKeys(sidecar,'schema,packId,presentationRevision,recipeRevision,sourceLedger,recordingLedger,entries'+(Object.hasOwn(sidecar,'recordingLedgers')?',recordingLedgers':''));
  const ref=sidecar.recordingLedger;videoKeys(ref,'url,sha256,bytes');
  if(!sha.test(ref.sha256)||!positive(ref.bytes)||ref.url!==`/content/recording-sources/${ref.sha256}.json`||!Array.isArray(sidecar.entries))throw Error('Invalid recording ledger reference.');
  const refs=Object.hasOwn(sidecar,'recordingLedgers')?sidecar.recordingLedgers:[];if(!Array.isArray(refs)||sidecar.recordingLedgers&&!refs.length)throw Error('Invalid recording ledgers.');const known=new Set([ref.sha256]);for(const r of refs){videoKeys(r,'url,sha256,bytes');if(!sha.test(r.sha256)||!positive(r.bytes)||r.url!==`/content/recording-sources/${r.sha256}.json`||known.has(r.sha256))throw Error('Invalid duplicate recording ledger.');known.add(r.sha256);}const used=new Set();
  const entries=sidecar.entries.map(entry=>{
   if(!entry.audioReplacement){if(entry.playbackRange||Object.values(entry.variants||{}).some(v=>v.playbackRange))throw Error('Unbound playback range.');return entry;}
   videoKeys(entry,'path,source,delivery,timing,defaultSize,variants,audioReplacement,playbackRange');validateRecordedAudioEntry(entry);const selected=entry.audioReplacement.recordingLedgerSha256||ref.sha256;if(!known.has(selected))throw Error('Unknown recording ledger.');used.add(selected);
   const {audioReplacement,playbackRange,...base}=entry;
   base.variants=Object.fromEntries(Object.entries(entry.variants).map(([size,v])=>{videoKeys(v,'delivery,timing,playbackRange');const {playbackRange,...rest}=v;return [size,rest];}));
   if(JSON.stringify(entry.variants[entry.defaultSize]?.playbackRange)!==JSON.stringify(playbackRange))throw Error('Default recorded range changed.');
   return base;
  });
  if(refs.some(r=>!used.has(r.sha256)))throw Error('Unused recording ledger.');const {recordingLedger,recordingLedgers,...base}=sidecar;validateDelivery({...base,schema:3,entries},identity);return sidecar;
 }
 if(sidecar?.schema===3){
  validateDelivery({...sidecar,schema:2,entries:[]},identity);
  videoKeys(sidecar,'schema,packId,presentationRevision,recipeRevision,sourceLedger,entries');
  if(!Array.isArray(sidecar.entries))throw Error('Invalid variant entries.');const seen=new Set();
  for(const entry of sidecar.entries){
   videoKeys(entry,'path,source,delivery,timing,defaultSize,variants'+(entry.logicalSource?',logicalSource':''));
   const {defaultSize,variants,...base}=entry;
   if(seen.has(entry.path)||!['small','medium','large'].includes(defaultSize)||!variants||!Object.keys(variants).length||Object.keys(variants).some(k=>!['small','medium','large'].includes(k)))throw Error('Invalid media size catalog.');seen.add(entry.path);
   if(JSON.stringify(variants[defaultSize])!==JSON.stringify({delivery:base.delivery,timing:base.timing}))throw Error('Default media size changed.');
   for(const size of Object.keys(variants)){
    videoKeys(variants[size],'delivery,timing');const selected=deliveryVariant(entry,size),d=selected.delivery;
    if(d.kind==='video'){if((d.size||'large')!==size)throw Error('Video size does not match variant.');}
    else if(d.q!==({small:'low',medium:'medium',large:'high'}[size]))throw Error('Media quality does not match variant.');
    validateDelivery({...sidecar,schema:2,entries:[selected]},identity);
   }
  }return sidecar;
 }

 if(![1,2].includes(sidecar?.schema)||sidecar.packId!==identity.packId||sidecar.presentationRevision!==identity.presentationRevision||!sidecar.recipeRevision||!Array.isArray(sidecar.entries))throw Error('Media belongs to a different passage revision.');
 if(sidecar.schema===2){if(Object.keys(sidecar).sort().join(',')!=='entries,packId,presentationRevision,recipeRevision,schema,sourceLedger')throw Error('Unknown video sidecar field.');const l=sidecar.sourceLedger;videoKeys(l,'url,sha256,bytes');if(!l||!sha.test(l.sha256)||!positive(l.bytes)||l.url!==`/content/video-sources/${l.sha256}.json`)throw Error('Invalid video source ledger.');}
 const seen=new Set();
 for(const e of sidecar.entries){const s=e.source,d=e.delivery,t=e.timing;
  if(e.audioReplacement||e.playbackRange||e.scriptureReplacement||e.scriptureAlignment)throw Error('Recorded guide ranges require schema4.');
  if(!local.test(e.path)||seen.has(e.path)||!s||!sha.test(s.sha256)||!positive(s.bytes)||!/^https:\/\//.test(s.url)||!d||!sha.test(d.sha256)||!positive(d.bytes)||!['audio','image','video'].includes(d.kind)||!['transformed','passthrough'].includes(d.status)||!d.format||!d.q)throw Error('Invalid media delivery entry.');
  const url=new URL(d.url);if(url.origin!=='https://transcode.klappy.dev'||!url.pathname.startsWith('/'+d.kind+'/')||url.username||url.password||url.hash||!d.url.endsWith('/'+s.url))throw Error('Unapproved media delivery URL.');
  if(d.status==='passthrough'&&(d.sha256!==s.sha256||d.bytes!==s.bytes))throw Error('Pass-through bytes changed.');
  if(d.duration!==undefined&&(!Number.isFinite(d.duration)||d.duration<=0))throw Error('Invalid recording duration.');
  if(d.kind==='image'&&(!positive(d.width)||!positive(d.height)))throw Error('Invalid image dimensions.');
  if(!['low','medium','high'].includes(d.q))throw Error('Invalid quality tier.');
  if(d.kind==='video'){if(sidecar.schema!==2)throw Error('Video requires delivery schema2.');validateVideoDelivery(e);}else if(e.logicalSource)throw Error('Source replacement is video-only.');
  const options=['audio','video'].includes(d.kind)?`preset=${d.preset},q=${d.q},f=${d.format}${d.kind==='video'&&d.size?',size='+d.size:''}`:`q=${d.q},f=${d.format}`;
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
 videoKeys(d,'url,sha256,bytes,mime,kind,format,preset,q,status,duration,width,height,videoCodec,audioCodec,encoderRevision,recipeRevision,serverContractSha256,cacheKey,qualification'+(d.size!==undefined?',size':''));
 if(d.size!==undefined&&(!['small','medium','large'].includes(d.size)||d.width!==({small:854,medium:960,large:1280}[d.size])||d.height!==({small:480,medium:540,large:720}[d.size])))throw Error('Invalid video rendition size.');videoKeys(d.qualification,'evidenceUrl,evidenceSha256');
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

export function normalizeMediaSizes(sizes={}){
 if(!sizes||typeof sizes!=='object'||Array.isArray(sizes)||Object.keys(sizes).some(k=>!['audio','image','video'].includes(k)))throw Error('Invalid media size selection.');
 for(const value of Object.values(sizes))if(!['small','medium','large'].includes(value))throw Error('Invalid media size selection.');return {...sizes};
}
export function selectManifestSizes(manifest,selection,sizes={}){
 sizes=normalizeMediaSizes(sizes);const included=group=>selection==='all'||selection==='audio'&&group==='audio';
 const selectedSizes={};const files=manifest.files.map(file=>{
  if(file.group==='core'||!included(file.group))return file;
  const size=sizes[file.group]||file.defaultSize;
  if(!size){if(sizes[file.group])throw Error('This media size is not prepared.');return file;}
  const variant=file.variants?.[size]||(!file.variants&&file.selectedSize===size?file:null);if(!variant)throw Error('This media size is not prepared.');
  selectedSizes[file.group]=size;return {...variant,selectedSize:size};
 });
 const tuple=['audio','image','video'].map(g=>selectedSizes[g]||'none').join('-');
 return {...manifest,catalogRevision:manifest.catalogRevision||manifest.revision,revision:Object.keys(selectedSizes).length?`${manifest.catalogRevision||manifest.revision}-${selection}-${tuple}`:manifest.revision,mediaSizes:selectedSizes,files};
}
