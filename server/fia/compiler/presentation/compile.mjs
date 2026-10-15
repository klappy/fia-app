import {projectExecutablePresentation} from './source-action-projector.mjs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const SOURCE_BINDINGS=JSON.parse(readFileSync(new URL('./source-bindings.json',import.meta.url)));
export const RECIPE='834a2862ff5c044b739855111965a52fd7452680';
export const SOURCE='f8776d92b090b5af5b17b17dc1137f25fb059ed0';
export const digest=value=>createHash('sha256').update(value).digest('hex');
const requireThat=(ok,message)=>{if(!ok)throw Error(message);};
const capability=(count,status='source-referenced')=>({status:count?status:'unavailable',count});
// Text is extracted only for resource display; exact source HTML remains attached.
const plain=html=>String(html||'').replace(/<\/(?:p|li|div)>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&#(x[\da-f]+|\d+);/gi,(_,v)=>String.fromCodePoint(v[0].toLowerCase()==='x'?parseInt(v.slice(1),16):Number(v))).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,v)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[v]).trim();
function verifyEvidence(guide,evidence){
 requireThat(evidence?.packId===guide.packId&&evidence.guideContentSha256===guide.contentSha256,'semantic guide binding mismatch');
 const units=new Map(guide.steps.flatMap(s=>s.units).map(u=>[u.id,u]));
 for(const u of evidence.units||evidence.groups.flatMap(g=>[g.intro,...g.items])) requireThat(units.get(u.id)?.text===u.text&&units.get(u.id)?.textSha256===u.textSha256,'semantic unit binding mismatch');
}
export function validatePresentationInput(input,{listEvidence,exampleEvidence}={}){
 const {manifest,guide,scripture,resources,rights,narration}=input;
 for(const [name,hash] of Object.entries(SOURCE_BINDINGS[manifest.packId]||{}))requireThat(digest(JSON.stringify(input[name]))===hash,`pinned source identity mismatch: ${name}`);
 requireThat(SOURCE_BINDINGS[manifest.packId],'unknown source identity');
 requireThat(manifest.packId===guide.packId&&scripture.packId===guide.packId&&resources.packId===guide.packId&&rights.packId===guide.packId,'input identity mismatch');
 requireThat(narration.entries.length===0,'unreviewed guide narration');
 verifyEvidence(guide,listEvidence);verifyEvidence(guide,exampleEvidence);
 const units=guide.steps.flatMap(s=>s.units), seen=new Set();
 for(const u of units){requireThat(!seen.has(u.id),'duplicate unit');seen.add(u.id);requireThat(digest(u.text)===u.textSha256,'source text hash mismatch');}
 for(const e of scripture.editions)requireThat(e.status==='source'&&e.verses.length>0,'scripture source unavailable');
 requireThat(scripture.editions.length>0,'no scripture');
}
export function sourceBinding(packId){return structuredClone(SOURCE_BINDINGS[packId]??null);}
export function compilePresentation(input,{listEvidence,exampleEvidence,sourceFiles=[]}={}){
 validatePresentationInput(input,{listEvidence,exampleEvidence});
 const {manifest,guide,scripture,resources,rights}=input;
 const assets={},diagnostics=[];
 const rightsFor=collection=>rights.sources.find(r=>r.collection===collection);
 for(const e of scripture.editions){
  requireThat(e.status==='source'&&e.verses.length>0,'scripture source unavailable');
  const id=`scripture-${e.repo}`;assets[id]={id,kind:'scripture',title:e.short,subtitle:guide.title,text:e.verses.map(v=>v.text).join('\n'),verses:e.verses.map(v=>({...v,verse:Number(v.ref.slice(-3))})),source:`${e.repo} · ${rightsFor(e.repo)?.licence?.name||''}`,sourceEvidence:e,rights:rightsFor(e.repo),relatedIds:[]};
 }
 for(const t of resources.terms){
  const text=plain(t.text?.html),id=t.id;
  assets[id]={id,kind:'term',title:t.title,subtitle:'FIA Key Terms',text,sourceHtml:t.text?.html||'',source:`FIA Key Terms · ${rightsFor('FIAKeyTerms')?.licence?.name||''}`,sourceEvidence:t,rights:rightsFor('FIAKeyTerms'),relatedIds:[],...(t.audio?.status==='source'&&t.audio.url?{remoteAudioSrc:t.audio.url}:{} )};
 }
 for(const key of ['images','maps','videos'])for(const r of resources[key]||[]){
  const collection={images:'FIAImages',maps:'FIAMaps',videos:'VideoBibleDictionary'}[key];
  assets[r.id]={id:r.id,kind:r.kind,title:r.title,description:'',relatedIds:[],source:`${collection} · ${rightsFor(collection)?.licence?.name||''}`,sourceEvidence:r,rights:rightsFor(collection),...(r.url?{remoteSrc:r.url}:{} )};
 }
 const exampleIds=new Set(exampleEvidence.units.map(u=>u.id)),listMembership=new Map();
 for(const g of listEvidence.groups)for(const u of [g.intro,...g.items])listMembership.set(u.id,g);
 const scriptureIds=Object.values(assets).filter(a=>a.kind==='scripture').map(a=>a.id);requireThat(scriptureIds.length>0,'no scripture');
 const activities=[],coverage=[],examples=[],readingSequence=[];
 for(const section of guide.steps)for(const u of section.units){
  if(exampleIds.has(u.id)){examples.push({id:u.id,tag:u.kind==='list-item'?'li':'p',html:u.html,text:u.text,sha256:u.textSha256});coverage.push({id:u.id,treatment:'optional-example',textSha256:u.textSha256});continue;}
  const group=listMembership.get(u.id),discussion=group?.purpose==='discussion'&&group.intro.id!==u.id;
  const links=(u.resources||[]).filter(id=>assets[id]);
  for(const id of u.resources||[])if(!assets[id])diagnostics.push({code:'unresolved-resource-link',unitId:u.id,resourceId:id});
  // Unclassified meaning stays readable and user-paced. Neither v2 pause nor hidden is consulted.
  const semantic=group?group.purpose:'unresolved-instruction';
  if(!group)diagnostics.push({code:'conservative-continuation',unitId:u.id});
  const a={id:u.id,sourceUnitId:u.id,sectionId:section.id,sectionTitle:section.title,kind:discussion?'discussion':'guide',title:section.title,eyebrow:section.title,narration:u.text,sourceText:u.text,sourceSha256:u.textSha256,prompt:u.text,completion:group?.purpose==='descriptive-list'?'auto':'confirm',duration:'',semanticStatus:semantic,relatedAssetIds:links,availableAssetIds:Object.keys(assets)};
  if(group?.layout==='together')a.readingGroupId=group.intro.id;
  activities.push(a);coverage.push({id:u.id,treatment:'text',activityId:u.id,textSha256:u.textSha256});
  if(group?.purpose==='discussion'&&group.intro.id===u.id){
   const sequence=[0,1,2].map(i=>scriptureIds[i%scriptureIds.length]);readingSequence.push({sourceUnitId:u.id,editionIds:sequence});
   sequence.forEach((id,i)=>{const e=assets[id];activities.push({id:`${u.id}-reading-${i+1}`,sectionId:section.id,sectionTitle:section.title,kind:'scripture',title:guide.title,eyebrow:e.title,assetId:id,narration:e.text,prompt:e.title,completion:'confirm',duration:'',fulfills:u.id});});
  }
 }
 const listContracts=listEvidence.groups.map(g=>({id:g.intro.id,purpose:g.purpose,layout:g.layout,progression:g.purpose==='discussion'?'confirm':'auto',introId:g.intro.id,itemIds:g.items.map(u=>u.id),reason:'Reviewed source-bound list semantics; text without audio waits for explicit continuation.',narration:[]}));
 const pack={id:manifest.packId,title:guide.title,assets,listContracts,activities,sections:guide.steps.map(({id,title})=>({id,title})),examples,source:{repository:'klappy/fia-app',commit:SOURCE,guide:{...guide,steps:undefined},rights,sourceFiles,recipeRevision:RECIPE},coverage,scriptureReadingSequence:readingSequence,diagnostics};
 const capabilities={text:{available:true},guideNarration:capability(0),scriptureAudio:capability(0),resourceAudio:capability(Object.values(assets).filter(a=>a.remoteAudioSrc).length),generatedAudio:capability(0),images:capability(Object.values(assets).filter(a=>['image','map'].includes(a.kind)&&a.remoteSrc).length),video:capability(Object.values(assets).filter(a=>a.kind==='video'&&a.remoteSrc).length)};
 return {pack,capabilities,defaultScriptureId:scriptureIds[0],diagnostics};
}
export function describe(manifest,bytes,{capabilities,defaultScriptureId,diagnostics=[]}){
 const sha256=digest(bytes);return {id:manifest.packId,language:manifest.language,pericopeId:manifest.pericope,title:JSON.parse(bytes).title,defaultScriptureId,revision:sha256,presentation:{url:`/content/packs/${manifest.packId}/${sha256}.json`,sha256,bytes:Buffer.byteLength(bytes)},capabilities,diagnostics};
}

// Optional execution hook shares the portable domain projector with the Worker.
// Existing synchronous compilation remains unchanged when execution is not requested.
export async function compileExecutablePresentation(input,{sourceActions,...options}){
 const compiled=compilePresentation(input,options);
 const projected=await projectExecutablePresentation({...sourceActions,basePresentation:compiled.pack});
 return {...compiled,...projected,pack:projected.presentation};
}
