import {canonicalJSONString,sha256} from '../../preparation/contract.mjs';
const need=(v,r)=>{if(!v)throw Error(r);},revision=v=>typeof v==='string'&&/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(v);
// Literal extraction from verified existing asset metadata. This records what
// language the evidence actually has, not what language its display title suggests.
export async function canonicalSourceActionCandidate(asset,packLanguage){
 const e=asset?.sourceEvidence;need(asset&&e&&typeof e.id==='string'&&asset.id&&asset.title===e.title&&['term','image','map','video'].includes(asset.kind),'execution-canonical-candidate');
 let sourceText,sourceRevision,language;
 if(asset.kind==='term'){
  need(e.text?.status==='source'&&typeof e.text.html==='string'&&e.text.provenance?.status==='source'&&e.text.provenance.collection==='FIAKeyTerms'&&revision(e.text.provenance.revision),'execution-candidate-text');
  language=/^([a-z]{3})-/.exec(e.text.sourceId)?.[1];sourceText=e.text.html;sourceRevision=e.text.provenance.revision;
  need(language,'execution-candidate-text-language');
  // Publisher textSha256 may use a different normalization recipe. The complete
  // evidence digest binds that field; this input hashes its exact raw HTML anew.
 }else{
  const title=e.titleProvenance;need(typeof e.title==='string'&&title&&['source','missing'].includes(title.status),'execution-candidate-title');sourceText=e.title;
  if(e.languageNeutral===true)language='und';else if(title.status==='missing')language=title.fallback;else language=e.language??packLanguage;
  sourceRevision=title.status==='source'?title.revision:asset.rights?.revision;
  need(revision(sourceRevision)&&typeof language==='string'&&/^[a-z]{3}$/.test(language),'execution-candidate-provenance');
 }
 need(typeof sourceText==='string'&&sourceText.length<=8192&&asset.title.length<=512,'execution-candidate-size');
 return {resourceId:e.id,kind:asset.kind,language,title:asset.title,sourceText,sourceTextSha256:await sha256(sourceText),sourceRevision,sourceEvidenceSha256:await sha256(canonicalJSONString(e))};
}
export async function validateCanonicalSourceActionCandidate(candidate,asset,packLanguage){
 need(canonicalJSONString(candidate)===canonicalJSONString(await canonicalSourceActionCandidate(asset,packLanguage)),'execution-candidate-canonical-binding');return true;
}
