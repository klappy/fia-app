const labels={small:'Small',medium:'Medium',large:'Large'};
export function preparedDownloadSizes(manifest,selection){
 const included=selection==='all'?['image','audio','video']:selection==='audio'?['audio']:[];
 const groups={};for(const group of ['image','audio','video']){
  const files=(manifest?.files||[]).filter(f=>f.group===group),sizes=new Set(files.map(f=>{
   if(!f.deliveryURL)return null;
   if(group==='video')return /(?:,|\/)size=small(?:,|\/)/.test(f.deliveryURL)?'small':/(?:,|\/)size=medium(?:,|\/)/.test(f.deliveryURL)?'medium':'large';
   const q=f.deliveryURL.match(/(?:,|\/)q=(low|medium|high)(?:,|\/)/)?.[1];return {low:'small',medium:'medium',high:'large'}[q]||null;
  }));
  groups[group]={included:included.includes(group),count:files.length,size:files.length&&sizes.size===1?[...sizes][0]:null};
 }
 const active=Object.values(groups).filter(g=>g.included&&g.count),sizes=new Set(active.map(g=>g.size));
 return {groups,preset:active.length&&sizes.size===1&&[...sizes][0]?[...sizes][0]:'custom',labels};
}
