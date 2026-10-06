import {canonicalJSONString,sha256} from '../contract.mjs';
import {readBounded} from '../service.mjs';
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const string=value=>typeof value==='string'&&value.trim()&&value.length<=4096;
const equal=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
const selectionKeys=['book','language','edition','passage','resource'];

// The snapshot is trusted published metadata, not an accepted-audio catalog.
// Hashes of recording bytes are deliberately absent until acquisition.
export async function createGuideDiscoveryAdapter({metadataBytes,metadataSha256,bucket}){
 if(metadataBytes instanceof Uint8Array)metadataBytes=new Uint8Array(metadataBytes);
 if(!(metadataBytes instanceof Uint8Array)||metadataBytes.length>2*1024*1024||!digest(metadataSha256)||await sha256(metadataBytes)!==metadataSha256)throw Error('guide-metadata-identity');
 const metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(metadataBytes));
 if(metadata.schema!=='fia-published-guide-sources@1'||!Array.isArray(metadata.rows)||metadata.rows.length<1||metadata.rows.length>10000)throw Error('guide-metadata-schema');
 const rows=new Map();
 for(const row of metadata.rows){
  for(const key of ['packId','book','language','edition','publisherSourceId','publisherPassage','stepId','sourceURL'])if(!string(row[key]))throw Error('guide-metadata-field');
  for(const key of ['presentationRevision','guideContentSha256','sourceMetadataSha256'])if(!digest(row[key]))throw Error('guide-metadata-hash');
  const url=new URL(row.sourceURL);
  if(url.origin!=='https://s3.amazonaws.com'||url.username||url.password||url.search||url.hash||!url.pathname.startsWith('/cbbt-er.public/pericopes/'))throw Error('guide-publisher-url');
  if(!Array.isArray(row.sourceUnits)||row.sourceUnits.length<1||row.sourceUnits.length>1000)throw Error('guide-source-units');
  const units=new Set();
  for(const unit of row.sourceUnits){if(!string(unit.sourceUnitId)||!digest(unit.sourceTextSha256)||units.has(unit.sourceUnitId))throw Error('guide-source-unit');units.add(unit.sourceUnitId);}
  const key=canonicalJSONString([row.packId,row.presentationRevision,row.stepId]);
  if(rows.has(key))throw Error('ambiguous-guide-source');rows.set(key,structuredClone(row));
 }
 function sectionInput(row){return {packId:row.packId,book:row.book,language:row.language,edition:row.edition,passage:row.publisherPassage,resource:row.stepId,scriptSha256:row.guideContentSha256,source:{publisherId:'fia-guide',resourceId:row.publisherSourceId,version:row.presentationRevision}};}
 function find(input){
  const row=rows.get(canonicalJSONString([input.packId,input.source?.version,input.resource]));
  if(!row||!equal(sectionInput(row),Object.fromEntries(Object.keys(sectionInput(row)).map(key=>[key,input[key]]))))throw Error('guide-selection-unresolved');return row;
 }
 function discoveryFor(row){const input=sectionInput(row);return {schema:'fia-source-discovery@1',source:{...input.source,url:row.sourceURL},selection:Object.fromEntries(selectionKeys.map(key=>[key,input[key]])),metadataSha256};}
 async function resolveRequest(request){
  if(!request||!equal(Object.keys(request).sort(),['edition','language','packId','presentationRevision','sourceTextSha256','sourceUnitId'].sort()))throw Error('invalid-guide-request');
  const matches=[...rows.values()].filter(row=>row.packId===request.packId&&row.presentationRevision===request.presentationRevision&&row.language===request.language&&row.edition===request.edition&&row.sourceUnits.some(unit=>unit.sourceUnitId===request.sourceUnitId&&unit.sourceTextSha256===request.sourceTextSha256));
  if(matches.length!==1)throw Error('guide-request-unresolved');
  return {input:sectionInput(matches[0]),consumer:structuredClone(request)};
 }
 const adapter={paid:false,async run({input}){
  const row=find(structuredClone(input)),discovery=discoveryFor(row),bytes=new TextEncoder().encode(canonicalJSONString(discovery)),hash=await sha256(bytes),reference=`preparation/discovery/${hash}.json`;
  const before=await bucket.get(reference);
  if(!before)await bucket.put(reference,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
  const stored=before||await bucket.get(reference);if(!stored||await sha256(await readBounded(new Response(stored.body),32768))!==hash)throw Error('guide-discovery-store-conflict');
  return {sha256:hash,reference};
 }};
 async function validatePublisherURL(url,{input,discovery}){
  try{const row=find(input);return url===row.sourceURL&&equal(discovery,discoveryFor(row));}catch{return false;}
 }
 return {adapter,resolveRequest,validatePublisherURL,count:rows.size};
}

// Converts the already-audited inventory without carrying private local paths.
// Trust in the audit's source joins remains an explicit caller-owned boundary.
export async function publishedGuideMetadataFromAudit(auditBytes,auditSha256){
 if(auditBytes instanceof Uint8Array)auditBytes=new Uint8Array(auditBytes);
 if(!(auditBytes instanceof Uint8Array)||auditBytes.length>2*1024*1024||!digest(auditSha256)||await sha256(auditBytes)!==auditSha256)throw Error('guide-audit-identity');
 const audit=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(auditBytes));
 if(audit.schema!=='fia-dynamic-discovery-resolver-audit@1'||!Array.isArray(audit.guideSources))throw Error('guide-audit-schema');
 const rows=audit.guideSources.map(row=>Object.fromEntries(['packId','presentationRevision','language','book','publisherSourceId','publisherPassage','stepId','sourceURL','sourceMetadataSha256','guideContentSha256','sourceUnits'].map(key=>[key,row[key]])));
 for(const row of rows)row.edition='fia-guide';
 const bytes=new TextEncoder().encode(canonicalJSONString({schema:'fia-published-guide-sources@1',auditSha256,rows}));
 return {bytes,sha256:await sha256(bytes)};
}
