const reviewed=typeof __FIA_PREPARATION_AVAILABILITY__==='undefined'?[]:__FIA_PREPARATION_AVAILABILITY__;
function matchesPack(row,pack){return row.packId===pack?.id&&row.presentationRevision===pack?.revision&&row.language===pack?.language&&row.edition==='fia-guide';}
export function hasGuidePreparation(pack,activity,admissions=reviewed){
 return admissions.some(row=>matchesPack(row,pack)&&row.activities?.some(a=>a.activityId===activity?.activityId&&a.sourceUnitId===activity?.sourceUnitId&&a.sourceTextSha256===activity?.sourceTextSha256));
}
export function guideRecordingAvailability(pack,admissions=reviewed){
 if(pack?.capabilities?.guideNarration?.count>0)return 'Guide recordings available';
 if(admissions.some(row=>matchesPack(row,pack)))return 'Some guide recordings available on request';
 return 'Guide recordings unavailable';
}
