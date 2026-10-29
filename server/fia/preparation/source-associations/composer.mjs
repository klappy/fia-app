import {createHash} from 'node:crypto';
import {issueProducerReceipt,GUIDE_SOURCE_CLASS} from './producer-receipt.mjs';
// The trusted composer seam (Terry ANSWER-SOURCE-EXPLICIT-AUTHORITY, cookbook 2771ded, Q1). For each pack it composes the expected
// descriptor itself from the retained compiled archive guide record, after checking that record against source-bindings.json
// (the same pin exportGuideSources uses). The descriptor is owner (class-A rule), provenance.collection, provenance.revision,
// sourceFile and sourceFileSha256. It asks the guide-fragment producer for exactly that file, with that sha expected, then passes
// the producer's verified read() and whole bytes to the issuer. It returns a branded receipt only when that receipt equals the
// descriptor. Nothing here comes from a request: the archive and bindings are the retained ones, and the producer is the job.
//
// Truthfulness: the retained archive pins FIATranslationGuide eb744452 while the publisher is at 96bb023. This composer never
// re-pins or edits the descriptor, so in production a 96bb receipt is refused as descriptor-mismatch until the existing
// source/version admission path resolves it. Not routed; a worker.mjs dispatch line is a later, sequenced change.
const sha=x=>createHash('sha256').update(x).digest('hex');
// archives: [{revision,packs}] (retained source-packs*.json.gz); sourceBindings: retained source-bindings.json;
// producer: {demand(source), retainedGuideFile(source)} over the guide-fragment@1 job for that source's identity.
export function createGuideComposer({archives,sourceBindings,producer}){
 if(!Array.isArray(archives)||!archives.length||!sourceBindings||typeof producer?.demand!=='function'||typeof producer?.retainedGuideFile!=='function')throw Error('composer-capability');
 const packs=new Map();for(const a of archives)for(const [id,p] of Object.entries(a.packs))packs.set(id,p);
 function descriptorFor(packId){
  const guide=packs.get(packId)?.guide;if(!guide)return {refused:'composer-unknown-pack'};
  if(sha(Buffer.from(JSON.stringify(guide)))!==sourceBindings[packId]?.guide)return {refused:'composer-binding-mismatch'};
  const d={owner:GUIDE_SOURCE_CLASS.owner,collection:guide.provenance?.collection,revision:guide.provenance?.revision,path:guide.sourceFile,fileSha256:guide.sourceFileSha256};
  if(Object.values(d).some(v=>typeof v!=='string'||!v))return {refused:'composer-descriptor-incomplete'};
  return {descriptor:Object.freeze(d)};
 }
 // One pack in, one typed outcome out: {state:'composed', receipt} or {state:'unavailable', reason}.
 async function compose(packId){
  const {descriptor,refused}=descriptorFor(packId);if(refused)return {packId,state:'unavailable',reason:refused};
  const source={repo:`${descriptor.owner}/${descriptor.collection}`,revision:descriptor.revision,path:descriptor.path,expectedSha256:descriptor.fileSha256};
  const demanded=await producer.demand(source);if(demanded?.state!=='retained')return {packId,state:'unavailable',reason:demanded?.reason??'producer-unavailable',subReason:demanded?.subReason??null,descriptor};
  const file=await producer.retainedGuideFile(source);if(file?.state!=='retained')return {packId,state:'unavailable',reason:file?.reason??'producer-unavailable',subReason:file?.subReason??null,descriptor};
  let receipt;try{receipt=issueProducerReceipt(file.read,file.bytes);}catch(error){return {packId,state:'unavailable',reason:'composer-receipt-refused',subReason:error.message,descriptor};}
  if(Object.keys(descriptor).some(k=>receipt[k]!==descriptor[k]))return {packId,state:'unavailable',reason:'descriptor-mismatch',descriptor};
  return {packId,state:'composed',receipt,descriptor};
 }
 return Object.freeze({descriptorFor,compose});
}
