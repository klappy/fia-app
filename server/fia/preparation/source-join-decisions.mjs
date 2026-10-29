import {canonicalJSONString,sha256} from './contract.mjs';
import {createCanonicalGuideRecords,descriptorOf} from './source-associations/composer.mjs';
import {guideFragmentIdentity,GUIDE_FRAGMENT_POLICY,GUIDE_FRAGMENT_JOB} from './guide-fragment.mjs';
import {GUIDE_FRAGMENT_READ_SCHEMA,GUIDE_FRAGMENT_READ_KEYS,GUIDE_FRAGMENT_DECISION_KEYS} from './guide-fragment-admission.mjs';
import {SOURCE_ASSOCIATION_RECIPE} from './source-associations/index.mjs';

// The runtime consumer of the guide fragment object's read-only decisions (Terry ANSWER-FRAGMENT-CROSS-OBJECT-AUTHORITY,
// cookbook 0a36cb2). The fragment object issues the branded receipt and runs buildSourceIndex/associatePack inside its own
// custody; this module never builds a receipt or an index entry. It accepts an explicit join only when the runtime itself
// binds all six things the ruling names; any failure is typed unavailable, never explicit:
//  1. the expected descriptor is composed here, from this runtime's own snapshot (createCanonicalGuideRecords), and the
//     response's owner, collection, revision, path and fileSha256 must equal it (descriptor-mismatch otherwise);
//  2. the object is named from that composed source (guideFragmentIdentity), never from a request, and the response's
//     logicalId, url and publisherVersion must equal it;
//  3. the closed schema version, GUIDE_FRAGMENT_POLICY.revision and SOURCE_ASSOCIATION_RECIPE must equal this runtime's
//     constants (version skew otherwise);
//  4. the response is a closed schema: unknown fields, forged references and contradictions are refused; the composer then
//     re-checks each decision against canonical units and the verified base (admitted(), the projector and the resolver);
//  5. the identities travel with the decision (joinProvenance), so a changed observation or recipe is another decision;
//  6. the channel is the injected internal, read-only readFragment port; the JSON is kept only as provenance.
// The fragment object's closed answer is GUIDE_FRAGMENT_READ_SCHEMA (guide-fragment-admission.mjs, PR308 9e3f243); its key lists
// are that module's own constants, so a change on either side is a version skew here, never a silent widening.
export const SOURCE_JOIN_SCHEMA=GUIDE_FRAGMENT_READ_SCHEMA;
export const SOURCE_JOIN_POLICY='fia-source-join@1';
export const SOURCE_JOIN_RULING='klappy/fia-app-cookbook work/active/2026-10-06-cross-pericope-media/ANSWER-FRAGMENT-CROSS-OBJECT-AUTHORITY-2026-10-29.md commit 0a36cb2';
// The static part of the join identity: it folds into the execution recipe when the port is wired.
export const SOURCE_JOIN_RECIPE=`${SOURCE_JOIN_POLICY}:${GUIDE_FRAGMENT_READ_SCHEMA}:${GUIDE_FRAGMENT_POLICY.revision}:${SOURCE_ASSOCIATION_RECIPE}`;

const HEX=/^[a-f0-9]{64}$/,REV=/^[a-f0-9]{40}$/;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const keys=(v,fields)=>plain(v)&&Object.keys(v).sort().join()===[...fields].sort().join();
const text=(v,max=1024)=>typeof v==='string'&&v.length>0&&v.length<=max;
const COLLECTION={FIAImages:'image',FIAMaps:'map'};
const unavailable=(reason,subReason=null)=>({state:'unavailable',reason,...(subReason?{subReason}:{})});
class Refused extends Error{constructor(reason){super(reason);this.reason=reason;}}
const need=(ok,reason)=>{if(!ok)throw new Refused(reason);};
const DESCRIPTOR=['owner','collection','revision','path','fileSha256'];
const EVIDENCE=['kind','pointer','namespace','contentId','label','referenceSha256','provenance','rawRepo','rawRevision','rawPath','rawFileSha256','rawJsonPath','rawFragmentSha256'];
const BINDING=['recipe','packId','language','unitId','unitTextSha256','unitHtmlSha256','guideRevision','guideSourceFileSha256','guideContentSha256','namespace','resourceId','resourceRevision','resourceSourceFile','resourceSourceFileSha256','referenceSha256','rawRevision','rawFileSha256','rawFragmentSha256'];
const sha=v=>sha256(new TextEncoder().encode(typeof v==='string'?v:canonicalJSONString(v)));

