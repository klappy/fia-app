import {canonicalJSONString,sha256} from './contract.mjs';
import {createHash} from 'node:crypto';
import {createVisualOriginalJob,visualOriginalIdentity,VISUAL_ORIGINAL_RECIPE_SHA256} from './visual-original.mjs';
// Routing of visual-original@1 inside FiaPreparationJobs, and the publication/read seam (PLAN §7 F7a3/F7b, server side).
// First proof only (PLAN §8a item 2): English eng.MRK-1-14-20 S02-U008, a1400 then c4. Sources come only from this
// registry, keyed by the verified base asset; nothing reaches a job from a caller URL. The URL equals the pinned base pack's
// sourceEvidence (tests check it). The Q20 family comes from the publisher path (photos/ is a photo, maps/ a map), never from
// the base data. Both bind at the retained pack's pin (collection revision, sourceFile and its sha256), as Q19 requires:
// the selection binds the coherent presentation's own sourceEvidence (CONTRACT L59; ANSWER-T5 L80; Terry's
// ANSWER-INCIDENT-ROUTE-CLASSIFICATION at cookbook 37433d2). The c4 re-bind to FIAMaps 048 (§8a item 4) belongs to a Q14
// refresh that re-pins the base presentation too; binding the source alone to 048 would be incoherent.
const f=Object.freeze;
export const VISUAL_FIRST_PROOF=f([
 f({packId:'eng.MRK-1-14-20',baseRevision:'92ad518474f159f6567124052ae12d180a482c949509da0b725593442e62f746',assetId:'a1400',kind:'image',
  source:f({kind:'photo',url:'https://s3.amazonaws.com/cbbt-er.public/media/photos/a1400/1000.jpg',sourceVersion:'FIAImages@136ff7c6b2381b84d241e27524005dcad71424ba:eng/json/019.content.json@8447fcabbe01dc1c9453465a401b5c5fb93fdb5cfb63ac1b2d29fc5a08fa988e'})}),
 f({packId:'eng.MRK-1-14-20',baseRevision:'92ad518474f159f6567124052ae12d180a482c949509da0b725593442e62f746',assetId:'c4',kind:'map',
  source:f({kind:'map',url:'https://s3.amazonaws.com/cbbt-er.public/media/maps/eng/c4/v1/original.png',sourceVersion:'FIAMaps@4bc9bb9f1d9082e5d71a047a35bf8e608f473602:eng/json/007.content.json@c2e796ad27262766e822dedbf1d212bfb9966af8b6c68353635595cf3d5fc3b1'})}),
]);
export const VISUAL_PUBLICATION_SCHEMA='fia-visual-publication@1';
// A deliberate Retry reopens an attempt at most once per this interval per source (ahead of F5a's own rate limit).
export const VISUAL_RETRY_MIN_MS=30000;
const HOST='https://visual-original.internal',HEX=/^[a-f0-9]{64}$/,ROW='visual-publication:',RETRY='visual-original:last-retry';
const json=(status,body,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const refusal=(status,reason,extra={})=>json(status,{status:'unavailable',reason,...extra});
export function firstProofEntry({packId,baseRevision,assetId}){return VISUAL_FIRST_PROOF.find(e=>e.packId===packId&&e.baseRevision===baseRevision&&e.assetId===assetId)??null;}
// The consumer is the publishing execution: which pack revision and execution revision show which asset as which kind.
export async function visualConsumerIdentity({packId,baseRevision,executionRevision,assetId,kind}){
 if(![packId,assetId].every(v=>typeof v==='string'&&v.length>0&&v.length<=128)||!HEX.test(baseRevision)||!HEX.test(executionRevision)||!['image','map'].includes(kind))throw Error('visual-consumer-invalid');
 const consumer={schema:'fia-visual-consumer@1',packId,baseRevision,executionRevision,assetId,kind};
 return {consumer,consumerSha256:await sha256(canonicalJSONString(consumer))};
}
const pathOf=(src,consumer,original)=>`/v1/original-visuals/${src}/${consumer}/${original}`;

// ---- Durable Object side: FiaPreparationJobs dispatches here first; only the internal host is handled.
export async function serveVisualOriginalObject(request,ctx,env,{now=()=>Date.now(),fetchSource}={}){
 const url=new URL(request.url);if(url.origin!==HOST)return null;
 if(!env.FIA_ORIGINALS)return refusal(503,'preparation-storage-unavailable');
 let args;try{args=request.method==='GET'||request.method==='HEAD'?Object.fromEntries(url.searchParams):await request.json();}catch{return refusal(400,'invalid-request');}
 const entry=firstProofEntry(args);if(!entry)return refusal(404,'visual-ineligible');
 // Custody: only the per-source object named by this entry's identity serves it (one object per source, PLAN §3 Custody).
 const {name}=await visualOriginalIdentity(entry.source);if(!env.FIA_PREPARATION_JOBS||ctx.id.toString()!==env.FIA_PREPARATION_JOBS.idFromName(name).toString())return refusal(409,'visual-object-custody');
 const job=createVisualOriginalJob({storage:ctx.storage,bucket:env.FIA_ORIGINALS,source:entry.source,eligibility:()=>firstProofEntry(entry)===entry,...(fetchSource?{fetchSource}:{})});
 const op=url.pathname.slice(1);
 try{
  if(op==='demand'&&request.method==='POST'){
   let retry=args.retry===true;
   if(retry){const last=await ctx.storage.get(RETRY);if(Number.isSafeInteger(last)&&now()-last<VISUAL_RETRY_MIN_MS)retry=false;else await ctx.storage.put(RETRY,now());}
   return json(200,{...await job.demand({retry}),retry:args.retry===true?(retry?'opened':'deferred'):'none'});
  }
  if(op==='read'&&request.method==='GET')return json(200,await job.read());
  if(op==='publish'&&request.method==='POST')return publish(ctx,entry,job,args);
  if(op==='serve'&&['GET','HEAD'].includes(request.method))return serve(ctx,env,entry,job,args,request);
 }catch(error){return refusal(503,'interrupted',{subReason:error?.message??null,final:false});}
 return refusal(405,'method-not-allowed');
}
async function publish(ctx,entry,job,args){
 const {consumer,consumerSha256}=await visualConsumerIdentity({packId:entry.packId,baseRevision:entry.baseRevision,executionRevision:args.executionRevision,assetId:entry.assetId,kind:entry.kind}).catch(()=>({}));
 if(!consumer)return refusal(400,'invalid-request');
 const state=await job.read();
 if(state.state!=='ready'||state.decode?.state!=='ready')return json(409,{status:'unavailable',reason:state.reason??'visual-not-ready',subReason:state.subReason??null,final:state.final??false});
 const o=state.original,d=state.decode,src=state.sourceIdentitySha256;
 const row={schema:VISUAL_PUBLICATION_SCHEMA,consumer,consumerSha256,sourceIdentitySha256:src,recipeSha256:state.recipeSha256,
  original:{sha256:o.sha256,bytes:o.bytes,mime:o.contentType,width:d.width,height:d.height,sourceKey:o.sourceKey,pixelsSha256:d.pixelsSha256},path:pathOf(src,consumerSha256,o.sha256)};
 const kept=await ctx.storage.transaction(async tx=>{const prior=await tx.get(ROW+consumerSha256);if(prior)return prior;await tx.put(ROW+consumerSha256,row);return row;});
 // A consumer publishes one original, immutably; the same publication again is idempotent, a different one is refused.
 if(canonicalJSONString(kept)!==canonicalJSONString(row))return json(409,{status:'refused',reason:'visual-publication-conflict'});
 return json(200,{status:'ready',ready:{path:row.path,sha256:o.sha256},manifestEntry:{path:row.path,group:'image',assetId:entry.assetId,kind:entry.kind,sha256:o.sha256,bytes:o.bytes,mime:o.contentType,width:d.width,height:d.height},publication:row});
}
async function serve(ctx,env,entry,job,args,request){
 if(!HEX.test(args.consumer??'')||!HEX.test(args.original??''))return refusal(400,'invalid-request');
 const row=await ctx.storage.get(ROW+args.consumer);
 if(!row||row.schema!==VISUAL_PUBLICATION_SCHEMA||row.original?.sha256!==args.original||row.consumerSha256!==args.consumer)return refusal(404,'visual-not-published');
 // Current authority: the consumer must still be a first-proof consumer of this exact base revision, under today's recipe.
 if(row.consumer.packId!==entry.packId||row.consumer.baseRevision!==entry.baseRevision||row.consumer.assetId!==entry.assetId||row.recipeSha256!==VISUAL_ORIGINAL_RECIPE_SHA256)return refusal(410,'visual-publication-stale');
 const state=await job.read();
 // The job re-verifies its custody (receipt, head, retained bytes) on read: a failure there is an integrity refusal.
 if(state.reason==='retained-evidence-unavailable')return refusal(409,'visual-original-integrity',{subReason:state.subReason??null});
 if(state.state!=='ready'||state.original?.sha256!==row.original.sha256||state.decode?.pixelsSha256!==row.original.pixelsSha256)return refusal(409,'visual-publication-stale',{subReason:state.subReason??state.reason??null});
 const etag=`"${row.original.sha256}"`,headers={'content-type':row.original.mime,etag,'cache-control':'private, no-cache','x-content-type-options':'nosniff','accept-ranges':'none'};
 if(request.headers.has('range'))return refusal(416,'range-not-supported');
 if(request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers});
 // Serving re-reads and re-hashes the exact retained bytes on every request; a mismatch is a typed refusal, never served.
 const object=await env.FIA_ORIGINALS.get(row.original.sourceKey);
 if(!object||object.size!==row.original.bytes)return refusal(409,'visual-original-integrity');
 const bytes=new Uint8Array(await object.arrayBuffer());
 if(bytes.length!==row.original.bytes||createHash('sha256').update(bytes).digest('hex')!==row.original.sha256)return refusal(409,'visual-original-integrity');
 return new Response(request.method==='HEAD'?null:bytes,{status:200,headers:{...headers,'content-length':String(bytes.length)}});
}

