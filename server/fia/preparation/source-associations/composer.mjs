import {issueProducerReceipt,GUIDE_SOURCE_CLASS} from './producer-receipt.mjs';
import {createCanonicalGuideReader} from '../executable-presentation-resolver.mjs';
// The trusted composer seam (Terry ANSWER-SOURCE-EXPLICIT-AUTHORITY, cookbook 2771ded, Q1). For each pack it composes the expected
// descriptor itself from the pack's retained guide record: owner (class-A rule), provenance.collection, provenance.revision,
// sourceFile and sourceFileSha256. It asks the guide-fragment producer for exactly that file, with that sha expected, then passes
// the producer's verified read() and whole bytes to the issuer. It returns a branded receipt only when that receipt equals the
// descriptor. Nothing here comes from a request.
//
// Production constructor (PR293 review N1): createGuideComposer reads guide records only through the existing trusted runtime
// loader, createCanonicalGuideReader over the build snapshot's canonicalSources. Each record's bytes are re-hashed at runtime
// against the build-pinned sha; export-guide-sources.mjs pinned the archive (SOURCE_ARCHIVE_SHA256) and source-bindings.json at
// build. No caller passes archives or bindings. Today canonicalSources holds the Mark packs only, so a Luke pack is a typed
// composer-unknown-pack until the build exports Luke guide records (a held-file change: scripts/package-worker.mjs and
// export-guide-sources.mjs).
//
// Truthfulness: the retained archive pins FIATranslationGuide eb744452 while the publisher is at 96bb023. This composer never
// re-pins or edits the descriptor, so in production a 96bb receipt fails closed as descriptor-mismatch, never explicit. The
// descriptor changes only when a Q14 version-aware refresh adopts a fully validated new snapshot atomically (that seam is not yet
// built), or until then through the ordinary reviewed change to the retained archive, source-bindings.json and the release
// closure (CONTRACT Q24). Not routed; a worker.mjs dispatch line is a later, sequenced change.
//
// snapshot: the Worker's build snapshot (generated/snapshot.json, as entry.mjs and createExecutableRuntime receive it);
// fetchAsset: the ASSETS fetcher; producer: {demand(source), retainedGuideFile(source)} over the guide-fragment@1 job.
export function createGuideComposer(options){
 // Exactly these three ports (PR297 review N-c): any other key, such as archives or bindings, is refused, never ignored.
 if(!options||Object.keys(options).sort().join()!=='fetchAsset,producer,snapshot')throw Error('composer-capability');
 const {snapshot,fetchAsset,producer}=options;
 return composeWithGuideRecords({guideRecordFor:createCanonicalGuideRecords({snapshot,fetchAsset}).guideRecordFor,producer});
}
// The trusted canonical selection: guide records read only through createCanonicalGuideReader over the build snapshot's
// canonicalSources, each re-hashed against its build-pinned row. Shared by the composer and the guide-fragment admission component.
// rowFor(packId) returns the snapshot row in effect, so a caller can confirm the descriptor is still the current one.
export function createCanonicalGuideRecords({snapshot,fetchAsset}){
 const sources=snapshot?.canonicalSources;if(!Array.isArray(sources)||typeof fetchAsset!=='function')throw Error('composer-capability');
 const read=createCanonicalGuideReader({canonicalSources:sources,fetchAsset}),rows=new Map();
 for(const d of sources){if(!rows.has(d.packId))rows.set(d.packId,[]);rows.get(d.packId).push(d);}
 const rowFor=packId=>{const r=rows.get(packId);return r?.length===1?r[0]:null;};
 async function guideRecordFor(packId){
  const r=rows.get(packId);if(!r)return {refused:'composer-unknown-pack'};if(r.length!==1)return {refused:'composer-ambiguous-source'};
  let loaded;try{loaded=await read({packId,sourceRevision:r[0].sourceRevision});}catch(error){return {refused:'composer-guide-unavailable',subReason:error?.code??error?.message??null};}
  let guide;try{guide=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(loaded.bytes));}catch{return {refused:'composer-guide-unavailable',subReason:'canonical-guide-shape'};}
  return guide?.packId===packId?{guide,row:r[0]}:{refused:'composer-guide-unavailable',subReason:'canonical-guide-pack'};
 }
 return Object.freeze({guideRecordFor,rowFor});
}
// The class-A descriptor for a guide record (Q24): owner from the class rule, the rest from the record itself.
export function descriptorOf(guide){
 const d={owner:GUIDE_SOURCE_CLASS.owner,collection:guide?.provenance?.collection,revision:guide?.provenance?.revision,path:guide?.sourceFile,fileSha256:guide?.sourceFileSha256};
 return Object.values(d).some(v=>typeof v!=='string'||!v)?null:Object.freeze(d);
}
// The shared composition over a guide-record loader. Only this module's production constructor and isolated test support call it;
// the import-boundary test refuses any other production caller, so no caller-built loader can stand in for the trusted one.
export function composeWithGuideRecords({guideRecordFor,producer}){
 if(typeof guideRecordFor!=='function'||typeof producer?.demand!=='function'||typeof producer?.retainedGuideFile!=='function')throw Error('composer-capability');
 async function descriptorFor(packId){
  const loaded=await guideRecordFor(packId);if(loaded.refused)return loaded;const d=descriptorOf(loaded.guide);
  return d?{descriptor:d}:{refused:'composer-descriptor-incomplete'};
 }
 // One pack in, one typed outcome out: {state:'composed', receipt} or {state:'unavailable', reason}.
 async function compose(packId){
  const {descriptor,refused,subReason}=await descriptorFor(packId);if(refused)return {packId,state:'unavailable',reason:refused,subReason:subReason??null};
  const source={repo:`${descriptor.owner}/${descriptor.collection}`,revision:descriptor.revision,path:descriptor.path,expectedSha256:descriptor.fileSha256};
  const demanded=await producer.demand(source);if(demanded?.state!=='retained')return {packId,state:'unavailable',reason:demanded?.reason??'producer-unavailable',subReason:demanded?.subReason??null,descriptor};
  const file=await producer.retainedGuideFile(source);if(file?.state!=='retained')return {packId,state:'unavailable',reason:file?.reason??'producer-unavailable',subReason:file?.subReason??null,descriptor};
  let receipt;try{receipt=issueProducerReceipt(file.read,file.bytes);}catch(error){return {packId,state:'unavailable',reason:'composer-receipt-refused',subReason:error.message,descriptor};}
  if(Object.keys(descriptor).some(k=>receipt[k]!==descriptor[k]))return {packId,state:'unavailable',reason:'descriptor-mismatch',descriptor};
  return {packId,state:'composed',receipt,descriptor};
 }
 return Object.freeze({descriptorFor,compose});
}
