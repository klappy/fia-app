const reviewed=typeof __FIA_PREPARATION_AVAILABILITY__==='undefined'?[]:__FIA_PREPARATION_AVAILABILITY__;
const passageBindings=typeof __FIA_SCRIPTURE_PASSAGE_BINDINGS__==='undefined'?[]:__FIA_SCRIPTURE_PASSAGE_BINDINGS__;
function matchesPack(row,pack){return row.packId===pack?.id&&row.presentationRevision===pack?.revision&&row.language===pack?.language&&row.edition==='fia-guide';}
export function hasGuidePreparation(pack,activity,admissions=reviewed){
 return admissions.some(row=>matchesPack(row,pack)&&row.activities?.some(a=>a.activityId===activity?.activityId&&a.sourceUnitId===activity?.sourceUnitId&&a.sourceTextSha256===activity?.sourceTextSha256));
}
export function guideRecordingAvailability(pack,admissions=reviewed){
 if(pack?.capabilities?.guideNarration?.count>0)return 'Guide recordings available';
 if(admissions.some(row=>matchesPack(row,pack)))return 'Some guide recordings available on request';
 return 'Guide recordings unavailable';
}
// R6/K4: the packaged build declares a passage-only Scripture recording for this exact presentation and
// reading (build/scripture-passage-availability.js). A declaration only; the device check decides playback.
export function declaresScripturePassage(pack,assetId,bindings=passageBindings){
 return bindings.some(row=>row.packId===pack?.id&&row.presentationRevision===pack?.revision&&row.assetId===assetId);
}
