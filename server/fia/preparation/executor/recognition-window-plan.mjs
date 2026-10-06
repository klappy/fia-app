import {canonicalJSONString,sha256} from '../contract.mjs';
export const WINDOW_POLICY='fia-recognition-sample-windows@1';
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
function need(ok,why){if(!ok)throw Error(`recognition-window-${why}`);}
const digest=x=>sha256(canonicalJSONString(x));
/** Pure planning: samples refer to one pinned mono 16 kHz decoded PCM clock. */
export async function planRecognitionWindows(request){
 const r=structuredClone(request);
 need(r&&Object.keys(r).sort().join()===['sourceSha256','pcmSha256','decoderSha256','modelSha256','configSha256','totalSamples','sampleRate','windowSamples','overlapSamples'].sort().join(),'shape');
 need(['sourceSha256','pcmSha256','decoderSha256','modelSha256','configSha256'].every(k=>hash(r[k])),'pins');
 need(r.sampleRate===16000&&integer(r.totalSamples)&&r.totalSamples>0&&r.totalSamples<=16000*86400,'clock');
 need(integer(r.windowSamples)&&r.windowSamples>=16000&&r.windowSamples<=16000*600&&integer(r.overlapSamples)&&r.overlapSamples<=16000*30&&r.overlapSamples*2<r.windowSamples,'bounds');
 const identity={policy:WINDOW_POLICY,...r},planSha256=await digest(identity),windows=[];
 for(let start=0;start<r.totalSamples;){
  const end=Math.min(start+r.windowSamples,r.totalSamples),index=windows.length;
  need(index<1024,'count');
  const pin={planSha256,index,startSample:start,endSampleExclusive:end};
  windows.push({...pin,windowSha256:await digest(pin)});
  if(end===r.totalSamples)break;start=end-r.overlapSamples;
 }
 return {identity,planSha256,windows,executesRecognition:false};
}
/** Records are explicit completed/uncertain/missing window states. Completed raw
 * JSON bytes must bind windowSha256 and use integer LOCAL sample offsets. No
 * inferred deduplication: overlap words retain both raw traces and block assembly.
 */
export async function projectRecognitionWindows(plan,records){
 const p=structuredClone(plan),rr=structuredClone(records);
 need(p?.identity?.policy===WINDOW_POLICY,'policy');const {policy,...request}=p.identity;
 const canonical=await planRecognitionWindows(request);need(same(p,canonical),'plan-binding');
 need(Array.isArray(rr)&&rr.length<=p.windows.length,'records');
 const byId=new Map();for(const r of rr){need(r&&['completed','uncertain','missing'].includes(r.state)&&p.windows.some(w=>w.windowSha256===r.windowSha256)&&!byId.has(r.windowSha256),'record-binding');byId.set(r.windowSha256,r);}
 const windows=[],words=[],overlapConflicts=[];
 for(const w of p.windows){
  const r=byId.get(w.windowSha256);if(!r||r.state!=='completed'){windows.push({windowSha256:w.windowSha256,index:w.index,state:r?.state??'missing',dispatch:'external-decision-required'});continue;}
  need(r.rawBytes instanceof Uint8Array&&r.rawBytes.length>0&&r.rawBytes.length<=4*1024*1024&&hash(r.rawSha256),'raw-shape');
  const bytes=new Uint8Array(r.rawBytes);need(await sha256(bytes)===r.rawSha256,'raw-hash');const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  need(raw.schema==='fia-window-raw-words@1'&&raw.windowSha256===w.windowSha256&&Array.isArray(raw.words)&&raw.words.length<=10000,'raw-binding');
  let lastStart=0,lastEnd=0,totalText=0;
  for(const [i,x]of raw.words.entries()){
   need(typeof x.word==='string'&&x.word.length>0&&(totalText+=x.word.length)<=200000&&integer(x.startSample)&&integer(x.endSampleExclusive)&&x.startSample>=lastStart&&x.endSampleExclusive>=lastEnd&&x.endSampleExclusive>x.startSample&&x.endSampleExclusive<=w.endSampleExclusive-w.startSample,'word-clock');
   lastStart=x.startSample;lastEnd=x.endSampleExclusive;
   words.push({word:x.word,startSample:w.startSample+x.startSample,endSampleExclusive:w.startSample+x.endSampleExclusive,trace:{windowSha256:w.windowSha256,rawSha256:r.rawSha256,wordIndex:i,localStartSample:x.startSample,localEndSampleExclusive:x.endSampleExclusive}});
  }
  windows.push({windowSha256:w.windowSha256,index:w.index,state:'completed',rawSha256:r.rawSha256,dispatch:'reuse-retained-only'});
 }
 // Explicit potential duplication or conflicting recognition in overlapping clocks.
 // Even equal words are preserved: repetition cannot be safely deduced from text.
 for(let i=1;i<p.windows.length;i++){
  const a=p.windows[i-1],b=p.windows[i];if(b.startSample>=a.endSampleExclusive)continue;
  const traces=words.filter(x=>[a.windowSha256,b.windowSha256].includes(x.trace.windowSha256)&&x.startSample<a.endSampleExclusive&&x.endSampleExclusive>b.startSample).map(x=>x.trace);
  if(traces.length)overlapConflicts.push({leftWindowSha256:a.windowSha256,rightWindowSha256:b.windowSha256,startSample:b.startSample,endSampleExclusive:a.endSampleExclusive,reason:'overlap-reconciliation-required',traces});
 }
 words.sort((a,b)=>a.startSample-b.startSample||a.endSampleExclusive-b.endSampleExclusive||a.trace.windowSha256.localeCompare(b.trace.windowSha256)||a.trace.wordIndex-b.trace.wordIndex);
 return {schema:'fia-window-transcript-projection@1',planSha256:p.planSha256,windows,words,overlapConflicts,status:windows.some(w=>w.state!=='completed')?'incomplete':overlapConflicts.length?'overlap-unresolved':'projected',automaticReplay:false,qualifiedForPlayback:false,acceptedPlaybackRanges:[]};
}
