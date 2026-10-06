import {canonicalJSONString,sha256} from '../contract.mjs';
const MAX_JSON=2097152,MAX_PRESENTATION=4194304,HASH=/^[a-f0-9]{64}$/;
const hash=x=>typeof x==='string'&&HASH.test(x),same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
const text=x=>typeof x==='string'&&x.length>0&&x.length<=4096;
function object(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;}
function bytes(value,max){if(!(value instanceof Uint8Array)||!value.length||value.length>max)throw Error('guide-units-byte-limit');return new Uint8Array(value);}
async function json(data,pin){if(!hash(pin)||await sha256(data)!==pin)throw Error('guide-units-hash');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}
function inputFor(row){return {packId:row.packId,book:row.book,language:row.language,edition:row.edition,passage:row.publisherPassage,resource:row.stepId,scriptSha256:row.guideContentSha256,source:{publisherId:'fia-guide',resourceId:row.publisherSourceId,version:row.presentationRevision}};}
// Trusted immutable metadata/registry pins and a bounded retained-byte port only.
// This resolver does not discover sources, fetch media, run ASR, or accept timing.
export async function createPresentationGuideUnitsResolver({metadataBytes,metadataSha256,registryBytes,registrySha256,readPresentation,totalMs=30000,presentationAliases=[]}){
 const metadataCopy=bytes(metadataBytes,MAX_JSON),registryCopy=bytes(registryBytes,MAX_JSON),reader=readPresentation,aliases=structuredClone(presentationAliases);
 if(typeof reader!=='function'||!Number.isSafeInteger(totalMs)||totalMs<1||totalMs>30000)throw Error('guide-units-capability');
 if(!Array.isArray(aliases)||aliases.length>1000||aliases.some(a=>!object(a)||Object.keys(a).sort().join()!=='packId,presentationId,presentationSha256'||!text(a.packId)||!text(a.presentationId)||!hash(a.presentationSha256))||new Set(aliases.map(a=>a.packId+'@'+a.presentationSha256)).size!==aliases.length)throw Error('guide-units-alias');
 const metadata=await json(metadataCopy,metadataSha256),registry=await json(registryCopy,registrySha256);
 if(!object(metadata)||metadata.schema!=='fia-published-guide-sources@1'||!hash(metadata.auditSha256)||!Array.isArray(metadata.rows)||!metadata.rows.length||metadata.rows.length>10000||!object(registry)||registry.schemaVersion!==1||!Array.isArray(registry.packs)||!registry.packs.length||registry.packs.length>10000)throw Error('guide-units-schema');
 const entries=new Map();
 for(const row of metadata.rows){
  if(!object(row)||['packId','book','language','edition','publisherSourceId','publisherPassage','stepId','sourceURL'].some(k=>!text(row[k]))||['presentationRevision','guideContentSha256','sourceMetadataSha256'].some(k=>!hash(row[k]))||row.edition!=='fia-guide'||!/^S\d{2}$/.test(row.stepId)||row.packId!==`${row.language}.${row.book}-${row.publisherPassage.replaceAll(':','-')}`||!Array.isArray(row.sourceUnits)||!row.sourceUnits.length||row.sourceUnits.length>1000)throw Error('guide-units-metadata');
  const seen=new Set();for(const unit of row.sourceUnits){if(!object(unit)||Object.keys(unit).sort().join()!=='sourceTextSha256,sourceUnitId'||!new RegExp(`^${row.stepId}-U\\d{3}$`).test(unit.sourceUnitId)||!hash(unit.sourceTextSha256)||seen.has(unit.sourceUnitId))throw Error('guide-units-metadata-unit');seen.add(unit.sourceUnitId);}
  const key=canonicalJSONString([row.packId,row.presentationRevision,row.stepId]);if(entries.has(key))throw Error('guide-units-ambiguous-section');
  const matches=registry.packs.filter(pack=>pack.id===row.packId&&pack.revision===row.presentationRevision);if(matches.length!==1)throw Error('guide-units-registry-binding');const pack=matches[0],descriptor=pack.presentation;
  if(pack.language!==row.language||pack.pericopeId!==`${row.book}-${row.publisherPassage.replaceAll(':','-')}`||!object(descriptor)||descriptor.sha256!==row.presentationRevision||descriptor.url!==`/content/packs/${row.packId}/${row.presentationRevision}.json`||!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<1||descriptor.bytes>MAX_PRESENTATION)throw Error('guide-units-presentation-binding');
  entries.set(key,{row,descriptor});
 }
 return async function resolveUnits(received){
  if(!object(received)||!object(received.source))throw Error('guide-units-input');const input=structuredClone(received);if(!object(input))throw Error('guide-units-input');
  const entry=entries.get(canonicalJSONString([input.packId??null,input.source?.version??null,input.resource??null]));
  if(!entry||!same(inputFor(entry.row),Object.fromEntries(Object.keys(inputFor(entry.row)).map(key=>[key,input[key]]))))throw Error('guide-units-selection');
  const {row,descriptor}=entry,controller=new AbortController();let timer;
  try{
   const receivedBytes=await Promise.race([Promise.resolve().then(()=>reader(structuredClone(descriptor),{signal:controller.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('guide-units-read-timeout'));},totalMs);})]);
   const retained=bytes(receivedBytes,MAX_PRESENTATION);if(retained.length!==descriptor.bytes)throw Error('guide-units-presentation-length');const presentation=await json(retained,descriptor.sha256);
   if(!object(presentation)||presentation.id!==(aliases.find(a=>a.packId===row.packId&&a.presentationSha256===descriptor.sha256)?.presentationId??row.packId)||presentation.source?.guide?.contentSha256!==row.guideContentSha256||presentation.source.guide.packId!==undefined&&presentation.source.guide.packId!==row.packId||presentation.source.guide.sourceId!==undefined&&presentation.source.guide.sourceId!==row.publisherSourceId||!Array.isArray(presentation.sections)||presentation.sections.length>1000||presentation.sections.filter(section=>section.id===row.stepId).length!==1||!Array.isArray(presentation.activities)||presentation.activities.length>10000||!Array.isArray(presentation.examples)||presentation.examples.length>1000||!Array.isArray(presentation.coverage)||presentation.coverage.length>10000)throw Error('guide-units-presentation-identity');
   const expected=new Map(row.sourceUnits.map(unit=>[unit.sourceUnitId,unit.sourceTextSha256])),found=new Map();let totalText=0;
   async function add(id,content,digest,kind){
    if(!expected.has(id)||found.has(id)||typeof content!=='string'||!content.length||(totalText+=content.length)>200000||digest!==expected.get(id)||await sha256(content)!==digest)throw Error('guide-units-canonical-unit');
    const coverage=presentation.coverage.filter(item=>item.id===id);if(coverage.length!==1||coverage[0].textSha256!==undefined&&coverage[0].textSha256!==digest)throw Error('guide-units-coverage');
    if(kind==='example'&&!['optional-example','optional drama example, shown on request'].includes(coverage[0].treatment)||kind==='activity'&&coverage[0].activityId!==id)throw Error('guide-units-coverage');
    found.set(id,{activityId:id,sourceUnitId:id,sourceTextSha256:digest,text:content});
   }
   for(const activity of presentation.activities){if(!object(activity))throw Error('guide-units-activity');if(activity.id!==activity.sourceUnitId)continue;
    if(activity.sectionId===row.stepId||expected.has(activity.id)){if(activity.sectionId!==row.stepId)throw Error('guide-units-section');await add(activity.id,activity.sourceText,activity.sourceSha256,'activity');}
   }
   for(const example of presentation.examples){if(!object(example))throw Error('guide-units-example');if(expected.has(example.id)||typeof example.id==='string'&&example.id.startsWith(row.stepId+'-'))await add(example.id,example.text,example.sha256,'example');}
   if(found.size!==expected.size)throw Error('guide-units-missing');
   const units=row.sourceUnits.map(pin=>found.get(pin.sourceUnitId));
   const manifest={schema:'fia-presentation-guide-section-units@1',metadataSha256,registrySha256,presentationSha256:descriptor.sha256,packId:row.packId,language:row.language,edition:row.edition,sectionId:row.stepId,guideContentSha256:row.guideContentSha256,units:units.map(({text,...pin})=>pin)};
   return {scriptSha256:row.guideContentSha256,guideContentSha256:row.guideContentSha256,sectionManifestSha256:await sha256(canonicalJSONString(manifest)),sectionManifest:manifest,units};
  }finally{clearTimeout(timer);controller.abort();}
 };
}
