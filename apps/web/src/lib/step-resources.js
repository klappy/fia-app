/** Resources for exactly the text currently displayed. A together-list paints its
 * intro and all items; a separate-list paints only its current activity. */
export function displayedStepActivities(activity, activities = [], listContracts = []) {
  if (!activity) return [];
  const group=listContracts.find(c=>c.layout==='together' && (activity.readingGroupId===c.id || [c.introId,...c.itemIds].includes(activity.id)));
  if (!group) return [activity];
  const byId=new Map(activities.map(a=>[a.id,a]));
  return [...new Set([group.introId,...group.itemIds])].map(id=>byId.get(id)).filter(Boolean);
}
export function stepResources(activity, assets = {}, {activities = [], listContracts = []} = {}) {
  const displayed=displayedStepActivities(activity,activities,listContracts);
  // Authored expansion activities explicitly fulfill the displayed source unit.
  const displayedIds=new Set(displayed.map(a=>a.id));
  const fulfilled=activities.filter(a=>a.fulfills&&displayedIds.has(a.fulfills));
  const ids=[...new Set([...displayed,...fulfilled].flatMap(a=>[a.assetId,...(a.relatedAssetIds||[])]).filter(Boolean))];
  return ids.flatMap(id=>{
    const asset=assets[id];
    if(!asset||!['scripture','term','image','map','video'].includes(asset.kind))return [];
    const readable=['scripture','term'].includes(asset.kind)&&!!(asset.text||asset.verses?.some(v=>v.text));
    const available=readable||!!asset.src,online=!!(asset.visualPrepared||asset.videoPrepared);
    return [{...asset,availability:available?'available':online?'online':'unavailable'}];
  });
}
