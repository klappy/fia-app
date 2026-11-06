/** Show authored step links first, then the passage's explicitly available resources.
 * Availability is an honest display state, never permission to fetch or play. */
export function passageResourceIds(activities = []) {
  return [...new Set(activities.flatMap(a=>[a.assetId,...(a.availableAssetIds||[])]).filter(Boolean))];
}

export function stepResources(activity, assets = {}, availableIds = activity?.availableAssetIds || []) {
  const related = new Set([activity?.assetId, ...(activity?.relatedAssetIds || [])].filter(Boolean));
  const ids = [...new Set([...related, ...availableIds])];
  return ids.flatMap(id => {
    const asset = assets[id];
    if (!asset || !['scripture','term','image','map','video'].includes(asset.kind)) return [];
    const readable = ['scripture','term'].includes(asset.kind) && !!(asset.text || asset.verses?.some(v=>v.text));
    const available = readable || !!asset.src;
    const online = !!(asset.visualPrepared || asset.videoPrepared);
    return [{...asset, related:related.has(id), availability:available?'available':online?'online':'unavailable'}];
  });
}
