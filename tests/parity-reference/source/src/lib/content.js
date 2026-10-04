import pack from './pack.json' with {type:'json'};
export const {assets,activities,sections,examples,listContracts}=pack;
export const defaultScriptureId='scripture-BereanStandardBible';
export const scripture=assets[defaultScriptureId];
export const contentContract={id:pack.id,scope:'Complete default six-stage English Mark 1:1–13 flow; optional drama example on request',source:pack.source,listContracts,visualBudget:{focal:1,supporting:1},steps:activities.map(a=>({id:a.id,assetId:a.assetId??null,completion:a.completion,readingGroupId:a.readingGroupId??null}))};


// Presentation groups preserve source activity IDs, recordings and saved positions.
export const readingGroups=Object.fromEntries(
 listContracts.filter(block=>block.layout==='together').map(block=>{
  const intro=activities.find(a=>a.id===block.introId);
  return [block.id,{id:block.id,kind:'guide',text:intro.sourceText,
   list:block.itemIds.map(id=>({id,text:activities.find(a=>a.id===id).sourceText}))}];
 })
);