// ---- Worker side: the only callers of the internal namespace. F5a's admission calls demand/publish after its compare-and-swap.
async function stubFor(env,entry){const {name}=await visualOriginalIdentity(entry.source);return env.FIA_PREPARATION_JOBS.get(env.FIA_PREPARATION_JOBS.idFromName(name));}
// An object still on the previous code answers the internal namespace with something else: typed, non-final, never a 500.
async function internal(env,entry,path,init){
 if(!env.FIA_PREPARATION_JOBS||!env.FIA_ORIGINALS)return {status:'unavailable',reason:'preparation-storage-unavailable',final:false};
 let response;try{response=await (await stubFor(env,entry)).fetch(new Request(HOST+path,init));}catch{return {status:'unavailable',reason:'interrupted',subReason:'visual-object-unreachable',final:false};}
 let body;try{body=await response.json();}catch{body=null;}
 if(!body||typeof body!=='object'||!('state' in body||'status' in body))return {status:'unavailable',reason:'interrupted',subReason:'visual-object-version-skew',final:false};
 return body;
}
const post=body=>({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
export async function demandVisual(env,{packId,baseRevision,assetId,retry=false}){const entry=firstProofEntry({packId,baseRevision,assetId});if(!entry)return {status:'unavailable',reason:'visual-ineligible',final:false};return internal(env,entry,'/demand',post({packId,baseRevision,assetId,retry:retry===true}));}
export async function readVisual(env,{packId,baseRevision,assetId}){const entry=firstProofEntry({packId,baseRevision,assetId});if(!entry)return {status:'unavailable',reason:'visual-ineligible',final:false};return internal(env,entry,'/read?'+new URLSearchParams({packId,baseRevision,assetId}),{method:'GET'});}
export async function publishVisual(env,{packId,baseRevision,executionRevision,assetId}){const entry=firstProofEntry({packId,baseRevision,assetId});if(!entry)return {status:'unavailable',reason:'visual-ineligible',final:false};return internal(env,entry,'/publish',post({packId,baseRevision,assetId,executionRevision}));}
// Public read route: GET/HEAD /v1/original-visuals/<sourceIdentitySha>/<consumerSha>/<originalSha>, nothing else.
const ROUTE=/^\/v1\/original-visuals\/([a-f0-9]{64})\/([a-f0-9]{64})\/([a-f0-9]{64})$/;
let sourceIndex=null;
export async function serveOriginalVisual(request,env){
 const url=new URL(request.url);if(!url.pathname.startsWith('/v1/original-visuals/')&&url.pathname!=='/v1/original-visuals')return null;
 const m=ROUTE.exec(url.pathname);if(!m||url.search)return refusal(m?400:404,m?'invalid-request':'unknown-visual');
 if(!['GET','HEAD'].includes(request.method))return refusal(405,'method-not-allowed');
 sourceIndex??=new Map(await Promise.all(VISUAL_FIRST_PROOF.map(async e=>[(await visualOriginalIdentity(e.source)).sourceIdentitySha256,e])));
 const entry=sourceIndex.get(m[1]);if(!entry)return refusal(404,'unknown-visual');
 if(!env.FIA_PREPARATION_JOBS||!env.FIA_ORIGINALS)return refusal(503,'preparation-storage-unavailable');
 const query=new URLSearchParams({packId:entry.packId,baseRevision:entry.baseRevision,assetId:entry.assetId,consumer:m[2],original:m[3]});
 const headers=new Headers();for(const h of ['if-none-match','range'])if(request.headers.has(h))headers.set(h,request.headers.get(h));
 try{return await (await stubFor(env,entry)).fetch(new Request(`${HOST}/serve?${query}`,{method:request.method,headers}));}
 catch{return refusal(503,'interrupted',{final:false});}
}

// ---- The capabilities.visuals port for F5a (Auggie's executable operations call demand at most once per admitted demand).
// demand: {packId,baseRevision,sourceRevision,executionRevision,assetId,kind,retry} -> the visual-original@1 outcome shape.
// When the original is decoded ready, the port also publishes it for that exact executionRevision (the same fence F5a checks
// before and after), and returns the publication beside the outcome. published: the read side for the visualResources declaration.
const DEMAND_KEYS='assetId,baseRevision,executionRevision,kind,packId,retry,sourceRevision';
export function createVisualsPort(env){
 async function demand(request){
  if(!request||typeof request!=='object'||Object.keys(request).sort().join()!==DEMAND_KEYS||typeof request.retry!=='boolean'||!HEX.test(request.executionRevision??'')||typeof request.sourceRevision!=='string')return {state:'unavailable',reason:'execution-admission-refused',final:false};
  const entry=firstProofEntry(request);if(!entry||entry.kind!==request.kind)return {state:'unavailable',reason:'visual-ineligible',subReason:'not-first-proof',final:false};
  const outcome=await demandVisual(env,{packId:entry.packId,baseRevision:entry.baseRevision,assetId:entry.assetId,retry:request.retry});
  if(outcome?.state!=='ready')return outcome?.state?outcome:{state:'unavailable',reason:outcome?.reason??'interrupted',subReason:outcome?.subReason??null,final:false};
  const publication=await publishVisual(env,{packId:entry.packId,baseRevision:entry.baseRevision,executionRevision:request.executionRevision,assetId:entry.assetId});
  return {...outcome,publication:publication?.status==='ready'?{ready:publication.ready,manifestEntry:publication.manifestEntry}:null};
 }
 async function published({packId,baseRevision,executionRevision,assetId}){
  const entry=firstProofEntry({packId,baseRevision,assetId});if(!entry)return null;
  const state=await readVisual(env,{packId,baseRevision,assetId});if(state?.state!=='ready')return null;
  const publication=await publishVisual(env,{packId,baseRevision,executionRevision,assetId});
  return publication?.status==='ready'?{ready:publication.ready,manifestEntry:publication.manifestEntry}:null;
 }
 return Object.freeze({demand,published});
}
