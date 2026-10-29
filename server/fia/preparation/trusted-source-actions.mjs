import {canonicalJSONString,sha256} from './contract.mjs';
import {canonicalSourceActionCandidate} from '../compiler/presentation/source-action-candidates.mjs';
import trustedSourceActions from './trusted-source-actions.json' with {type:'json'};

// Trusted versioned metadata for the explicitResult boundary
// (EXECUTABLE-PRESENTATION.md: explicit results come from applicable trusted
// evidence). Each row is an exact independently reviewed source-to-resource fact.
// It is re-verified against the verified base and canonical source on every demand:
// pack, language, source and guide revisions, guide content and file hashes, unit
// text hash, and each requested asset's collection, title, source file and hash in
// the base catalog. Any mismatch drops the row (stale evidence stays unsupported).
// Nothing here picks a primary or display order: the projector's verified base
// order governs, and only requested-medium relations are asserted.
export const TRUSTED_SOURCE_ACTION_POLICY='fia-trusted-source-actions@1';
const KIND={FIAMaps:'map',FIAImages:'image'};
const encode=v=>new TextEncoder().encode(canonicalJSONString(v));
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);

// The identity of the shipped metadata folds into the execution recipe, so a row
// prepared before (or under other) trusted metadata is a different build: its job and
// publication no longer reproduce today's, and the current read re-offers the demand.
export const TRUSTED_SOURCE_ACTIONS_SHA256=await sha256(encode(trustedSourceActions));
export const trustedExecutionRecipe=recipe=>`${recipe}+${TRUSTED_SOURCE_ACTION_POLICY}:${TRUSTED_SOURCE_ACTIONS_SHA256}`;

function validMetadata(m){
 return m?.schema===TRUSTED_SOURCE_ACTION_POLICY&&hash(m.evidence?.ledgerSha256)&&/^[a-f0-9]{40}$/.test(m.evidence?.sourceRevision??'')&&/^[a-f0-9]{40}$/.test(m.evidence?.guideRevision??'')&&Array.isArray(m.rows)&&m.rows.length<=256&&m.rows.every(r=>typeof r.packId==='string'&&typeof r.unitId==='string'&&hash(r.unitTextSha256)&&hash(r.guideContentSha256)&&hash(r.guideFileSha256)&&Array.isArray(r.requested)&&r.requested.length>0&&r.requested.length<=8&&r.requested.every(q=>KIND[q.collection]&&typeof q.id==='string'&&hash(q.sourceFileSha256)))
  &&new Set(m.rows.map(r=>r.packId+' '+r.unitId)).size===m.rows.length;
}

// Returns the requested assets when every bound identity still holds, else null.
async function admitted(row,evidence,context){
 const base=context.basePresentation,guide=base?.source?.guide;
 if(row.packId!==base?.id||row.language!==context.language||row.packId.slice(0,3)!==row.language)return null;
 if(context.sourceRevision!==evidence.sourceRevision||base.source?.commit!==evidence.sourceRevision)return null;
 if(context.guideContentSha256!==row.guideContentSha256||guide?.contentSha256!==row.guideContentSha256||guide?.sourceFileSha256!==row.guideFileSha256||guide?.sourceId!==row.guideSourceId||guide?.provenance?.revision!==evidence.guideRevision)return null;
 const unit=context.canonicalUnits.find(u=>u.sourceUnitId===row.unitId);
 if(!unit||unit.sourceTextSha256!==row.unitTextSha256||await sha256(unit.text)!==row.unitTextSha256)return null;
 const anchors=base.activities.filter(a=>a.sourceUnitId===row.unitId);
 if(anchors.length!==1||anchors[0].sectionId!==unit.sectionId||(anchors[0].sourceSha256??anchors[0].sourceTextSha256)!==row.unitTextSha256)return null;
 const assets=[];
 for(const q of row.requested){
  const found=Object.values(base.assets).filter(a=>(a.sourceEvidence?.id??a.id)===q.id);
  if(found.length!==1)return null;
  const a=found[0],e=a.sourceEvidence;
  if(a.kind!==KIND[q.collection]||e.kind!==a.kind||a.title!==q.title||e.title!==q.title||a.rights?.collection!==q.collection||e.titleProvenance?.collection!==q.collection||e.sourceFile!==q.sourceFile||e.sourceFileSha256!==q.sourceFileSha256)return null;
  assets.push(a);
 }
 return {unit,anchor:anchors[0],assets};
}

/** Trusted composer for createExecutablePresentationResolver({composeDecisionInputs}). */
// policySha256 is the consuming service's current execution policy: the decision job
// accepts an explicit result only under the policy that composed it.
export function createTrustedSourceActionComposer({policySha256,metadata=trustedSourceActions}){
 if(!hash(policySha256)||!validMetadata(metadata))throw Error('trusted-source-actions-metadata');
 const frozen=structuredClone(metadata);
 return async function composeDecisionInputs(context){
  const decisions=[];
  for(const row of frozen.rows){
   const match=await admitted(row,frozen.evidence,context);
   if(!match)continue;
   const {unit,anchor,assets}=match,{text,...sourceAnchor}=unit;
   const candidates=[];for(const a of assets)candidates.push(await canonicalSourceActionCandidate(a,context.language));
   const intentSlots=candidates.map(c=>({slotId:`requested-${c.kind}-${c.resourceId}`,resourceKind:c.kind,relation:'requested-medium',candidateResourceIds:[c.resourceId]}));
   const input={contract:'fia-source-action-input@1',packId:context.basePresentation.id,presentationRevision:context.baseRevision,sourceRevision:context.sourceRevision,guideContentSha256:context.guideContentSha256,language:context.language,source:{unitId:unit.sourceUnitId,text:unit.text,sha256:unit.sourceTextSha256},context:[],requestedDecisions:['resource-association'],candidates,explicitAssociations:candidates.map(c=>({resourceId:c.resourceId,sourceEvidenceSha256:c.sourceEvidenceSha256})),sourceAnchor,canonicalOrderSha256:context.canonicalOrderSha256,existingActivityBindings:[{activityId:anchor.id,sourceUnitId:anchor.sourceUnitId,sourceTextSha256:unit.sourceTextSha256,sectionId:anchor.sectionId}],intentSlots};
   const explicitResult={contract:'fia-source-action-result@1',inputSha256:await sha256(encode(input)),cueRoles:null,
    provenance:{mode:'deterministic',contractSha256:await sha256(frozen.evidence.applicability),schemaSha256:await sha256(encode(frozen.evidence)),questionSha256:await sha256(encode(row)),policySha256,modelRevision:null,configSha256:await sha256(encode(frozen)),rawEvidenceSha256:frozen.evidence.ledgerSha256},
    resourceAssociations:intentSlots.map(s=>({slotId:s.slotId,resourceKind:s.resourceKind,relation:s.relation,outcome:'matched',candidateResourceIds:[...s.candidateResourceIds],evidenceUnitIds:[unit.sourceUnitId],reason:'explicit-binding'}))};
   decisions.push({input,explicitResult});
  }
  return decisions;
 };
}
