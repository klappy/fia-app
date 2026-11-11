import {canonicalJSONString,sha256} from '../../preparation/contract.mjs';
const need=(v,r)=>{if(!v)throw Error(r);},revision=v=>typeof v==='string'&&/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(v);
// Literal extraction from verified existing asset metadata. This records what
// language the evidence actually has, not what language its display title suggests.
// The display title is the evidence title, or one the compiler derived from the asset's own evidence (compile.mjs termTitle):
// titleProvenance names the evidence title it came from (derivedFrom) and how. The derivation is checked here against the
// evidence itself, never trusted from the label: a FIAKeyTerms headword must occur in the term's own source text, and a key
// written out must fold back to the key. Any other title that differs from the evidence title is refused.
const keyForm=s=>String(s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const plainText=html=>String(html||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').toLowerCase();
const titleBound=(asset,e)=>{
 if(asset.title===e.title)return true;
 const p=asset.titleProvenance;if(p?.status!=='source'||p.derivedFrom!==e.title||typeof e.title!=='string')return false;
 if(p.from==='FIAKeyTerms key')return keyForm(asset.title)===e.title;
 if(p.from==='FIAKeyTerms headword')return asset.kind==='term'&&typeof e.text?.html==='string'&&asset.title.trim().length>0&&plainText(e.text.html).includes(asset.title.trim().toLowerCase());
 return false;
};
export async function canonicalSourceActionCandidate(asset,packLanguage){
 const e=asset?.sourceEvidence;need(asset&&e&&typeof e.id==='string'&&asset.id&&typeof asset.title==='string'&&titleBound(asset,e)&&['term','image','map','video'].includes(asset.kind),'execution-canonical-candidate');
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