// Binding 4 (closed schema, no forged references, no contradictions) for one explicit decision.
async function explicitJoin(d,response,paragraphs){
 need(keys(d,GUIDE_FRAGMENT_DECISION_KEYS)&&d.type==='explicit'&&d.reason===null&&d.kind===null&&d.candidates===null&&d.dependency===null&&keys(d.evidence,EVIDENCE)&&keys(d.binding,BINDING),'join-schema');
 const e=d.evidence,b=d.binding,r=response.receipt;
 need(Object.hasOwn(COLLECTION,d.namespace)&&text(d.resourceId,256)&&/^[A-Za-z0-9_-]+$/.test(d.resourceId)&&text(d.unitId,256)&&text(d.stepId,256),'join-schema');
 need(e.kind==='inline-resource-ref'&&e.provenance==='raw-publisher-html'&&text(e.pointer)&&text(e.label,512)&&HEX.test(e.referenceSha256)&&HEX.test(e.rawFragmentSha256)&&text(e.rawJsonPath,256)&&HEX.test(d.bindingSha256),'join-schema');
 need([b.unitTextSha256,b.unitHtmlSha256,b.guideSourceFileSha256,b.guideContentSha256,b.resourceSourceFileSha256,b.referenceSha256,b.rawFileSha256,b.rawFragmentSha256].every(v=>HEX.test(v))&&REV.test(b.guideRevision)&&REV.test(b.rawRevision)&&text(b.resourceSourceFile,256)&&text(b.language,8)&&(b.resourceRevision===null||REV.test(b.resourceRevision)),'join-schema');
 // Every repeated field agrees: the decision, its evidence, its binding, the receipt and the paragraph list.
 need(d.packId===response.packId&&b.packId===response.packId&&b.unitId===d.unitId&&b.recipe===SOURCE_ASSOCIATION_RECIPE,'join-contradiction');
 need(e.namespace===d.namespace&&b.namespace===d.namespace&&e.contentId===d.resourceId&&d.contentId===d.resourceId&&b.resourceId===d.resourceId&&e.referenceSha256===b.referenceSha256,'join-contradiction');
 need(d.jsonPath===e.rawJsonPath&&d.htmlSha256===e.rawFragmentSha256,'join-contradiction');
 need(e.rawRepo===`${r.owner}/${r.collection}`&&e.rawRevision===r.revision&&b.rawRevision===r.revision&&e.rawPath===r.path&&e.rawFileSha256===r.fileSha256&&b.rawFileSha256===r.fileSha256&&b.guideSourceFileSha256===r.fileSha256&&b.guideRevision===r.revision,'join-contradiction');
 need(e.rawFragmentSha256===b.rawFragmentSha256&&paragraphs.get(e.rawJsonPath)===e.rawFragmentSha256,'join-forged-reference');
 need(await sha(b)===d.bindingSha256,'join-contradiction');
 return {unitId:d.unitId,collection:d.namespace,resourceId:d.resourceId,binding:b,evidence:e};
}

