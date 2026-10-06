import metadata from './guide-sources.json';
import {canonicalJSONString,sha256} from './contract.mjs';
import {json,eligibleRows} from './service.mjs';
import {currentPreparationRow} from './stable-original-coordinator.mjs';
import {createGuideDiscoveryAdapter} from './executor/discovery.mjs';
import {createPresentationGuideUnitsResolver} from './executor/presentation-guide-units.mjs';
import {createGuideExecutor} from './executor/guide-executor.mjs';
const PREFIX='/v1/guide-preparations',INTERNAL='/_guide-preparation/',DEV='https://dev.fiaguide.app';
const METADATA_SHA='554e26f3d7cef0e4bb515923e4fcc081a29d407ef7291f122c6daf28205687a8',REGISTRY_SHA='4aea7044189e7e6413deaff4e69c72e3b75ab4a1d72cf1dc63f4ced9cc4ec28c';
const MODEL=Object.freeze({modelId:'Systran/faster-whisper-tiny.en',modelRevision:'60a1e73109aa75058f81191da437d3fa4ea57f1127bef81d4500e242988ad16d',configSha256:'dcc8d5382c56cf886dd548a687002dd6f1020598880b096b5b3dedb75e5b9ce6'});
const POLICY='fia-dev-guide-dispatch-inactive@1',same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b),encode=x=>new TextEncoder().encode(canonicalJSONString(x));
const METADATA_BYTES=encode(metadata),AUDIT=JSON.parse(new TextDecoder().decode(METADATA_BYTES));
let discovery;
async function guide(){return discovery??=createGuideDiscoveryAdapter({metadataBytes:METADATA_BYTES,metadataSha256:METADATA_SHA,bucket:null});}
async function bounded(fn,ms=10000){let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('guide-dispatch-timeout')),ms);})]);}finally{clearTimeout(timer);}}
async function body(response,max){if(!response.body)throw Error('guide-dispatch-body');const reader=response.body.getReader(),chunks=[],deadline=Date.now()+10000;let size=0;try{for(;;){if(Date.now()>=deadline)throw Error('guide-dispatch-timeout');const part=await bounded(()=>reader.read(),Math.max(1,deadline-Date.now()));if(part.done)break;size+=part.value.length;if(size>max)throw Error('guide-dispatch-size');chunks.push(new Uint8Array(part.value));}}finally{reader.cancel().catch(()=>{});}const result=new Uint8Array(size);let offset=0;for(const part of chunks){result.set(part,offset);offset+=part.length;}return result;}
function clean(row){const {coordinatorCurrent,...value}=structuredClone(row);return value;}
function matches(source,row){return row.selection.quality==='original'&&row.selection.packId===source.packId&&row.selection.presentationRevision===source.presentationRevision&&row.selection.language===source.language&&row.selection.edition===source.edition&&row.selection.resource===`guide:${source.stepId}`&&row.source.url===source.sourceURL&&/^[a-f0-9]{64}$/.test(row.source.sha256)&&Number.isSafeInteger(row.source.bytes)&&row.source.bytes>0&&row.source.bytes<=2097152&&same(row.activities.map(({sourceUnitId,sourceTextSha256})=>({sourceUnitId,sourceTextSha256})),source.sourceUnits);}
function current(entry,catalog){const row=currentPreparationRow(eligibleRows(catalog).filter(row=>matches(entry.source,row)));return Boolean(row&&same(clean(row),entry.authority));}
async function authorities(catalog){await guide();const result=[];for(const source of AUDIT.rows){const row=currentPreparationRow(eligibleRows(catalog).filter(row=>matches(source,row)));if(!row)continue;
 const request={packId:source.packId,presentationRevision:source.presentationRevision,language:source.language,edition:source.edition,...source.sourceUnits[0]},resolved=await(await guide()).resolveRequest(request);
 const authority=clean(row),identity={schema:'fia-guide-dispatch-operation@1',input:{...resolved.input,modelRecipe:MODEL,policyRevision:POLICY},authoritySha256:await sha256(encode(authority)),metadataSha256:METADATA_SHA,registrySha256:REGISTRY_SHA};const id=await sha256(encode(identity));result.push({id,name:`guide-preparation-v1:${id}`,identity,authority,source,request});
 }return result;}
