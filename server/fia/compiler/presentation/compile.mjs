import {projectExecutablePresentation} from './source-action-projector.mjs';
import {reportPack} from '../../../../apps/web/src/lib/spanish-coverage.js';
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
// Honest-text rules (release/changes/2026-11-09-spanish-luke-honest-text.md). build.mjs compiles English Mark with
// {frozen:true}: those presentation revisions are bound into guide-sources metadata (guide-dispatch METADATA_SHA) and the
// Mark 1:14-20 prepared-audio delivery, so they stay byte-identical until that chain is re-pinned. Nothing here invents
// text: titles come from the FIAKeyTerms body's own headword or the source key, never from a translator.
const TERM_LINK=/^(eng|spa)-t(\d+)-v\d+$/;// raw FIAKeyTerms content id as the guide HTML links it
export const resolveResourceLink=(id,assets)=>{if(assets[id])return id;const m=TERM_LINK.exec(String(id));const term=m&&`term-${m[1]}-t${m[2]}`;return term&&assets[term]?term:null;};
const TITLE_KEY=/^[a-z0-9]+(?:-[a-z0-9]+)*$/,HEADWORD=/^\s*<p>\s*(?:[^<.]{0,16})?<b>([^<]+)<\/b>/,SMALL_WORDS=new Set(['of','the','and','or','in','a','an','to','for']),SPANISH_SMALL_WORDS=new Set(['de','del','la','el','los','las','y','o','en','al','un','una','lo','a']);
const sourceTitle=a=>a?.sourceEvidence?.title??a?.sourceRecord?.title??a?.title;
// The English twin of a Spanish term, by term number. A compiled English pack carries term-eng-tN; the approved
// eng.MRK-1-1-13 presentation (the twin of spa.MRK-1-1-13) carries the legacy FIAKeyTerms content id eng-tN-vN.
export const siblingTerm=(sibling,n)=>{const assets=sibling?.assets;if(!assets)return null;return assets[`term-eng-t${n}`]||Object.values(assets).find(a=>a.kind==='term'&&TERM_LINK.exec(String(a.id))?.[2]===String(n))||null;};
// The card title for a key term: the source title unless it is the FIAKeyTerms key (holy-spirit, or the English title in
// key form); then for English the key written out, for Spanish the headword the term's own Spanish text opens with
// (<p>El <b>Espíritu Santo</b> …, first letter capitalised), else the key as it is, marked as the English fallback so the
// render path can say '[ES needed]' beside it.
const keyOf=s=>String(s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
// A derived title (the key written out, or the headword) names the source title it came from in titleProvenance.derivedFrom,
// so the executable candidate contract (source-action-candidates.mjs) can bind the asset to its evidence by that title.
// The marker form keeps the key itself as the title; withheld says why a headword that exists was not used.
const fallback=(title,withheld)=>({title,titleProvenance:{status:'missing',badge:'not-yet-in-language',fallback:'eng',...(withheld?{withheld}:{})}});
const contentWords=(words,small)=>words.filter(w=>w&&!small.has(w.toLowerCase())).length;
export function termTitle(t,{language,sibling}={}){
 const title=String(t.title||'').trim(),head=HEADWORD.exec(t.text?.html||'');
 const twin=siblingTerm(sibling,t.termNumber),isKey=TITLE_KEY.test(title)&&(twin?keyOf(sourceTitle(twin))===title:language==='eng'||title.includes('-'));
 if(!isKey)return {title,titleProvenance:{status:'source'}};
 if(language==='eng')return {title:title.split('-').map((w,i)=>i&&SMALL_WORDS.has(w)?w:w[0].toUpperCase()+w.slice(1)).join(' '),titleProvenance:{status:'source',from:'FIAKeyTerms key',derivedFrom:t.title}};
 if(head){
  const word=plain(head[1]);
  // A compound key (synagogue-ruler) needs a phrase with as many content words as the key: a shorter phrase names only part
  // of the compound (t134's Spanish text opens by defining a <b>sinagoga</b>), so the marker shows rather than a guess.
  if(contentWords(word.split(/\s+/),SPANISH_SMALL_WORDS)<contentWords(title.split('-'),SMALL_WORDS))return fallback(title,'compound-key');
  return {title:word.charAt(0).toLocaleUpperCase('es')+word.slice(1),titleProvenance:{status:'source',from:'FIAKeyTerms headword',derivedFrom:t.title}};
 }
 return fallback(title);
}
const squash=s=>String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
// Two terms in one pack must not share a title: in spa.MRK-5-21-34 t133 synagogue and t134 synagogue-ruler both open with
// <b>sinagoga</b>. A headword that another term's title (headword or source) already uses is withheld for the marker; a
// collision is never resolved by guessing which term the phrase names. Returns the ids of the terms withheld.
export function withholdCollidingHeadwords(assets){
 const terms=Object.values(assets).filter(a=>a.kind==='term'),count=new Map();
 for(const a of terms)count.set(squash(a.title),(count.get(squash(a.title))||0)+1);
 const withheld=[];
 for(const a of terms)if(a.titleProvenance?.from==='FIAKeyTerms headword'&&count.get(squash(a.title))>1){Object.assign(a,fallback(String(a.sourceEvidence?.title??a.titleProvenance.derivedFrom).trim(),'collision'));withheld.push(a.id);}
 return withheld;
}
// A unit whose whole text is the stage title, the passage reference, or the two run together is a layout header that
// leaked into the guide as a step (eng.LUK-5-12-16 S05-U001/U002, eng.LUK-7-36-8-3 S02-U001/U002, eng.MRK-2-23-3-6 S02-U001).
export const stageHeaderUnit=(u,section,{passage,title})=>{const t=squash(u.text);if(!t)return false;const st=squash(section.title),refs=[squash(passage),squash(title)].filter(Boolean);return t===st||refs.includes(t)||refs.some(r=>t===st+r);};
function verifyEvidence(guide,evidence){
 requireThat(evidence?.packId===guide.packId&&evidence.guideContentSha256===guide.contentSha256,'semantic guide binding mismatch');
 const units=new Map(guide.steps.flatMap(s=>s.units).map(u=>[u.id,u]));
 for(const u of evidence.units||evidence.groups.flatMap(g=>[g.intro,...g.items])) requireThat(units.get(u.id)?.text===u.text&&units.get(u.id)?.textSha256===u.textSha256,'semantic unit binding mismatch');
}
export function compilePresentation(input,{listEvidence,exampleEvidence,sourceFiles=[],frozen=false,sibling=null}={}){
 const {manifest,guide,scripture,resources,rights,narration}=input;
 for(const [name,hash] of Object.entries(SOURCE_BINDINGS[manifest.packId]||{}))requireThat(digest(JSON.stringify(input[name]))===hash,`pinned source identity mismatch: ${name}`);
 requireThat(SOURCE_BINDINGS[manifest.packId],'unknown source identity');
 requireThat(manifest.packId===guide.packId&&scripture.packId===guide.packId&&resources.packId===guide.packId&&rights.packId===guide.packId,'input identity mismatch');
 requireThat(narration.entries.length===0,'unreviewed guide narration');
 verifyEvidence(guide,listEvidence);verifyEvidence(guide,exampleEvidence);
 const units=guide.steps.flatMap(s=>s.units), seen=new Set();
 for(const u of units){requireThat(!seen.has(u.id),'duplicate unit');seen.add(u.id);requireThat(digest(u.text)===u.textSha256,'source text hash mismatch');}
 const assets={},diagnostics=[];
 const rightsFor=collection=>rights.sources.find(r=>r.collection===collection);
 for(const e of scripture.editions){
  requireThat(e.status==='source'&&e.verses.length>0,'scripture source unavailable');
  const id=`scripture-${e.repo}`;assets[id]={id,kind:'scripture',title:e.short,subtitle:guide.title,text:e.verses.map(v=>v.text).join('\n'),verses:e.verses.map(v=>({...v,verse:Number(v.ref.slice(-3))})),source:`${e.repo} · ${rightsFor(e.repo)?.licence?.name||''}`,sourceEvidence:e,rights:rightsFor(e.repo),relatedIds:[]};
 }
 for(const t of resources.terms){
  const text=plain(t.text?.html),id=t.id;
  const titled=frozen?{title:t.title}:termTitle(t,{language:manifest.language,sibling});
  assets[id]={id,kind:'term',...titled,subtitle:'FIA Key Terms',text,sourceHtml:t.text?.html||'',source:`FIA Key Terms · ${rightsFor('FIAKeyTerms')?.licence?.name||''}`,sourceEvidence:t,rights:rightsFor('FIAKeyTerms'),relatedIds:[],...(t.audio?.status==='source'&&t.audio.url?{remoteAudioSrc:t.audio.url}:{} )};
 }
 if(!frozen){withholdCollidingHeadwords(assets);for(const a of Object.values(assets))if(a.kind==='term'&&a.titleProvenance?.withheld)diagnostics.push({code:'term-headword-withheld',assetId:a.id,reason:a.titleProvenance.withheld});}
 for(const key of ['images','maps','videos'])for(const r of resources[key]||[]){
  const collection={images:'FIAImages',maps:'FIAMaps',videos:'VideoBibleDictionary'}[key];
  assets[r.id]={id:r.id,kind:r.kind,title:r.title,...(!frozen&&r.titleProvenance?{titleProvenance:r.titleProvenance}:{}),description:'',relatedIds:[],source:`${collection} · ${rightsFor(collection)?.licence?.name||''}`,sourceEvidence:r,rights:rightsFor(collection),...(r.url?{remoteSrc:r.url}:{} )};
 }
 const exampleIds=new Set(exampleEvidence.units.map(u=>u.id)),listMembership=new Map();
 for(const g of listEvidence.groups)for(const u of [g.intro,...g.items])listMembership.set(u.id,g);
 const scriptureIds=Object.values(assets).filter(a=>a.kind==='scripture').map(a=>a.id);requireThat(scriptureIds.length>0,'no scripture');
 const activities=[],coverage=[],examples=[],readingSequence=[];
 for(const section of guide.steps)for(const u of section.units){
  if(exampleIds.has(u.id)){examples.push({id:u.id,tag:u.kind==='list-item'?'li':'p',html:u.html,text:u.text,sha256:u.textSha256});coverage.push({id:u.id,treatment:'optional-example',textSha256:u.textSha256});continue;}
  if(!frozen&&stageHeaderUnit(u,section,{passage:manifest.passage,title:guide.title})){diagnostics.push({code:'stage-header-unit',unitId:u.id});coverage.push({id:u.id,treatment:'stage-header',textSha256:u.textSha256});continue;}
  const group=listMembership.get(u.id),discussion=group?.purpose==='discussion'&&group.intro.id!==u.id;
  const resolve=frozen?id=>assets[id]?id:null:id=>resolveResourceLink(id,assets);
  const links=[...new Set((u.resources||[]).map(resolve).filter(Boolean))];
  for(const id of u.resources||[])if(!resolve(id))diagnostics.push({code:'unresolved-resource-link',unitId:u.id,resourceId:id});
  // Unclassified meaning stays readable and user-paced. Neither v2 pause nor hidden is consulted.
  const semantic=group?group.purpose:'unresolved-instruction';
  if(!group)diagnostics.push({code:'conservative-continuation',unitId:u.id});
  const a={id:u.id,sourceUnitId:u.id,sectionId:section.id,sectionTitle:section.title,kind:discussion?'discussion':'guide',title:section.title,eyebrow:section.title,narration:u.text,sourceText:u.text,sourceSha256:u.textSha256,prompt:u.text,completion:group?.purpose==='descriptive-list'?'auto':'confirm',duration:'',semanticStatus:semantic,relatedAssetIds:links,availableAssetIds:Object.keys(assets)};
  if(group?.layout==='together')a.readingGroupId=group.intro.id;
  activities.push(a);coverage.push({id:u.id,treatment:'text',activityId:u.id,textSha256:u.textSha256});
  if(group?.purpose==='discussion'&&group.intro.id===u.id){
   // Three readings in three translations; a pack with fewer editions reads each once instead of repeating one.
   const sequence=frozen?[0,1,2].map(i=>scriptureIds[i%scriptureIds.length]):scriptureIds.slice(0,3);readingSequence.push({sourceUnitId:u.id,editionIds:sequence});
   sequence.forEach((id,i)=>{const e=assets[id];activities.push({id:`${u.id}-reading-${i+1}`,sectionId:section.id,sectionTitle:section.title,kind:'scripture',title:guide.title,eyebrow:e.title,assetId:id,narration:e.text,prompt:e.title,completion:'confirm',duration:'',fulfills:u.id});});
  }
 }
 // A Spanish pack compiled beside its English twin records, per resource and key term, whether Spanish text is shown or
 // the English fallback is (reportPack is the same reader scripts/spanish-coverage-audit.mjs runs); the render path turns
 // 'english-fallback' into the '[ES needed]' marker. English packs never carry the field.
 if(sibling&&manifest.language==='spa')for(const item of reportPack(sibling,{id:manifest.packId,activities,assets},{capabilities:{text:{available:true}}})){if(item.group==='pericope')continue;const target=item.group==='entity'?assets[`term-spa-${item.key}`]:assets[item.id];if(target)target.spanishText=item.state;}
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
