import pack from './pack.json' with {type:'json'};
export function presentationContent(pack,descriptor={}){
 const {assets,activities,sections,examples=[],listContracts=[]}=pack;
 const defaultScriptureId=descriptor.defaultScriptureId||'scripture-BereanStandardBible';
 const readingGroups=Object.fromEntries(listContracts.filter(block=>block.layout==='together').map(block=>{
  const intro=activities.find(a=>a.id===block.introId);
  return [block.id,{id:block.id,kind:'guide',text:intro.sourceText,list:block.itemIds.map(id=>({id,text:activities.find(a=>a.id===id).sourceText}))}];
 }));
 return {assets,activities,sections,examples,listContracts,defaultScriptureId,scripture:assets[defaultScriptureId],readingGroups,contentContract:{id:descriptor.id||pack.id,source:pack.source,listContracts,steps:activities.map(a=>({id:a.id,assetId:a.assetId??null,completion:a.completion,readingGroupId:a.readingGroupId??null}))}};
}
export const bundledPresentation=pack;
export const {assets,activities,sections,examples,listContracts,defaultScriptureId,scripture,readingGroups,contentContract}=presentationContent(pack);
