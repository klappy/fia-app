// F4 server half (cross-pericope PLAN VA1; SOURCE-TO-APP L95-L99, execution-visual-resources union).
// Declares visualResources for one ready executable publication, to a read that asks with execution=2.
// It reads only the verified presentation already being served: no fetch, no decode, no job.
// A declared asset is a focal image or map of an activity whose placement came from trusted source
// actions (trusted-source-actions.json), so nothing outside the admitted tuples is ever declared.
// Each is `preparable` with the exact demand the server will admit (F5a), or `unavailable:
// visual-ineligible` when its verified source evidence cannot qualify for visual-original@1.
// mediaManifest and publication (OFFLINE L9/L23) are not emitted here; they belong to F7a.
import trustedSourceActions from './trusted-source-actions.json' with {type:'json'};

export const VISUAL_RESOURCES_CAPABILITY='2';
const COLLECTION={image:'FIAImages',map:'FIAMaps'};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const revision=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);

export function trustedVisualPlacements(metadata=trustedSourceActions){
 const placements=new Set();
 for(const row of metadata.rows)for(const q of row.requested)placements.add(`${row.packId} ${row.unitId} ${q.id}`);
 return placements;
}

// Source evidence that visual-original@1 could take as a trusted source: an exact https URL with no
// query, fragment or credentials, a JPEG or PNG original, its verified collection and revision.
export function visualSourceEligible(asset){
 const e=asset?.sourceEvidence;
 if(!e||e.id!==asset.id||e.kind!==asset.kind||!COLLECTION[asset.kind]||asset.rights?.collection!==COLLECTION[asset.kind]||e.titleProvenance?.collection!==COLLECTION[asset.kind]||!revision(e.titleProvenance?.revision)||!hash(e.sourceFileSha256))return false;
 if(typeof e.url!=='string'||e.url.length>1024)return false;
 let url;try{url=new URL(e.url);}catch{return false;}
 return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&/\.(?:jpe?g|png)$/i.test(url.pathname);
}

// record: the ready executable catalog record being served; presentation: its verified bytes, parsed.
export function declareVisualResources({record,presentation,placements=trustedVisualPlacements()}){
 const ex=record?.execution;
 if(record?.status!=='ready'||ex?.schema!=='fia-executable-catalog@1'||presentation?.id!==record.packId||!hash(record.revision)||!hash(ex.baseRevision))return null;
 const entries=[],seen=new Set();
 for(const activity of presentation.activities){
  const assetId=activity.execution?.focalAssetId,asset=assetId&&presentation.assets[assetId];
  if(!asset||!['image','map'].includes(asset.kind)||seen.has(assetId))continue;
  if(!placements.has(`${record.packId} ${activity.sourceUnitId} ${asset.sourceEvidence?.id??asset.id}`))continue;
  seen.add(assetId);
  entries.push(visualSourceEligible(asset)
   ?{assetId,kind:asset.kind,status:'preparable',preparationDemand:{packId:record.packId,baseRevision:ex.baseRevision,sourceRevision:ex.sourceRevision,capability:'executable-presentation',visualDemand:{assetId,kind:asset.kind},expectedExecutionRevision:record.revision,...(ex.publication?{expectedPublicationGeneration:ex.publication.generation}:{})}}
   :{assetId,kind:asset.kind,status:'unavailable',reason:'visual-ineligible'});
 }
 return entries;
}
