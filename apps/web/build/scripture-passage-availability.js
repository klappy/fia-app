import {readFileSync,readdirSync} from 'node:fs';
import {validateDelivery} from '../src/lib/media-delivery.js';

// Build-time public projection of the packaged passage-only Scripture bindings: the readings whose reviewed
// passage recording the build names in the passage's offline manifest (scripts/finalize-build.mjs), keyed by
// pack, presentation revision and Scripture asset. It lets a screen declare that recording before the device
// check answers (R6/K4). Ids only: never delivery URLs, byte hashes or review evidence.
export function projectScripturePassageBindings(registry,readSidecars){
 const rows=new Map();
 for(const descriptor of registry?.packs||[]){
  const sidecars=readSidecars(descriptor.id);if(!sidecars.length)continue;
  if(sidecars.length>1)throw Error('Ambiguous delivery sidecar: '+descriptor.id);
  const sidecar=validateDelivery(sidecars[0],{packId:descriptor.id,presentationRevision:descriptor.revision});
  for(const entry of sidecar.entries){
   const assetId=entry.scriptureRangeOnly?.assetId;
   if(!assetId||entry.scripturePlaybackMode!=='passage-only'||entry.path!==`/audio/scripture/${descriptor.id}/${assetId}.opus`)continue;
   const row={packId:descriptor.id,presentationRevision:descriptor.revision,assetId};rows.set(JSON.stringify(row),row);
  }
 }
 return [...rows.values()];
}
export function scripturePassageBindingsDefinition(){
 const content=new URL('../public/content/',import.meta.url);
 const registry=JSON.parse(readFileSync(new URL('registry.json',content),'utf8'));
 const readSidecars=id=>{const dir=new URL(`delivery/${id}/`,content);let names=[];try{names=readdirSync(dir).filter(n=>n.endsWith('.json'));}catch(error){if(error.code!=='ENOENT')throw error;}return names.map(n=>JSON.parse(readFileSync(new URL(n,dir),'utf8')));};
 return JSON.stringify(projectScripturePassageBindings(registry,readSidecars));
}
