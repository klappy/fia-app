// Whole-book download: a thin loop over the existing per-passage download path.
// Each passage still downloads, verifies and activates through the service worker
// (DOWNLOAD_START); this file only chooses passages, totals sizes and skips work
// that is already saved. Resume comes from the worker: an interrupted passage
// keeps its verified files in its cache and the next start reuses them.
import {downloadSelectionIncludes} from './proxy-request.js';
export const tierOrder=['core','audio','visual','all'];
export const bookOf=pack=>String(pack?.pericopeId||pack?.id?.split('.')[1]||'').split('-')[0];
/** Passages of the same book and language as `pack`, in catalog order. */
export function bookPassages(packs,pack){const book=bookOf(pack);return book?(packs||[]).filter(p=>p.language===pack.language&&bookOf(p)===book):[];}
/** The tier a passage downloads for a chosen book tier: the same tier when offered,
 * otherwise the largest offered tier it contains (a passage without video saves
 * `all` as its images, never video under a no-video choice). */
export function passageTier(status,selection){
 const offered=new Set((status?.choices||[]).map(c=>c.id));if(offered.has(selection))return selection;
 const files=status?.manifest?.files||[];
 if(selection==='visual'&&offered.has('all')&&!files.some(f=>f.group==='video'))return 'all';
 for(let i=tierOrder.indexOf(selection)-1;i>=0;i--)if(offered.has(tierOrder[i]))return tierOrder[i];
 return null;
}
/** A saved passage satisfies a tier when its saved tier contains it and no update is waiting. */
export function passageSatisfied(status,tier){
 if(!status?.saved||status.updateAvailable||!tier)return false;
 return tierOrder.indexOf(status.active?.selection)>=tierOrder.indexOf(tier);
}
/** Book totals per tier. Files shared by passages (the app, the catalog, shared clips)
 * count once: the worker copies a verified file already saved by another passage
 * instead of fetching it again. `unknown` counts passages with an output whose size
 * is set during download; `remaining` leaves out files already saved on the device. */
const fileKey=f=>(f.deliveryURL||f.path)+'#'+(f.sha256||'');
export function bookTotals(statuses){
 return Object.fromEntries(tierOrder.map(id=>{
  let bytes=0,remaining=0,unknown=0,saved=0,count=0;const all=new Map(),have=new Set(),wanted=new Map();
  for(const status of statuses){const tier=passageTier(status,id);if(!tier)continue;count++;const done=passageSatisfied(status,tier);if(done)saved++;
   const files=status.manifest?.files?.filter(f=>downloadSelectionIncludes(tier,f.group));
   if(!files){const value=status.choices.find(c=>c.id===tier)?.bytes;if(Number.isFinite(value)){bytes+=value;if(!done)remaining+=value;}else if(!done)unknown++;continue;}
   if(!done&&files.some(f=>!Number.isFinite(f.bytes)))unknown++;
   for(const f of files){if(!Number.isFinite(f.bytes))continue;const key=fileKey(f);all.set(key,f.bytes);(done?have.add(key):wanted.set(key,f.bytes));}
  }
  for(const value of all.values())bytes+=value;
  for(const [key,value] of wanted)if(!have.has(key))remaining+=value;
  return [id,{bytes,remaining,unknown,saved,count}];
 }));
}
/** Statuses for every passage, a few at a time; a failed status is kept as an error entry. */
export async function bookStatuses(packs,adapter,{concurrency=4}={}){
 const out=new Array(packs.length);let next=0;
 async function worker(){while(next<packs.length){const i=next++;try{out[i]=await adapter.downloadStatus(packs[i]);}catch(error){out[i]={available:false,error:error?.message||'Status unavailable.',choices:[]};}}}
 await Promise.all(Array.from({length:Math.min(concurrency,packs.length)},worker));
 return out;
}
/** Downloads each passage in turn. Passages already saved at the tier are skipped
 * without a fetch; a stop request ends after the current passage pauses. */
export async function downloadBook(packs,selection,adapter,{onprogress=()=>{},shouldStop=()=>false}={}){
 const result={saved:0,skipped:0,failed:[],stopped:false};
 for(let i=0;i<packs.length;i++){
  if(shouldStop()){result.stopped=true;break;}
  const pack=packs[i];let status;
  try{status=await adapter.downloadStatus(pack);}catch(error){result.failed.push({pack,message:error?.message||'Status unavailable.'});continue;}
  const tier=passageTier(status,selection);
  onprogress({index:i,total:packs.length,pack,tier,transfer:null,...result});
  if(!status?.available||!tier){result.failed.push({pack,message:status?.reason||status?.error||'Not available to save.'});continue;}
  if(passageSatisfied(status,tier)){result.skipped++;continue;}
  try{const done=await adapter.download(tier,transfer=>onprogress({index:i,total:packs.length,pack,tier,transfer,...result}),pack,{});if(done?.saved===false)result.failed.push({pack,message:'Files received; recording timing is pending.'});else result.saved++;}
  catch(error){if(shouldStop()){result.stopped=true;break;}result.failed.push({pack,message:error?.message||'Download failed.'});}
 }
 onprogress({index:packs.length,total:packs.length,pack:null,tier:null,transfer:null,...result});
 return result;
}
