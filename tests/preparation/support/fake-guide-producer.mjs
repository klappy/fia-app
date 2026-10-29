import {createFreshSourceObservations,JSON_CONTENT} from '../../../server/fia/preparation/executor/fresh-source-observation.mjs';
import {issueProducerReceipt} from '../../../server/fia/preparation/source-associations/producer-receipt.mjs';
// TEST ONLY (CONTRACT Q14): a fake producer standing in for the trusted composer. No production module imports this file.
// It runs the real fresh-source-observation primitive over in-memory storage and a fake publisher response, so the issuer
// receives a genuine verified read() result; overrides let tests vary each source field and the bytes handed to the issuer.
function memory(){const rows=new Map(),objects=new Map();return {storage:{get:async k=>structuredClone(rows.get(k)),async transaction(fn){return fn({get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v))});}},
 bucket:{get:async key=>{const b=objects.get(key);return b?{size:b.length,body:new Blob([b]).stream()}:null;},put:async(key,b)=>{const bytes=b instanceof Uint8Array?b.slice():new Uint8Array(await new Response(b).arrayBuffer());if(!objects.has(key))objects.set(key,bytes);return {};}}};}
export async function fakeObservedRead({bytes,owner='BibleAquifer',collection='FIATranslationGuide',revision,path,contentType='application/json',sourceVersionKind='publisher-version'}){
 const {storage,bucket}=memory(),task=createFreshSourceObservations({storage,bucket,content:JSON_CONTENT,makeStream:()=>new TransformStream(),eligibility:()=>true,
  source:{logicalId:'fake-producer',url:`https://raw.githubusercontent.com/${owner}/${collection}/${revision}/${path}`,sourceVersionKind,sourceVersion:revision,publisherVersion:sourceVersionKind==='publisher-version'?revision:null},
  policy:{revision:'fake-producer@1',maxBytes:6291456,totalMs:5000,progressMs:5000},admissions:[{checkId:'c',sequence:1,expectedPreviousObservationSha256:null,previousSourceSha256:null}],
  fetchSource:async()=>new Response(bytes,{headers:{'content-type':contentType,'content-length':String(bytes.length)}})});
 await task.observe('c');return task.read();
}
export async function fakeProducerReceipt({issuerBytes,...source}){const read=await fakeObservedRead(source);return issueProducerReceipt(read,issuerBytes??source.bytes);}