async function presentation(env,entry){if(!env.ASSETS?.fetch)throw Error('guide-presentation-unavailable');const asset=env.ASSETS.fetch.bind(env.ASSETS);async function read(path,max){const response=await bounded(()=>asset(new Request(new URL(path,DEV),{redirect:'manual'})));if(response.status!==200)throw Error('guide-presentation-unavailable');return body(response,max);}
 const registryBytes=await read('/content/registry.json',2097152),readPresentation=descriptor=>read(descriptor.url,4194304),resolveUnits=await createPresentationGuideUnitsResolver({metadataBytes:METADATA_BYTES,metadataSha256:METADATA_SHA,registryBytes,registrySha256:REGISTRY_SHA,readPresentation});await resolveUnits(entry.identity.input);return {registryBytes,readPresentation};}
const status=record=>({schema:'fia-guide-preparation-status@1',jobId:record.id,state:record.state,reason:record.reason,selection:{packId:record.identity.input.packId,language:record.identity.input.language,edition:record.identity.input.edition,presentationRevision:record.identity.input.source.version,resource:record.identity.input.resource},statusUrl:`${PREFIX}/${record.id}`,result:null,resultSha256:null,acceptedPlaybackRanges:[]});
export async function serveGuidePreparation(request,env,catalog){const url=new URL(request.url);if(url.pathname!==PREFIX&&!url.pathname.startsWith(PREFIX+'/'))return null;
 if(env.FIA_API_ORIGIN!==DEV)return json(404,{status:'unavailable',code:'guide-preparation-disabled'});
 if(url.origin!==DEV||request.headers.has('Origin')&&request.headers.get('Origin')!==DEV)return json(403,{status:'refused',code:'untrusted-origin'});
 if(url.search)return json(400,{status:'refused',code:'invalid-request'});
 const entries=await authorities(catalog);let entry;
 if(url.pathname===PREFIX){if(request.method!=='POST')return json(405,{status:'refused',code:'method-not-allowed'});if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')return json(415,{status:'refused',code:'json-required'});
  let resolved;try{resolved=await(await guide()).resolveRequest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await body(request,4096))));}catch{return json(422,{status:'refused',code:'unsupported-guide-request'});}
  entry=entries.find(e=>same(e.identity.input,{...resolved.input,modelRecipe:MODEL,policyRevision:POLICY}));if(!entry)return json(422,{status:'refused',code:'source-authority-required'});
  try{await presentation(env,entry);}catch{return json(409,{status:'unavailable',code:'guide-presentation-invalid'});}
 }else{if(request.method!=='GET')return json(405,{status:'refused',code:'method-not-allowed'});const id=url.pathname.slice(PREFIX.length+1);entry=entries.find(e=>e.id===id);if(!entry)return json(404,{status:'unavailable',code:'unknown-guide-preparation'});}
 if(!current(entry,catalog))return json(422,{status:'refused',code:'source-authority-required'});
 if(!env.FIA_PREPARATION_JOBS||!env.FIA_ORIGINALS)return json(503,{status:'unavailable',code:'preparation-storage-unavailable'});
 return env.FIA_PREPARATION_JOBS.get(env.FIA_PREPARATION_JOBS.idFromName(entry.name)).fetch(new Request(`https://preparation.internal${INTERNAL}${entry.id}`,{method:request.method}));
}
export async function serveGuidePreparationObject(request,ctx,env,catalog){const url=new URL(request.url);if(!url.pathname.startsWith(INTERNAL))return null;
 if(env.FIA_API_ORIGIN!==DEV||url.origin!=='https://preparation.internal'||url.search||!['GET','POST'].includes(request.method))return json(404,{status:'unavailable'});
 const entry=(await authorities(catalog)).find(e=>e.id===url.pathname.slice(INTERNAL.length));if(!entry)return json(404,{status:'unavailable'});
 if(ctx.id.toString()!==env.FIA_PREPARATION_JOBS.idFromName(entry.name).toString())return json(403,{status:'refused',code:'guide-object-identity'});
 if(await ctx.storage.get('job')||await ctx.storage.get('stable-original:identity'))return json(409,{status:'refused',code:'guide-object-lane'});
 const old=await ctx.storage.get('guide-job');if(old&&(!same(old.identity,entry.identity)||old.id!==entry.id||old.schema!=='fia-guide-dispatch-job@1'||old.state!=='blocked'||!['recognition-capability-unavailable','execution-unavailable'].includes(old.reason)))return json(409,{status:'unavailable',code:'guide-job-invalid'});
 if(!current(entry,catalog))return json(409,{status:'unavailable',code:'source-authority-revoked'});
 if(request.method==='GET')return old?json(200,status(old)):json(404,{status:'unavailable',code:'not-requested'});
 if(old)return json(200,status(old));
 let ports;try{ports=await presentation(env,entry);}catch{return json(409,{status:'unavailable',code:'guide-presentation-invalid'});}
 const artifacts={dependencySha256:await sha256('fia-guide-dispatch-r2-artifacts@1'),async read(descriptor){if(!/^(?:preparation\/(?:discovery|executor)\/[a-f0-9]{64}\.json|originals\/sha256\/[a-f0-9]{64}\.mp3)$/.test(descriptor.reference))throw Error('guide-artifact-reference');const stored=await bounded(()=>env.FIA_ORIGINALS.get(descriptor.reference));if(!stored)throw Error('guide-artifact-missing');return body(new Response(stored.body),4194304);},async write(bytes){const captured=new Uint8Array(bytes),digest=await sha256(captured),reference=`preparation/executor/${digest}.json`;await bounded(()=>env.FIA_ORIGINALS.put(reference,captured,{onlyIf:{etagDoesNotMatch:'*'}}));return {sha256:digest,reference};}};
 // No recognition or acquisition capability is installed. The actual factory must refuse before either can dispatch.
 let reason='execution-unavailable';try{const executor=await createGuideExecutor({metadataBytes:METADATA_BYTES,metadataSha256:METADATA_SHA,registryBytes:ports.registryBytes,registrySha256:REGISTRY_SHA,readPresentation:ports.readPresentation,storage:ctx.storage,bucket:env.FIA_ORIGINALS,modelRecipe:MODEL,policyRevision:POLICY,admission:{dependencySha256:entry.identity.authoritySha256,check:()=>current(entry,catalog)},artifacts});
 const outcome=await executor.request(entry.request);if(outcome.state==='blocked'&&outcome.reason==='recognition-capability-unavailable')reason=outcome.reason;
 }catch{/* The inactive factory failed; persist a terminal refusal, never a phantom running attempt. */}
 if(!current(entry,catalog))return json(409,{status:'unavailable',code:'source-authority-revoked'});
 const record={schema:'fia-guide-dispatch-job@1',id:entry.id,identity:entry.identity,state:'blocked',reason};
 let result;try{result=await ctx.storage.transaction(async tx=>{if(await tx.get('job')||await tx.get('stable-original:identity'))throw Error('guide-object-lane');if(!current(entry,catalog))throw Error('guide-authority-revoked');const stored=await tx.get('guide-job');if(stored){if(stored.schema!==record.schema||stored.id!==record.id||!same(stored.identity,record.identity)||stored.state!=='blocked'||!['recognition-capability-unavailable','execution-unavailable'].includes(stored.reason))throw Error('guide-job-fence');return {created:false,record:stored};}await tx.put('guide-job',record);return {created:true,record};});}catch{return json(409,{status:'unavailable',code:'guide-state-or-authority-changed'});}return json(result.created?201:200,status(result.record));
}
