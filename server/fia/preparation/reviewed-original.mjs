import {canonicalJSONString,sha256,readPreparedAudio} from './contract.mjs';

const same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
const requireValue=(condition,reason)=>{if(!condition)throw Error(reason);};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const roles=['preparedResult','recordingLedger','timing','acceptance'];

// Trusted catalog admission is required; evidence content cannot admit itself.
export async function verifyReviewedOriginal(rawRow,rawArtifacts){
 const row=structuredClone(rawRow),artifacts={};
 requireValue(row?.eligibility==='eligible'&&row.accepted&&row.selection?.quality==='original','reviewed-original-not-admitted');
 for(const role of roles){const bytes=rawArtifacts?.[role];requireValue(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=262144,'reviewed-original-evidence-size');artifacts[role]=new Uint8Array(bytes);}
 const expected=row.accepted.expected;
 requireValue(same(expected.identity,row.identity)&&same(expected.source,row.source)&&same(expected.activities,row.activities),'reviewed-original-catalog-binding');
 requireValue(row.accepted.path===`/content/prepared-audio/${expected.resultSha256}.json`&&row.accepted.bytes===artifacts.preparedResult.length,'reviewed-original-result-binding');
 const digests={preparedResult:expected.resultSha256,recordingLedger:expected.evidence.recordingLedgerSha256,timing:expected.evidence.timingSha256,acceptance:expected.acceptanceSha256};
 const documents={},descriptors={};
 for(const role of roles){const bytes=artifacts[role];requireValue(hash(digests[role])&&await sha256(bytes)===digests[role],'reviewed-original-evidence-hash');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),document=JSON.parse(text);requireValue(text===canonicalJSONString(document),'reviewed-original-noncanonical');documents[role]=document;
  descriptors[role]={sha256:digests[role],bytes:bytes.length};
 }
 const result=await readPreparedAudio(artifacts.preparedResult,expected),ledger=documents.recordingLedger,timing=documents.timing,acceptance=documents.acceptance;
 requireValue(result.provenance==='official-recording'&&result.delivery.quality==='original'&&result.delivery.mime==='audio/mpeg','reviewed-original-delivery');
 requireValue(result.delivery.url===`/v1/preparation-audio/${result.source.sha256}.mp3`&&['sha256','bytes','duration'].every(key=>result.source[key]===result.delivery[key]),'reviewed-original-delivery');
 requireValue(ledger.schema==='fia-prepared-recording-ledger@1'&&same(ledger.identity,row.identity)&&same(ledger.source,row.source)&&ledger.scriptSha256===row.scriptSha256&&ledger.unitsSha256===row.unitsSha256,'reviewed-original-ledger-binding');
 requireValue(hash(row.scriptSha256)&&hash(row.unitsSha256)&&ledger.clockDomain==='decoded-pcm'&&Array.isArray(ledger.mappings),'reviewed-original-ledger-clock');
 const mappings=ledger.mappings.map(({activityId,sourceUnitId,sourceTextSha256,playbackRange})=>({activityId,sourceUnitId,sourceTextSha256,playbackRange}));
 requireValue(same(mappings,result.activities),'reviewed-original-ledger-ranges');
 requireValue(acceptance.schema==='fia-prepared-audio-evidence-acceptance@1'&&same(acceptance.identity,row.identity)&&same(acceptance.source,row.source)&&same(acceptance.activities,result.activities),'reviewed-original-acceptance-binding');
 requireValue(acceptance.recordingLedgerSha256===digests.recordingLedger&&acceptance.timingSha256===digests.timing&&hash(ledger.sourceReviewSha256)&&acceptance.sourceReviewSha256===ledger.sourceReviewSha256,'reviewed-original-review-binding');
 requireValue(timing.schema==='fia-original-audio-timing@1'&&timing.sourceClockDomain==='decoded-pcm'&&same(timing.mapping,{offsetSeconds:0,scale:1}),'reviewed-original-timing-clock');
 requireValue(timing.sourceAudioSha256===result.source.sha256&&timing.deliveryAudioSha256===result.delivery.sha256&&timing.sourceBytes===result.source.bytes&&timing.deliveryBytes===result.delivery.bytes&&timing.deliveryDuration===result.delivery.duration,'reviewed-original-timing-binding');
 requireValue(hash(timing.independentReviewSha256)&&acceptance.clockReviewSha256===timing.independentReviewSha256,'reviewed-original-clock-review');
 requireValue(['packId','language','edition','presentationRevision'].every(key=>row.selection[key]===row.identity[key])&&typeof row.selection.resource==='string'&&row.selection.resource.length>0,'reviewed-original-selection');
 return {schema:'fia-reviewed-original-snapshot@1',admissionSha256:await sha256(canonicalJSONString(row)),selection:structuredClone(row.selection),
  source:structuredClone(row.source),scriptSha256:row.scriptSha256,unitsSha256:row.unitsSha256,artifacts:descriptors,result,
  evidenceLimits:{acceptance:structuredClone(acceptance.limits??[]),timing:structuredClone(timing.limits??[]),recognition:structuredClone(ledger.recognition?.limits??[]),scope:acceptance.scope},
  authority:'reviewed-catalog-admission',externalEvidenceBodiesVerified:false};
}
