const reviewed=typeof __FIA_PREPARATION_AVAILABILITY__==='undefined'?[]:__FIA_PREPARATION_AVAILABILITY__;
export function guideRecordingAvailability(pack,admissions=reviewed){
 if(pack?.capabilities?.guideNarration?.count>0)return 'Guide recordings available';
 if(admissions.some(row=>row.packId===pack?.id&&row.presentationRevision===pack?.revision&&row.language===pack?.language&&row.edition==='fia-guide'))return 'Some guide recordings available on request';
 return 'Guide recordings unavailable';
}
