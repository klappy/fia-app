/** Only contiguous, source-linked visual activities form a sequence. Never infer by title. */
export function visualSequence(activities, assets, index) {
 const current=activities[index];
 const source=current?.fulfills||current?.sourceUnitId;
 const visual=a=>!!a&&['image','map'].includes(assets[a.assetId]?.kind);
 if(!source||!visual(current))return null;
 const belongs=a=>visual(a)&&(a.fulfills||a.sourceUnitId)===source&&a.sectionId===current.sectionId;
 let start=index,end=index;
 while(start>0&&belongs(activities[start-1]))start--;
 while(end+1<activities.length&&belongs(activities[end+1]))end++;
 const items=activities.slice(start,end+1);
 return {key:items[0].id,source,start,end,position:index-start,total:items.length};
}
