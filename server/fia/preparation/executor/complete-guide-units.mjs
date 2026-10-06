import {canonicalJSONString,sha256} from '../contract.mjs';
import {createPresentationGuideUnitsResolver} from './presentation-guide-units.mjs';
import {createCanonicalUnitLedgerResolver,P1_CANONICAL_LEDGER_PINS} from './canonical-unit-ledger.mjs';
const same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
/** Complete representation, deliberately not the alignment resolver interface.
 * alignmentInput is null where source dispositions need an explicit adapter.
 */
export async function createCompleteGuideUnitsResolver(options){
 const metadataSha256=options.metadataSha256,registrySha256=options.registrySha256;
 const metadataBytes=new Uint8Array(options.metadataBytes),registryBytes=new Uint8Array(options.registryBytes);
 // Both constructors synchronously capture their supplied bytes before yielding.
 const presentationPromise=createPresentationGuideUnitsResolver({...options,metadataBytes,registryBytes});
 const canonicalPromise=createCanonicalUnitLedgerResolver(options.canonicalP1);
 const [presentation,canonical]=await Promise.all([presentationPromise,canonicalPromise]);
 const metadata=JSON.parse(new TextDecoder().decode(metadataBytes));
 return async function resolve(rawInput){
  if(!rawInput||Object.getPrototypeOf(rawInput)!==Object.prototype)throw Error('complete-guide-input');
  const input=structuredClone(rawInput);let regular;
  try{regular=await presentation(input);}catch(error){
   if(error.message!=='guide-units-missing'||input.packId!=='eng.MRK-1-1-13'||!['S02','S05','S06'].includes(input.resource)||input.source?.version!==P1_CANONICAL_LEDGER_PINS.presentation)throw error;
  }
  const row=metadata.rows.find(r=>r.packId===input.packId&&r.stepId===input.resource&&r.presentationRevision===input.source.version);
  if(!row)throw Error('complete-guide-metadata-selection');
  let canonicalUnits,canonicalLedgerSha256=null;
  if(input.packId==='eng.MRK-1-1-13'){
   const ledger=canonical({packId:input.packId,sectionId:input.resource,presentationSha256:input.source.version});
   canonicalUnits=ledger.units;canonicalLedgerSha256=ledger.ledgerSha256;
  }else canonicalUnits=regular.units.map(u=>({sourceUnitId:u.sourceUnitId,sectionId:input.resource,text:u.text,sourceTextSha256:u.sourceTextSha256,narrationRole:'not-assessed'}));
  if(!same(canonicalUnits.map(({sourceUnitId,sourceTextSha256})=>({sourceUnitId,sourceTextSha256})),row.sourceUnits))throw Error('complete-guide-unit-binding');
  const identity={schema:'fia-complete-guide-section@1',metadataSha256,registrySha256,packId:input.packId,sectionId:input.resource,presentationSha256:input.source.version,guideContentSha256:row.guideContentSha256,canonicalLedgerSha256,unitPins:row.sourceUnits};
  return {identity,manifestSha256:await sha256(canonicalJSONString(identity)),canonicalUnits,
   narration:{status:regular?'existing-alignment-input':'disposition-adapter-required',reason:regular?null:'associated-pause-and-production-note-semantics-not-supported-by-alignment'},
   alignmentInput:regular??null,acceptedPlaybackRanges:[]};
 };
}
