// Source narration beats can share one visible screen. Exploration is not progress.
export function progressSections(sections,activities,assets){
 return sections.map(section=>{
  const screens=[];
  for(const a of activities.filter(a=>a.sectionId===section.id)){
   const id=a.readingGroupId||a.id;
   let screen=screens.at(-1);
   if(!screen||screen.id!==id){
    screen={id,activityId:a.id,assetId:a.assetId,label:a.prompt||a.title,thumbnail:['image','map'].includes(assets[a.assetId]?.kind)?assets[a.assetId].src:null,memberIds:[],kind:assets[a.assetId]?.kind||(a.kind==='discussion'?'discussion':'guide')};
    screens.push(screen);
   }
   screen.memberIds.push(a.id);
  }
  return {...section,screens};
 });
}
export function progressState(groups,session,activities){
 const activity=activities[session.index],completed=new Set(session.completed);
 const activeIndex=groups.findIndex(g=>g.id===activity?.sectionId);
 return groups.map((group,index)=>{
  const screens=group.screens.map(s=>({...s,complete:s.memberIds.every(id=>completed.has(id)),current:s.memberIds.includes(activity?.id)&&session.status!=='complete'}));
  const current=screens.findIndex(s=>s.current);
  const positionRatio=session.status==='complete'||index<activeIndex?1:index>activeIndex?0:Math.max(0,current)/Math.max(1,screens.length-1);
  return {...group,screens,current,positionRatio,active:group.id===activity?.sectionId,ratio:screens.filter(s=>s.complete).length/screens.length};
 });
}
export function visibleProgress(screens,current,limit=7){
 const start=Math.max(0,Math.min(screens.length-limit,Math.max(0,current)-Math.floor(limit/2)));
 return {screens:screens.slice(start,start+limit),before:start>0,after:start+limit<screens.length};
}
