import {readFileSync} from 'node:fs';

// Build-time public projection only. Never bundle the server catalog, source URLs
// or review evidence, and never infer readiness from admission to preparation.
export function projectPreparationAvailability(catalog){
 const entries=new Map();
 for(const row of catalog.entries||[]){
  const s=row.selection;
  if(row.eligibility!=='eligible'||row.blockedReason||s?.quality!=='original'||s.edition!=='fia-guide'||!row.activities?.length||!/^([a-f0-9]{64})$/.test(row.accepted?.expected?.resultSha256||''))continue;
  if(!/^(eng|spa)\.MRK-\d+(?:-\d+)+$/.test(s.packId)||s.language!==s.packId.slice(0,3)||!/^([a-f0-9]{64})$/.test(s.presentationRevision)||!['packId','presentationRevision','language','edition'].every(key=>row.identity?.[key]===s[key]&&row.accepted.expected.identity?.[key]===s[key]))continue;
  const value={packId:s.packId,presentationRevision:s.presentationRevision,language:s.language,edition:s.edition};
  const key=JSON.stringify(value),activities=row.activities.filter(a=>typeof a.activityId==='string'&&typeof a.sourceUnitId==='string'&&/^[a-f0-9]{64}$/.test(a.sourceTextSha256)).map(({activityId,sourceUnitId,sourceTextSha256})=>({activityId,sourceUnitId,sourceTextSha256}));
  if(!activities.length)continue;
  const previous=entries.get(key);entries.set(key,{...value,activities:[...new Map([...(previous?.activities||[]),...activities].map(a=>[JSON.stringify(a),a])).values()]});
 }
 return [...entries.values()];
}
export function preparationAvailabilityDefinition(){
 return JSON.stringify(projectPreparationAvailability(JSON.parse(readFileSync(new URL('../../../server/fia/preparation/catalog.json',import.meta.url),'utf8'))));
}
