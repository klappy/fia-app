import {canonicalJSONString,sha256} from '../contract.mjs';
import {createGuideDiscoveryAdapter} from './discovery.mjs';
import {createFreshSourceObservations} from './fresh-source-observation.mjs';
import {createRequestAcquisition} from './request-acquisition.mjs';
import {createRequestSnapshots} from './request-snapshot.mjs';
import {KNOWN_SOURCE_POLICY} from './known-source-stream.mjs';

// Private bridge: explicit admitted checks fetch; ordinary requests only read.
export async function createFreshRequestAcquisition({metadataBytes,metadataSha256,storage,bucket,modelRecipe,policyRevision,freshness,snapshots}){
 if(!(metadataBytes instanceof Uint8Array)||metadataBytes.byteLength>2097152)throw Error('guide-metadata-identity');
 const bytes=new Uint8Array(metadataBytes),recipe=structuredClone(modelRecipe);
 const snapshotConfig=snapshots?{policy:{sha256:snapshots.policy?.sha256,validateSnapshot:snapshots.policy?.validateSnapshot},eligibility:snapshots.eligibility,alignmentConfigSha256:snapshots.alignmentConfigSha256,deliveryConfigSha256:snapshots.deliveryConfigSha256}:null;
 const fresh=createFreshSourceObservations({...freshness,storage,bucket});
 const guide=await createGuideDiscoveryAdapter({metadataBytes:bytes,metadataSha256,bucket});
 const rows=JSON.parse(new TextDecoder().decode(bytes)).rows;
 async function prepare(raw){
  const request=structuredClone(raw),resolved=await guide.resolveRequest(request);
  const observed=await fresh.read();
  if(observed.state!=='observed'||observed.contentVerified!==true)throw Error('fresh-observation-unavailable');
  const receipt=observed.observation,source=receipt.binding.source;
  const logicalId=canonicalJSONString(Object.fromEntries(['packId','language','edition','book','passage','resource'].map(key=>[key,resolved.input[key]])));
  const row=rows.find(row=>row.packId===resolved.input.packId&&row.presentationRevision===resolved.input.source.version&&row.stepId===resolved.input.resource);
  if(source.logicalId!==logicalId||source.url!==row?.sourceURL||source.sourceVersionKind!=='discovery-snapshot'||source.sourceVersion!==resolved.input.source.version)throw Error('fresh-request-source-binding');
  const acquisitionOptions={metadataBytes:bytes,metadataSha256,storage,bucket,modelRecipe:recipe,policyRevision,
   knownSources:[{source:resolved.input.source,policy:{policy:KNOWN_SOURCE_POLICY,url:source.url,sourceVersion:resolved.input.source.version,sha256:receipt.sha256,bytes:receipt.bytes}}],
   fetchSource:async()=>{throw Error('fresh-request-fetch-forbidden');}};
  return {request,resolved,observed,receipt,source,logicalId,acquisitionOptions};
 }
 async function finish(selected,result){
  const current=await fresh.read();
  if(current.observationSha256!==selected.observed.observationSha256)throw Error('fresh-request-superseded');
  return {...result,observationSha256:selected.observed.observationSha256,observation:selected.receipt,acceptedPlayback:false};
 }
 return Object.freeze({observe:fresh.observe,read:fresh.read,async request(raw){
  const selected=await prepare(raw),acquisition=await createRequestAcquisition(selected.acquisitionOptions);
  return finish(selected,{preparation:await acquisition.request(selected.request)});
 },async demand(raw,rawAdmission){
  if(!snapshotConfig)throw Error('fresh-snapshot-capability-unavailable');
  const admission=structuredClone(rawAdmission);
  if(!admission||Object.keys(admission).sort().join()!=='expectedPreviousObservationSha256,sequence')throw Error('fresh-snapshot-admission');
  const selected=await prepare(raw),{receipt,source,logicalId}=selected;
  const freshHeadKey=`fresh-head:${await sha256(logicalId)}`;
  const observationGuard=async tx=>{
   const head=await tx.get(freshHeadKey);
   return head?.schema==='fia-source-observation-head@1'&&head.logicalId===logicalId&&
    head.observationSha256===selected.observed.observationSha256&&head.sourceSha256===receipt.sha256&&
    head.bytes===receipt.bytes&&head.sequence===receipt.binding.admission.sequence&&
    head.receiptKey===`originals/observations/${receipt.operationId}/${receipt.attemptId}.json`;
  };
  const service=await createRequestSnapshots({acquisition:selected.acquisitionOptions,policy:snapshotConfig.policy,eligibility:snapshotConfig.eligibility,observationGuard});
  const observation={logicalId,...admission,provenance:{checkId:receipt.binding.admission.checkId,sourceVersionKind:source.sourceVersionKind,sourceVersion:source.sourceVersion,publisherVersion:source.publisherVersion,observedAt:receipt.observedAt},
   identity:{sourceSha256:receipt.sha256,scriptSha256:selected.resolved.input.scriptSha256,
    recognitionConfigSha256:await sha256(canonicalJSONString({schema:'fia-recognition-recipe@1',...recipe})),
    alignmentConfigSha256:snapshotConfig.alignmentConfigSha256,deliveryConfigSha256:snapshotConfig.deliveryConfigSha256,acceptancePolicySha256:snapshotConfig.policy.sha256}};
  return finish(selected,await service.demand(selected.request,observation));
 }});
}
