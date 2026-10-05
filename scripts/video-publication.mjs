import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=(value,names)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==names.split(',').sort().join(','))throw Error('Unknown or missing video ledger field.');};
const positive=n=>Number.isSafeInteger(n)&&n>0;
const digest=s=>/^[a-f0-9]{64}$/.test(s);
const relative=s=>typeof s==='string'&&s.length>0&&!s.startsWith('/')&&!s.split('/').includes('..');
// Evidence bytes are build inputs, not runtime network requests. Their hashes are ledger authority.
export function verifyVideoReplacement({entry,ledger,pack,descriptor,file,readEvidence}){
 const l=entry.logicalSource,s=entry.source,d=entry.delivery;
 keys(ledger,'schema,entries');
 if(ledger?.schema!==1||!Array.isArray(ledger.entries))throw Error('Invalid video ledger schema.');
 const ids=new Set(),paths=new Set(),assets=new Set();
 const expected=new Map(Object.values(pack.assets).filter(a=>a.kind==='video'&&typeof a.src==='string'&&a.src.startsWith('/')).map(a=>[a.id,a.src]));
 if(ledger.entries.length!==expected.size)throw Error('Unexpected video ledger publication set.');
 for(const row of ledger.entries){
  keys(row,'id,packId,presentationRevision,assetId,path,bundled,published,metadata,rights,review');keys(row.bundled,'sha256,bytes');keys(row.published,'url,sha256,bytes,width,height,duration');keys(row.metadata,'repository,revision,path,sha256,contentId,assetVersion,collectionVersion');keys(row.rights,'metadataPath,metadataSha256,holder,licenseUrl');keys(row.review,'recipeRevision,evidenceUrl,evidenceSha256');
  if(typeof row.id!=='string'||!row.id||row.packId!==descriptor.id||row.presentationRevision!==descriptor.revision||expected.get(row.assetId)!==row.path||!digest(row.bundled.sha256)||!positive(row.bundled.bytes)||!digest(row.published.sha256)||!positive(row.published.bytes)||!positive(row.published.width)||!positive(row.published.height)||!Number.isFinite(row.published.duration)||row.published.duration<=0||!/^https:\/\//.test(row.published.url)||!digest(row.metadata.sha256)||!relative(row.metadata.path)||!relative(row.rights.metadataPath)||!digest(row.rights.metadataSha256)||!digest(row.review.evidenceSha256)||!/^https:\/\//.test(row.review.evidenceUrl))throw Error('Invalid video ledger publication mapping.');
  const path=row.packId+':'+row.path,asset=row.packId+':'+row.assetId;if(ids.has(row.id)||paths.has(path)||assets.has(asset))throw Error('Duplicate video ledger mapping.');ids.add(row.id);paths.add(path);assets.add(asset);
 }
 const row=ledger.entries.find(r=>r.id===l.ledgerEntryId),asset=pack.assets[l.assetId];
 if(!row||!asset||asset.kind!=='video'||asset.src!==entry.path||row.packId!==descriptor.id||row.presentationRevision!==descriptor.revision||row.assetId!==l.assetId||row.path!==entry.path||row.bundled.sha256!==file.sha256||row.bundled.bytes!==file.bytes||l.sha256!==file.sha256||l.bytes!==file.bytes)throw Error('Video logical source mismatch.');
 if(asset.alignment||asset.cues)throw Error('Video cue mapping requires qualification.');
 if(row.published.url!==s.url||row.published.sha256!==s.sha256||row.published.bytes!==s.bytes||!row.metadata?.assetVersion||row.metadata.contentId!==l.assetId||!row.metadata.repository||!/^[a-f0-9]{40}$/.test(row.metadata.revision)||!row.metadata.path||!row.metadata.collectionVersion||!row.rights?.metadataPath||!row.review?.recipeRevision)throw Error('Video published source mismatch.');
 const evidence=sha=>{if(!/^[a-f0-9]{64}$/.test(sha))throw Error('Invalid evidence identity.');const bytes=readEvidence(sha);if(hash(bytes)!==sha)throw Error('Video evidence hash mismatch.');return JSON.parse(bytes);};
 const metadata=evidence(row.metadata.sha256),records=Array.isArray(metadata)?metadata:[metadata],record=records.find(r=>r.content_id===row.assetId);
 if(!record||record.version!==row.metadata.assetVersion||typeof record.content!=='string'||!record.content.includes(`href='${s.url}'`)&&!record.content.includes(`href="${s.url}"`))throw Error('Published video URL/version not in pinned metadata.');
 const rights=evidence(row.rights.metadataSha256),collection=rights.resource_metadata,license=collection?.license_info;if(collection?.version!==row.metadata.collectionVersion||license?.copyright?.holder?.name!==row.rights.holder||!license?.licenses?.some(item=>Object.values(item).some(value=>value?.url===row.rights.licenseUrl))||!/^https:\/\//.test(row.rights.licenseUrl)||!row.rights.holder)throw Error('Video rights mismatch.');
 const reviewed=evidence(row.review.evidenceSha256);if(reviewed.status!=='accepted'||!equal(reviewed.published,row.published)||reviewed.assetId!==row.assetId||reviewed.metadataSha256!==row.metadata.sha256||reviewed.rightsSha256!==row.rights.metadataSha256)throw Error('Video source review mismatch.');
 const qualified=evidence(d.qualification.evidenceSha256);
 for(const key of ['sha256','bytes','mime','format','preset','q','width','height','duration','videoCodec','audioCodec','encoderRevision','recipeRevision','serverContractSha256','cacheKey','url'])if(qualified.delivery?.[key]!==d[key])throw Error('Video output qualification mismatch: '+key);
 if(qualified.status!=='accepted'||qualified.sourceSha256!==s.sha256||qualified.sourceBytes!==s.bytes||qualified.sourceUrl!==s.url||qualified.allocationProof?.status!=='accepted'||qualified.allocationProof.maxApplicationPayloadBytes>50331648||!Number.isSafeInteger(qualified.allocationProof.maxApplicationPayloadBytes)||qualified.allocationProof.maxApplicationPayloadBytes<=0)throw Error('Video qualification incomplete.');
 if(!equal(s.provenance,{metadata:row.metadata,rights:row.rights,review:row.review}))throw Error('Video provenance changed.');
 return {logicalSourceSha256:l.sha256,logicalSourceBytes:l.bytes,sourceBytes:s.bytes};
}
