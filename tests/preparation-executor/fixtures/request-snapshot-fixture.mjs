import {createCoherentSnapshots,SNAPSHOT_EDGES} from '../../../server/fia/preparation/executor/coherent-snapshot.mjs';
import {canonicalJSONString,sha256} from '../../../server/fia/preparation/contract.mjs';
import {KNOWN_SOURCE_POLICY} from '../../../server/fia/preparation/executor/known-source-stream.mjs';
const encode=v=>new TextEncoder().encode(canonicalJSONString(v));
async function fixture({store,objects,bytes}){

 // Test metadata exercises routing only; it is not new timing or source-text acceptance.
 const row={packId:'eng.MRK-1-14-20',presentationRevision:'a'.repeat(64),language:'eng',book:'MRK',edition:'fia-guide',publisherSourceId:'test-p2',publisherPassage:'1:14-20',stepId:'S01',sourceURL:'https://s3.amazonaws.com/cbbt-er.public/pericopes/eng/mrk/p2/s1/v2/vbr0.mp3',guideContentSha256:'b'.repeat(64),sourceMetadataSha256:'c'.repeat(64),sourceUnits:[{sourceUnitId:'S01-U001',sourceTextSha256:'d'.repeat(64)},{sourceUnitId:'S01-U002',sourceTextSha256:'e'.repeat(64)}]};
 const metadataBytes=encode({schema:'fia-published-guide-sources@1',rows:[row]});let fetches=0;
 const options={metadataBytes,metadataSha256:await sha256(metadataBytes),storage:store,bucket:objects,knownSources:[{source:{publisherId:'fia-guide',resourceId:row.publisherSourceId,version:row.presentationRevision},policy:{policy:KNOWN_SOURCE_POLICY,url:row.sourceURL,sourceVersion:row.presentationRevision,sha256:await sha256(bytes),bytes:bytes.length}}],modelRecipe:{modelId:'disabled-test-model',modelRevision:'disabled',configSha256:'f'.repeat(64)},policyRevision:'integration-test-v1',makeStream:()=>new TransformStream(),fetchSource:async()=>{fetches++;return new Response(bytes,{headers:{'content-type':'audio/mpeg','content-length':String(bytes.length)}});}};
 const request={packId:row.packId,presentationRevision:row.presentationRevision,language:row.language,edition:row.edition,...row.sourceUnits[0]};
 return {options,request,store,objects,fetches:()=>fetches};
}

export async function setup(options){
 const f=await fixture(options),roots={};
 for(const role of ['source','script','recognitionConfig','alignmentConfig','deliveryConfig','acceptancePolicy']){
  const bytes=encode(role==='recognitionConfig'?{schema:'fia-recognition-recipe@1',...f.options.modelRecipe}:{fixture:role}),hash=await sha256(bytes),reference=`snapshots/artifacts/${hash}.json`;
  await f.objects.put(reference,bytes);roots[role]={sha256:hash,bytes:bytes.length,reference,parents:{}};
 }
 const identity=Object.fromEntries(Object.entries(roots).map(([role,a])=>[role+'Sha256',a.sha256]));
 const metadata=JSON.parse(new TextDecoder().decode(f.options.metadataBytes));metadata.rows[0].guideContentSha256=identity.scriptSha256;
 f.options.metadataBytes=encode(metadata);f.options.metadataSha256=await sha256(f.options.metadataBytes);
 const logicalId=canonicalJSONString({packId:f.request.packId,language:'eng',edition:'fia-guide',book:'MRK',passage:'1:14-20',resource:'S01'});
 const observation={logicalId,sequence:1,expectedPreviousObservationSha256:null,provenance:{checkId:'fixture-old',sourceVersionKind:'observed-content',sourceVersion:identity.sourceSha256,publisherVersion:null,observedAt:1},identity};
 const policy={sha256:identity.acceptancePolicySha256,validateSnapshot:({metadata})=>JSON.parse(new TextDecoder().decode(metadata.timing)).fixture===true};
 // Explicitly synthetic accepted graph: tests storage preservation, not acoustic acceptance.
 const artifacts={};
 for(const [role,parents] of Object.entries(SNAPSHOT_EDGES)){
  if(!parents.length){artifacts[role]=roots[role];continue;}
  const edges=Object.fromEntries(parents.map(p=>[p,artifacts[p].sha256]));
  const bytes=encode(role==='acceptance'?{schema:'fia-snapshot-acceptance@1',status:'review-accepted',identity,parents:edges}:{fixture:true,role,parents:edges});
  const hash=await sha256(bytes),reference=`snapshots/artifacts/${hash}.json`;await f.objects.put(reference,bytes);
  artifacts[role]={sha256:hash,bytes:bytes.length,reference,parents:edges};
 }
 const initialCoordinator=createCoherentSnapshots({storage:f.store,bucket:f.objects,policy,eligibility:()=>true,builder:{paid:false,run:async()=>({schema:'fia-coherent-snapshot@1',logicalId,identity,artifacts})}});
 const existing=await initialCoordinator.read(logicalId);
 const prior=existing.desired?existing:await initialCoordinator.demand(observation);
 const source=f.options.knownSources[0].policy.sha256;
 const next={...observation,sequence:2,expectedPreviousObservationSha256:await sha256(canonicalJSONString(observation)),identity:{...identity,sourceSha256:source},provenance:{...observation.provenance,checkId:'fixture-new',observedAt:2,sourceVersion:source}};
 return {...f,prior,next,policy};
}
