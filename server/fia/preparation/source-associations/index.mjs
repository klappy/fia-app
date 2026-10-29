import {createHash} from 'node:crypto';
import {canonicalJSONString} from '../contract.mjs';
import {isProducerReceipt,GUIDE_SOURCE_CLASS} from './producer-receipt.mjs';
// Pure source-association index (no network, no fs). It builds a version-bound index of guide units and of FIAKeyTerms,
// FIAImages and FIAMaps resources from the retained compiled source archives, then makes deterministic exact joins.
// A typed inline reference is source-explicit only when a producer receipt for that pack's own archive-described file carries the same tag,
// anchored to exactly one unit. Compiled-guide annotations alone never are. Passage-level resource lists, unit term ids,
// compiled relatedIds/primary, titles and ledgers are never joins. Output is association only: no medium, autoplay,
// pause, order, source selection or admission policy.
export const SOURCE_ASSOCIATION_RECIPE='fia-source-association@1';
// The schema of one pack's association-input file (written by export-guide-sources.mjs, read by the guide-fragment object).
export const ASSOCIATION_SOURCE_SCHEMA='fia-association-source@1';
export const RAW_DEPENDENCY='class-A guide-text source route and admission (CONTRACT acquisition-profile clause, Q2; reviewed source route and ticket admission, Q3; Otto seat)';
const sha=x=>createHash('sha256').update(x).digest('hex');
const NAMESPACES=Object.freeze({FIAKeyTerms:'term',FIAImages:'image',FIAMaps:'map'});
const KIND_NAMESPACE=Object.freeze({image:'FIAImages',map:'FIAMaps'});
// A visual request: a determiner directly before a picture or map noun, in a sentence with a viewing or showing verb.
// The word lists are part of the recipe; a request only ever yields semantic-needed.
const REQUESTS=Object.freeze({
 eng:{image:/\b(?:a|an|the|some|this|that|these|those|another|your)\s+(?:photo|photos|photograph|photographs|picture|pictures|image|images|illustration|illustrations)\b/i,map:/\b(?:a|an|the|some|this|that|these|those|another|your)\s+(?:map|maps)\b/i},
 spa:{image:/(?:^|[^\p{L}])(?:un|una|unos|unas|el|la|los|las|del|al|esta|este|estas|estos|otra|otro)\s+(?:foto|fotos|fotografía|fotografías|imagen|imágenes|ilustración|ilustraciones)(?![\p{L}])/iu,map:/(?:^|[^\p{L}])(?:un|una|unos|unas|el|la|los|las|del|al|esta|este|estas|estos|otro)\s+(?:mapa|mapas)(?![\p{L}])/iu},
});
const ACTIONS=Object.freeze({eng:/\b(?:look|looks|looking|show|shows|showing|see|view|point|display|find|study|observe|examine|use)\b/i,spa:/(?:^|[^\p{L}])(?:miren|mire|mirar|miramos|muestren|muestre|mostrar|mostrarles|muestra|vean|ver|observen|observar|busquen|buscar|señalen|señalar|usen|usar)(?![\p{L}])/iu});
export function requestedKinds(language,text){const r=REQUESTS[language],act=ACTIONS[language];if(!r||typeof text!=='string')return [];const sentences=text.split(/(?<=[.!?;])\s+/);return ['image','map'].filter(k=>sentences.some(x=>r[k].test(x)&&act.test(x)));}
function attributes(tag){const out={};for(const m of tag.matchAll(/([a-z-]+)="([^"]*)"/g))out[m[1]]=m[2];return out;}
// Typed inline references in markup, in source order: {namespace, contentId, label}.
export function inlineReferences(html){
 const refs=[];if(typeof html!=='string')return refs;
 for(const m of html.matchAll(/<data\b([^>]*)>([\s\S]*?)<\/data>/g)){const a=attributes(m[1]);if(a.class!=='resource-ref'||!a['data-content-id']||!a['data-resource-code'])continue;refs.push({namespace:a['data-resource-code'],contentId:a['data-content-id'],label:m[2].replace(/<[^>]*>/g,'').trim()});}
 return refs;
}
const plain=html=>html.replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
// archives: [{revision,inventory,packs}] as retained in server/fia/compiler/presentation/source-packs*.json.gz.
// raw (optional): an array of producer receipts (producer-receipt.mjs), the only accepted form of raw publisher evidence.
// Anything else (a plain object, a JSON body, a caller-declared sha or fragment, a copy of a receipt) is refused: every typed
// reference in the index then reports raw-provenance-invalid. A receipt serves a pack only when it equals the descriptor that this
// index composes from the retained compiled archive: owner (class-A rule), provenance.collection, provenance.revision, sourceFile
// and sourceFileSha256. Otherwise that pack reports raw-provenance-invalid. No production composer issues receipts yet, so in
// production every compiled reference is raw-provenance-unavailable and no explicit result is reachable.
function rawReceipts(raw){
 if(raw===null)return {byPath:new Map(),refused:null};
 if(!Array.isArray(raw)||raw.some(r=>!isProducerReceipt(r)))return {byPath:new Map(),refused:'raw-not-producer-receipt'};
 const byPath=new Map();for(const r of raw)byPath.set(r.path,byPath.has(r.path)?{invalid:'raw-duplicate-path'}:r);
 return {byPath,refused:null};
}
function rawPackOf(receipts,packId,guide){
 if(receipts.refused)return {invalid:receipts.refused};
 const r=receipts.byPath.get(guide.sourceFile);if(!r)return null;if(r.invalid)return {invalid:r.invalid};
 const descriptor={owner:GUIDE_SOURCE_CLASS.owner,collection:guide.provenance?.collection,revision:guide.provenance?.revision,path:guide.sourceFile,fileSha256:guide.sourceFileSha256};
 if(Object.keys(descriptor).some(k=>!descriptor[k]||r[k]!==descriptor[k]))return {invalid:'raw-descriptor-mismatch'};
 const paragraphs=r.packs[packId];if(!paragraphs)return null;
 return {repo:`${r.owner}/${r.collection}`,revision:r.revision,path:r.path,fileSha256:r.fileSha256,paragraphs:paragraphs.map(x=>({jsonPath:x.jsonPath,htmlSha256:sha(x.html),textSha256:sha(plain(x.html)),refs:inlineReferences(x.html)}))};
}
export function buildSourceIndex(archives,{raw=null}={}){
 if(!Array.isArray(archives)||!archives.length)throw Error('source-index-input');
 const revision=archives[0].revision;if(archives.some(a=>a?.revision!==revision||!a.packs||!Array.isArray(a.inventory)))throw Error('source-index-revision');
 const receipts=rawReceipts(raw);
 const inventory=new Map(archives.flatMap(a=>a.inventory.map(f=>[f.path,f.sha256])));
 const packs={};
 for(const archive of archives)for(const packId of Object.keys(archive.packs).sort()){
  if(packs[packId])throw Error('source-index-duplicate-pack');
  const p=archive.packs[packId],guide=p.guide,manifest=p.manifest,language=manifest.language,units=[],resources=[];
  const unitsFile=new Map((p['guide-units']?.steps??[]).flatMap(s=>s.units.map(u=>[u.id,u.textSha256])));
  for(const step of guide.steps)for(const u of step.units)units.push({unitId:u.id,stepId:step.id,textSha256:u.textSha256,computedTextSha256:sha(u.text??''),unitsFileTextSha256:unitsFile.get(u.id)??null,htmlSha256:sha(u.html??''),text:u.text??'',html:u.html??''});
  // Terms are keyed by their language-bound source id (spa-t55-v1), the id inline references carry.
  for(const t of p.resources?.terms??[])resources.push({namespace:'FIAKeyTerms',id:t.text?.sourceId??null,language:typeof t.text?.sourceId==='string'?t.text.sourceId.split('-')[0]:null,termId:t.id,title:t.title??null,sourceFile:t.sourceFile,sourceFileSha256:null,revision:manifest.sourceRevisions?.FIAKeyTerms??null,provenanceRevision:manifest.sourceRevisions?.FIAKeyTerms??null,kind:'term'});
  for(const [namespace,group] of [['FIAImages','images'],['FIAMaps','maps']])for(const a of p.resources?.[group]??[])resources.push({namespace,id:a.id,language:null,title:a.title??null,sourceFile:a.sourceFile,sourceFileSha256:a.sourceFileSha256,revision:a.titleProvenance?.revision??null,provenanceRevision:manifest.sourceRevisions?.[namespace]??null,provenanceNamespace:a.titleProvenance?.collection??null,kind:a.kind});
  const rawPack=rawPackOf(receipts,packId,guide);
  packs[packId]={packId,language,pericope:manifest.pericope,passage:manifest.passage,
   guide:{sourceId:guide.sourceId,version:guide.version,revision:guide.provenance?.revision??null,sourceFile:guide.sourceFile,sourceFileSha256:guide.sourceFileSha256,contentSha256:guide.contentSha256,packFileSha256:inventory.get(`data/packs/${packId}/guide.json`)??null},
   raw:rawPack,
   units,resources};
 }
 const identity={schema:'fia-source-association-index@1',recipe:SOURCE_ASSOCIATION_RECIPE,sourceRevision:revision,packs:Object.fromEntries(Object.entries(packs).map(([id,p])=>[id,{guide:p.guide,raw:p.raw&&(p.raw.invalid?{invalid:p.raw.invalid}:{repo:p.raw.repo,revision:p.raw.revision,path:p.raw.path,fileSha256:p.raw.fileSha256,paragraphs:p.raw.paragraphs.map(x=>x.htmlSha256)}),units:p.units.map(u=>[u.unitId,u.textSha256,u.htmlSha256]),resources:p.resources.map(r=>[r.namespace,r.id,r.sourceFileSha256,r.revision])}]))};
 return Object.freeze({schema:'fia-source-association-index@1',recipe:SOURCE_ASSOCIATION_RECIPE,sourceRevision:revision,indexSha256:sha(canonicalJSONString(identity)),packs});
}
// The decision binds the reference evidence (namespace, id, label, the unit's HTML hash), not only the text hash.
function referenceSha256(ref,unit){return sha(canonicalJSONString({namespace:ref.namespace,contentId:ref.contentId,label:ref.label,unitHtmlSha256:unit.htmlSha256}));}
function binding(pack,unit,extra={}){return {recipe:SOURCE_ASSOCIATION_RECIPE,packId:pack.packId,language:pack.language,unitId:unit.unitId,unitTextSha256:unit.textSha256,unitHtmlSha256:unit.htmlSha256,guideRevision:pack.guide.revision,guideSourceFileSha256:pack.guide.sourceFileSha256,guideContentSha256:pack.guide.contentSha256,...extra};}
function unitDrift(unit){return unit.textSha256!==unit.computedTextSha256||unit.unitsFileTextSha256!==null&&unit.unitsFileTextSha256!==unit.textSha256;}
function resourceDrift(r){return !r.revision||r.revision!==r.provenanceRevision||r.provenanceNamespace!==undefined&&r.provenanceNamespace!==r.namespace||r.kind!==NAMESPACES[r.namespace];}
// The raw paragraph anchors to a unit only by exact text hash; two units with that text hash is an ambiguous anchor.
function rawEvidence(pack,unit,ref){
 if(!pack.raw)return {state:'unavailable'};
 if(pack.raw.invalid)return {state:'invalid'};
 const paragraphs=pack.raw.paragraphs.filter(x=>x.textSha256===unit.textSha256);
 if(!paragraphs.length)return {state:'unanchored'};
 if(paragraphs.length>1||pack.units.filter(u=>u.textSha256===unit.textSha256).length>1)return {state:'ambiguous-anchor'};
 const [paragraph]=paragraphs,hits=paragraph.refs.filter(r=>r.namespace===ref.namespace&&r.contentId===ref.contentId);
 if(hits.length!==1)return {state:hits.length?'ambiguous-anchor':'compiled-only'};
 return {state:'raw',paragraphHtmlSha256:paragraph.htmlSha256,jsonPath:paragraph.jsonPath};
}
// Decisions for one pack, in unit order. Units with neither a typed reference nor a visual request get no decision.
export function associatePack(index,packId){
 const pack=index.packs[packId];if(!pack)throw Error('source-index-unknown-pack');
 const decisions=[];
 for(const unit of pack.units){
  const refs=inlineReferences(unit.html).filter(r=>Object.hasOwn(NAMESPACES,r.namespace)),kinds=requestedKinds(pack.language,unit.text);
  if(!refs.length&&!kinds.length)continue;
  const base={packId,unitId:unit.unitId,stepId:unit.stepId},pointer=`${packId}/guide.json#${unit.stepId}/${unit.unitId}`;
  if(unitDrift(unit)){decisions.push({...base,type:'unresolved',reason:'text-drift',binding:binding(pack,unit)});continue;}
  const satisfied=new Set();
  for(const ref of refs){
   const evidence={kind:'inline-resource-ref',pointer,namespace:ref.namespace,contentId:ref.contentId,label:ref.label,referenceSha256:referenceSha256(ref,unit),provenance:'retained-compiled-guide-html'};
   const same=pack.resources.filter(r=>r.namespace===ref.namespace&&r.id===ref.contentId),other=pack.resources.filter(r=>r.namespace!==ref.namespace&&r.id===ref.contentId);
   const no=reason=>decisions.push({...base,type:'unresolved',reason,evidence,binding:binding(pack,unit)});
   if(ref.namespace==='FIAKeyTerms'&&ref.contentId.split('-')[0]!==pack.language){no('language-mismatch');continue;}
   if(!same.length){no(other.length?'collection-mismatch':'missing-resource');continue;}
   if(new Set(same.map(r=>`${r.sourceFile}@${r.sourceFileSha256}@${r.termId??''}`)).size>1){no('ambiguous-id');continue;}
   const target=same[0],bound=binding(pack,unit,{namespace:target.namespace,resourceId:target.id,resourceRevision:target.revision,resourceSourceFile:target.sourceFile,resourceSourceFileSha256:target.sourceFileSha256,referenceSha256:evidence.referenceSha256});
   if(resourceDrift(target)){decisions.push({...base,type:'unresolved',reason:'revision-drift',evidence,binding:bound});continue;}
   const rawState=rawEvidence(pack,unit,ref);
   if(rawState.state!=='raw'){decisions.push({...base,type:'unresolved',reason:{unavailable:'raw-provenance-unavailable',invalid:'raw-provenance-invalid','compiled-only':'compiled-only-annotation'}[rawState.state]??rawState.state,namespace:target.namespace,resourceId:target.id,evidence,binding:bound,...(rawState.state==='unavailable'?{dependency:RAW_DEPENDENCY}:{})});continue;}
   if(NAMESPACES[target.namespace]!=='term')satisfied.add(NAMESPACES[target.namespace]);
   decisions.push({...base,type:'explicit',namespace:target.namespace,resourceId:target.id,evidence:{...evidence,provenance:'raw-publisher-html',rawRepo:pack.raw.repo,rawRevision:pack.raw.revision,rawPath:pack.raw.path,rawFileSha256:pack.raw.fileSha256,rawJsonPath:rawState.jsonPath,rawFragmentSha256:rawState.paragraphHtmlSha256},binding:{...bound,rawRevision:pack.raw.revision,rawFileSha256:pack.raw.fileSha256,rawFragmentSha256:rawState.paragraphHtmlSha256}});
  }
  for(const kind of kinds){
   if(satisfied.has(kind))continue;
   const namespace=KIND_NAMESPACE[kind],candidates=pack.resources.filter(r=>r.namespace===namespace).map(r=>({namespace,resourceId:r.id,resourceRevision:r.revision,resourceSourceFileSha256:r.sourceFileSha256}));
   // A passage candidate list is not a unit mapping, even with one candidate: the choice needs reviewed semantic evidence.
   decisions.push(candidates.length?{...base,type:'semantic-needed',kind,candidates,evidence:{kind:'visual-request',pointer},binding:binding(pack,unit)}:{...base,type:'unresolved',reason:'no-candidates',kind,binding:binding(pack,unit)});
  }
 }
 return decisions;
}
export function associateAll(index){return Object.keys(index.packs).sort().flatMap(id=>associatePack(index,id));}
// Re-check a stored decision against a current index; any identity change is drift, never a silent carry-forward.
export function verifyDecision(decision,index){
 const b=decision?.binding;if(!b||b.recipe!==SOURCE_ASSOCIATION_RECIPE)return {type:'unresolved',reason:'recipe-mismatch',decision};
 const pack=index.packs[b.packId],unit=pack?.units.find(u=>u.unitId===b.unitId);if(!pack||!unit||pack.language!==b.language)return {type:'unresolved',reason:'unit-missing',decision};
 if(unit.textSha256!==b.unitTextSha256||unitDrift(unit))return {type:'unresolved',reason:'text-drift',decision};
 if(unit.htmlSha256!==b.unitHtmlSha256)return {type:'unresolved',reason:'reference-drift',decision};
 if(pack.guide.revision!==b.guideRevision||pack.guide.sourceFileSha256!==b.guideSourceFileSha256||pack.guide.contentSha256!==b.guideContentSha256)return {type:'unresolved',reason:'revision-drift',decision};
 if(b.resourceId){const r=pack.resources.find(x=>x.namespace===b.namespace&&x.id===b.resourceId);if(!r)return {type:'unresolved',reason:'missing-resource',decision};if(r.revision!==b.resourceRevision||r.sourceFileSha256!==b.resourceSourceFileSha256||r.sourceFile!==b.resourceSourceFile||resourceDrift(r))return {type:'unresolved',reason:'revision-drift',decision};
  const ref=inlineReferences(unit.html).find(x=>x.namespace===b.namespace&&x.contentId===b.resourceId);if(!ref||referenceSha256(ref,unit)!==b.referenceSha256)return {type:'unresolved',reason:'reference-drift',decision};}
 if(b.rawRevision!==undefined&&(!pack.raw||pack.raw.invalid||pack.raw.revision!==b.rawRevision||pack.raw.fileSha256!==b.rawFileSha256||!pack.raw.paragraphs.some(x=>x.htmlSha256===b.rawFragmentSha256)))return {type:'unresolved',reason:'revision-drift',decision};
 return {type:'verified',decision};
}
const label=d=>d.type==='unresolved'?`unresolved:${d.reason}`:d.type;
// Coverage per pericope for one language and book: units, units with a decision, and counts per decision type.
export function coverageReport(index,{language,book}){
 const ids=Object.keys(index.packs).filter(id=>id.startsWith(`${language}.${book}-`)).sort((a,b)=>a.localeCompare(b,'en',{numeric:true})),rows=[],totals={pericopes:ids.length,units:0,unitsWithDecision:0,unitsExplicit:0,unitsRawProvenanceUnavailable:0,decisions:{}};
 for(const id of ids){
  const decisions=associatePack(index,id),counts={};for(const d of decisions)counts[label(d)]=(counts[label(d)]||0)+1;
  const unitsWith=t=>new Set(decisions.filter(t).map(d=>d.unitId)).size;
  const row={packId:id,passage:index.packs[id].passage,units:index.packs[id].units.length,unitsWithDecision:unitsWith(()=>true),unitsExplicit:unitsWith(d=>d.type==='explicit'),unitsRawProvenanceUnavailable:unitsWith(d=>d.reason==='raw-provenance-unavailable'),rawAvailable:Boolean(index.packs[id].raw&&!index.packs[id].raw.invalid),decisions:counts};rows.push(row);
  for(const k of ['units','unitsWithDecision','unitsExplicit','unitsRawProvenanceUnavailable'])totals[k]+=row[k];for(const [k,v] of Object.entries(counts))totals.decisions[k]=(totals.decisions[k]||0)+v;
 }
 totals.pericopesWithExplicit=rows.filter(r=>r.unitsExplicit>0).length;totals.pericopesWithDecision=rows.filter(r=>r.unitsWithDecision>0).length;totals.pericopesWithRaw=rows.filter(r=>r.rawAvailable).length;
 return {schema:'fia-source-association-coverage@1',recipe:SOURCE_ASSOCIATION_RECIPE,sourceRevision:index.sourceRevision,indexSha256:index.indexSha256,language,book,dependency:totals.pericopesWithRaw<ids.length?{missing:RAW_DEPENDENCY,next:'a reviewed class-A acquisition-profile clause and source route (Otto seat), then a trusted composer that reads the fresh-source-observation primitive on retained storage and passes producer receipts to buildSourceIndex; then re-run this report'}:null,totals,pericopes:rows};
}