// The internal, read-only channel (binding 6): POST /fragment {packId} to the guide fragment object named `name` on this
// runtime's own FIA_PREPARATION_JOBS namespace, at the object's internal origin. The answer is parsed JSON, or null.
const FRAGMENT_ORIGIN='https://guide-fragment.internal';
export function fragmentPort(env){
 const ns=env?.FIA_PREPARATION_JOBS;if(typeof ns?.idFromName!=='function'||typeof ns?.get!=='function')return null;
 return async function readFragment({name,packId}){
  const response=await ns.get(ns.idFromName(name)).fetch(new Request(FRAGMENT_ORIGIN+'/fragment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({packId}),redirect:'manual'}));
  if(!(response.headers.get('content-type')||'').startsWith('application/json')){response.body?.cancel().catch(()=>{});return null;}
  try{return await response.json();}catch{return null;}
 };
}

// snapshot / fetchAsset: this runtime's own build snapshot and ASSETS fetcher. readFragment({name,packId}): the internal,
// read-only op on the guide fragment object named `name`, answering parsed JSON or null (binding 6). Nothing else is called.
export function createSourceJoinReader({snapshot,fetchAsset,readFragment}){
 if(typeof readFragment!=='function')throw Error('source-join-capability');
 const records=createCanonicalGuideRecords({snapshot,fetchAsset});
 // PR313 review N1: every failure in the reader is a typed unavailable, so the Open stays ready on the base.
 return Object.freeze({async joinsFor(packId){try{return await joinsFrom(packId);}catch{return unavailable('join-unreadable');}}});
 async function joinsFrom(packId){
  // Binding 1: the descriptor is this runtime's own.
  const loaded=await records.guideRecordFor(packId);if(loaded.refused)return unavailable(loaded.refused,loaded.subReason??null);
  const descriptor=descriptorOf(loaded.guide);if(!descriptor)return unavailable('composer-descriptor-incomplete');
  const source={repo:`${descriptor.owner}/${descriptor.collection}`,revision:descriptor.revision,path:descriptor.path};
  // Binding 2: the object is named from the composed source only.
  let identity;try{identity=await guideFragmentIdentity(source);}catch{return unavailable('descriptor-mismatch','guide-source');}
  let response;try{response=await readFragment({name:identity.name,packId});}catch{return unavailable('fragment-unavailable');}
  if(!plain(response))return unavailable('fragment-unavailable');
  try{
   need(keys(response,GUIDE_FRAGMENT_READ_KEYS.answer),'join-schema');
   // Binding 3: version equality, before anything else is read.
   need(response.schema===GUIDE_FRAGMENT_READ_SCHEMA&&response.job===GUIDE_FRAGMENT_JOB&&response.policyRevision===GUIDE_FRAGMENT_POLICY.revision&&response.recipe===SOURCE_ASSOCIATION_RECIPE,'version-skew');
   need(response.packId===packId&&keys(response.descriptor,DESCRIPTOR)&&keys(response.identity,GUIDE_FRAGMENT_READ_KEYS.identity),'join-schema');
   need(response.identity.logicalId===identity.logicalId&&response.identity.url===identity.url&&response.identity.publisherVersion===descriptor.revision,'source-identity-mismatch');
   need(DESCRIPTOR.every(k=>response.descriptor[k]===descriptor[k]),'descriptor-mismatch');
   if(response.state!=='composed')return unavailable('fragment-unavailable',text(response.reason,80)?response.reason:null);
   need(response.custody==='retained'&&keys(response.receipt,GUIDE_FRAGMENT_READ_KEYS.receipt)&&Array.isArray(response.paragraphs)&&response.paragraphs.length<=4096&&keys(response.associations,GUIDE_FRAGMENT_READ_KEYS.associations),'join-schema');
   const r=response.receipt;
   need(DESCRIPTOR.every(k=>r[k]===descriptor[k]),'descriptor-mismatch');
   need(HEX.test(r.observationSha256)&&Number.isSafeInteger(r.bytes)&&r.bytes>0,'join-schema');
   const a=response.associations;
   if(a.state!=='composed')return unavailable('associations-unavailable',text(a.reason,80)?a.reason:null);
   need(HEX.test(a.indexSha256)&&Array.isArray(a.decisions)&&a.decisions.length<=4096,'join-schema');
   const paragraphs=new Map();
   for(const p of response.paragraphs){need(keys(p,GUIDE_FRAGMENT_READ_KEYS.paragraph)&&text(p.jsonPath,256)&&HEX.test(p.htmlSha256)&&!paragraphs.has(p.jsonPath),'join-schema');paragraphs.set(p.jsonPath,p.htmlSha256);}
   const joins=[];
   // Only an explicit image or map join is a resource association this composer decides; an explicit key-term reference
   // (FIAKeyTerms) is a term, not a requested medium, and is passed over, as non-explicit decisions are.
   for(const d of a.decisions){need(keys(d,GUIDE_FRAGMENT_DECISION_KEYS)&&typeof d.type==='string','join-schema');if(d.type!=='explicit'||!Object.hasOwn(COLLECTION,d.namespace))continue;joins.push(await explicitJoin(d,response,paragraphs));}
   // The source revision is this runtime's own canonical row's, never the response's.
   const provenance={schema:GUIDE_FRAGMENT_READ_SCHEMA,policyRevision:response.policyRevision,recipe:response.recipe,sourceRevision:loaded.row.sourceRevision,descriptor,observationSha256:r.observationSha256,fileSha256:r.fileSha256,bytes:r.bytes,indexSha256:a.indexSha256};
   return {state:'ready',packId,sourceRevision:loaded.row.sourceRevision,provenance,joins,responseSha256:await sha(response)};
  }catch(error){if(error instanceof Refused)return unavailable(error.reason);return unavailable('join-unreadable');}
 }
}
