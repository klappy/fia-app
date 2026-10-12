import pack from './pack.json' with {type:'json'};
// fb-05 B2 (option A): the publisher's list markers, inferred from the reviewed listContracts purpose —
// never from activity.kind, which also marks non-list "stop and discuss" screens as discussion (progress.js).
// The data records no <ol>/<ul>; a purpose not named here keeps today's unmarked list.
const listMarkers={discussion:'numbered',explanation:'numbered','descriptive-list':'bulleted'};
// Option A is exact only for the approved Mark 1:1–13 presentation (RESULTS-B2); every other pack keeps today's unmarked lists.
export const markedListPackId='fia-mark-authentic@1';
export function listMarker(purpose,packId=markedListPackId){return packId===markedListPackId&&Object.hasOwn(listMarkers,purpose)?listMarkers[purpose]:null;}
export function presentationContent(pack,descriptor={}){
 const {assets,activities,sections,examples=[],listContracts=[]}=pack;
 const defaultScriptureId=descriptor.defaultScriptureId||'scripture-BereanStandardBible';
 const readingGroups=Object.fromEntries(listContracts.filter(block=>block.layout==='together').map(block=>{
  const intro=activities.find(a=>a.id===block.introId);
  return [block.id,{id:block.id,kind:'guide',purpose:block.purpose,marker:listMarker(block.purpose,pack.id),text:intro.sourceText,list:block.itemIds.map(id=>({id,text:activities.find(a=>a.id===id).sourceText}))}];
 }));
 // A separate list shows one item per screen: a numbered item carries its position in its list.
 const listOrdinals=Object.fromEntries(listContracts.filter(block=>block.layout!=='together'&&listMarker(block.purpose,pack.id)==='numbered').flatMap(block=>block.itemIds.map((id,i)=>[id,i+1])));
 return {assets,activities,sections,examples,listContracts,defaultScriptureId,scripture:assets[defaultScriptureId],readingGroups,listOrdinals,contentContract:{id:descriptor.id||pack.id,source:pack.source,listContracts,steps:activities.map(a=>({id:a.id,assetId:a.assetId??null,completion:a.completion,readingGroupId:a.readingGroupId??null}))}};
}
export const bundledPresentation=pack;
export const {assets,activities,sections,examples,listContracts,defaultScriptureId,scripture,readingGroups,listOrdinals,contentContract}=presentationContent(pack);
