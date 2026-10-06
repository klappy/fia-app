import catalog from './catalog.json';
import {serveStableOriginal,stableOriginalRequest,currentPreparationRow} from './stable-original-coordinator.mjs';
import {json,resolveSelection,operationId,indexedCatalog,readBounded,prepareAccepted,eligibleRows} from './service.mjs';
import {createReviewedOriginalStore} from './reviewed-original-store.mjs';
import {reviewedOriginalStatus} from './reviewed-original-status.mjs';
import {canonicalJSONString,readPreparedAudio} from './contract.mjs';
import {acquireOriginal,originalResponse} from './original.mjs';
import {readSource,storeSource,sourceKey,verifySourceReference} from './source-store.mjs';

async function requireSource(ctx,env,row){
  const source=row.source,receipt=await ctx.storage.get('source');
  if(receipt?.state!=='verified'||receipt.sha256!==source.sha256||receipt.bytes!==source.bytes||receipt.key!==sourceKey(source))throw Error('source-not-verified');
  await verifySourceReference(env.FIA_ORIGINALS,source,row.identity.sourceVersion);
  const bytes=await readSource(env.FIA_ORIGINALS,source);if(!bytes)throw Error('source-not-verified');return bytes;
}

const reviewedOriginal=row=>row.accepted&&row.selection.quality==='original';
async function reviewedStore(ctx,env){
  const admissions=eligibleRows(catalog);
  return createReviewedOriginalStore({storage:ctx.storage,bucket:env.FIA_ORIGINALS,admissions,
    fetchAsset:path=>env.ASSETS.fetch(new Request(new URL(path,env.FIA_API_ORIGIN),{redirect:'manual'})),
    readOriginal:row=>requireSource(ctx,env,row),
    eligibility:row=>admissions.some(admitted=>canonicalJSONString(admitted)===canonicalJSONString(row)),
    // Authority is the deployed catalog plus this DO's source/job receipt. This
    // is not a fresh-source observation ticket or a publisher freshness claim.
    guard:async(tx,row)=>{
      const job=await tx.get('job'),source=await tx.get('source');
      return job?.admissionSha256===row.accepted.expected.resultSha256&&
        canonicalJSONString(job.selection)===canonicalJSONString(row.selection)&&
        source?.state==='verified'&&source.sha256===row.source.sha256&&source.bytes===row.source.bytes&&source.key===sourceKey(row.source);
    }
  });
}

const prefix='/v1/preparations';
const statusBody=(record,reused)=>({schema:'fia-preparation-status@1',jobId:record.jobId,state:record.state,reason:record.reason,sourceState:record.sourceState??'queued',selection:record.selection,result:record.result??null,resultSha256:record.resultSha256??null,statusUrl:`${prefix}/${record.jobId}`,reused});

export async function servePreparation(request,env){
  const url=new URL(request.url);
  const audioMatch=/^\/v1\/preparation-audio\/([0-9a-f]{64})\.mp3$/.exec(url.pathname);
  if(!audioMatch&&url.pathname!==prefix&&!url.pathname.startsWith(prefix+'/'))return null;
  if(url.origin!==env.FIA_API_ORIGIN||request.headers.has('Origin')&&request.headers.get('Origin')!==env.FIA_API_ORIGIN)return json(403,{status:'refused',code:'untrusted-origin'});
  if(url.search)return json(400,{status:'refused',code:'invalid-request'});
  let row,id;
  if(audioMatch){
    if(!['GET','HEAD'].includes(request.method))return json(405,{status:'refused',code:'method-not-allowed'});
    row=eligibleRows(catalog).find(item=>item.source.sha256===audioMatch[1]);
    if(!row)return json(404,{status:'unavailable',code:'unknown-source'});
    if(!env.FIA_PREPARATION_JOBS||!env.FIA_ORIGINALS)return json(503,{status:'unavailable',code:'preparation-storage-unavailable'});
    const reviewed=eligibleRows(catalog).filter(item=>item.source.sha256===audioMatch[1]&&reviewedOriginal(item));
    for(const candidate of reviewed){const response=await stableOriginalRequest(env,candidate,'audio',request);if(response.ok||response.status===416)return response;}
    id=await operationId(row);
    const stub=env.FIA_PREPARATION_JOBS.get(env.FIA_PREPARATION_JOBS.idFromName(id));
    return stub.fetch(new Request(`https://preparation.internal/${id}/audio`,{method:request.method,headers:request.headers}));
  }
  if(url.pathname===prefix){
    if(request.method!=='POST')return json(405,{status:'refused',code:'method-not-allowed'});
    if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')return json(415,{status:'refused',code:'json-required'});
    try{const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBounded(request,4096)));const matches=eligibleRows(catalog).filter(candidate=>resolveSelection(input,{entries:[candidate]}));row=currentPreparationRow(matches);}
    catch(error){return json(error.message==='body-too-large'?413:400,{status:'refused',code:'invalid-request'});}
    if(!row)return json(422,{status:'refused',code:'unsupported-preparation'});
    id=await operationId(row);
  }else{
    if(request.method!=='GET')return json(405,{status:'refused',code:'method-not-allowed'});
    id=url.pathname.slice(prefix.length+1);
    // Enumerate only admitted IDs before touching the namespace: arbitrary IDs
    // cannot create durable objects or persist caller-controlled data.
    row=currentPreparationRow((await indexedCatalog(catalog)).filter(entry=>entry.id===id).map(entry=>entry.row));
    if(!row)return json(404,{status:'unavailable',code:'unknown-preparation'});
  }
  if(!env.FIA_PREPARATION_JOBS||!env.FIA_ORIGINALS)return json(503,{status:'unavailable',code:'preparation-storage-unavailable'});
  const stub=env.FIA_PREPARATION_JOBS.get(env.FIA_PREPARATION_JOBS.idFromName(id));
  return stub.fetch(new Request(`https://preparation.internal/${id}`,{method:request.method}));
}

// SQLite-backed Durable Object, one bounded public operation per catalog identity.
// No provider credentials, arbitrary media fetching, caller aliases or private data.
export class FiaPreparationJobs{
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  async fetch(request){
    const stable=await serveStableOriginal(request,this.ctx,this.env,catalog);if(stable)return stable;
    if(await this.ctx.storage.get('stable-original:identity'))return json(404,{status:'unavailable'});
    const parts=new URL(request.url).pathname.slice(1).split('/'),id=parts[0],audio=parts.length===2&&parts[1]==='audio';
    const row=currentPreparationRow((await indexedCatalog(catalog)).filter(entry=>entry.id===id).map(entry=>entry.row));
    if(!row)return json(404,{status:'unavailable',code:'unknown-preparation'});
    if(audio&&reviewedOriginal(row)&&(await this.ctx.storage.get('job'))?.stableCoordinator)return stableOriginalRequest(this.env,row,'audio',request);
    if(audio){try{return originalResponse(request,row.source,await requireSource(this.ctx,this.env,row));}catch{return json(409,{status:'unavailable',code:'source-not-verified'});}}
    if(!['POST','GET'].includes(request.method))return json(405,{status:'refused',code:'method-not-allowed'});
    const {record,created}=await this.ctx.storage.transaction(async tx=>{
      const prior=await tx.get('job');
      if(prior){
        if(prior.jobId!==id)throw Error('operation-identity-conflict');
        // Evidence revision is an output admission, not a canonical input key.
        // A newly reviewed result can unblock the SAME input operation. Never
        // retry a failed admission unchanged and never serve a revoked revision.
        if(request.method==='POST'&&row.accepted&&(reviewedOriginal(row)&&!prior.stableCoordinator||prior.admissionSha256!==row.accepted.expected.resultSha256||reviewedOriginal(row)&&prior.state==='ready'&&prior.reviewedSnapshotSchema!=='fia-reviewed-original-snapshot@1')){
          const next={...prior,stableCoordinator:Boolean(reviewedOriginal(row)),state:'preparing',reason:null,result:null,resultSha256:null,resultSerialized:null,admissionSha256:row.accepted.expected.resultSha256};
          await tx.put('job',next);await tx.setAlarm(Date.now()+1);return {record:next,created:false};
        }
        return {record:prior,created:false};
      }
      if(request.method==='GET')return {record:null,created:false};
      const next={stableCoordinator:Boolean(reviewedOriginal(row)),schema:'fia-preparation-job@1',jobId:id,selection:row.selection,state:'preparing',sourceState:'queued',reason:null,result:null,resultSha256:null,admissionSha256:row.accepted?.expected.resultSha256??null};
      await tx.put('job',next);
      await tx.setAlarm(Date.now()+1);
      return {record:next,created:true};
    });
    if(!record)return json(404,{status:'unavailable',code:'not-requested'});
    if(record.stableCoordinator&&record.state!=='preparing'){
      try{const response=await stableOriginalRequest(this.env,row,'read');const outcome=await response.json();Object.assign(record,reviewedOriginalStatus(row,outcome));}catch{Object.assign(record,{state:'blocked',reason:'stable-evidence-unavailable',result:null,resultSha256:null});}
      return json(created?201:200,statusBody(record,!created));
    }
    if(record.sourceState==='verified'){
      try{await requireSource(this.ctx,this.env,row);}
      catch{return json(503,{status:'unavailable',code:'stored-source-invalid'});}
    }
    if(record.state==='ready'&&record.resultSha256!==row.accepted?.expected.resultSha256)return json(200,statusBody({...record,state:'blocked',reason:'accepted-result-changed',result:null,resultSha256:null},true));
    if(record.state==='ready'){
      try{
        if(reviewedOriginal(row))Object.assign(record,reviewedOriginalStatus(row,await(await reviewedStore(this.ctx,this.env)).read(row.accepted.expected.resultSha256)));
        else record.result=await readPreparedAudio(new TextEncoder().encode(record.resultSerialized),row.accepted.expected);
      }
      catch{return json(503,{status:'unavailable',code:'stored-result-invalid'});}
    }
    return json(created?201:200,statusBody(record,!created));
  }
  async alarm(){
    // Persist the attempt before I/O; never hold a 30s concurrency gate over
    // network work. An interrupted attempt is uncertain, not blindly replayed.
    if(this.running)return;
    this.running=true;
    try{
      if(await this.ctx.storage.get('stable-original:identity'))return;
      const record=await this.ctx.storage.get('job');
      if(!record||record.state!=='preparing')return;
      const row=currentPreparationRow((await indexedCatalog(catalog)).filter(entry=>entry.id===record.jobId).map(entry=>entry.row));
      if(!row)return;
      if(record.stableCoordinator){
        let outcome;try{const response=await stableOriginalRequest(this.env,row,'demand');const checked=await response.json();outcome=reviewedOriginalStatus(row,checked);if(outcome.state==='ready'){await verifySourceReference(this.env.FIA_ORIGINALS,row.source,row.identity.sourceVersion);if(!await readSource(this.env.FIA_ORIGINALS,row.source))throw Error('source-not-verified');await this.ctx.storage.put('source',{state:'verified',sha256:row.source.sha256,bytes:row.source.bytes,key:sourceKey(row.source)});outcome.sourceState='verified';const compatible=await(await reviewedStore(this.ctx,this.env)).demand(row.accepted.expected.resultSha256);if(compatible.state!=='ready'||compatible.resultSha256!==outcome.resultSha256)throw Error('legacy-cache-verification');}}catch{outcome={state:'blocked',reason:'stable-evidence-unavailable',result:null,resultSha256:null};}
        await this.ctx.storage.transaction(async tx=>{const current=await tx.get('job');if(current?.admissionSha256===record.admissionSha256)await tx.put('job',{...record,...outcome});});return;
      }
      let outcome;
      try{
        const source=await this.ctx.storage.get('source');
        const retained=await readSource(this.env.FIA_ORIGINALS,row.source);
        if(!retained&&source?.state==='attempting'){
          throw Error('source-attempt-interrupted');
        }
        if(!retained&&source?.state==='verified')throw Error('retained-source-missing');
        if(!retained){
          await this.ctx.storage.put('source',{state:'attempting'});
          const bytes=await acquireOriginal(row.source);
          await storeSource(this.env.FIA_ORIGINALS,row.source,bytes,row.identity.sourceVersion);
        }else await storeSource(this.env.FIA_ORIGINALS,row.source,retained,row.identity.sourceVersion);
        await this.ctx.storage.put('source',{state:'verified',sha256:row.source.sha256,bytes:row.source.bytes,key:sourceKey(row.source)});
        record.sourceState='verified';
        outcome=reviewedOriginal(row)
          ?reviewedOriginalStatus(row,await(await reviewedStore(this.ctx,this.env)).demand(row.accepted.expected.resultSha256))
          :await prepareAccepted(row,path=>this.env.ASSETS.fetch(new Request(new URL(path,this.env.FIA_API_ORIGIN),{redirect:'manual'})));
      }
      catch(error){outcome=error.message==='source-attempt-interrupted'?{state:'blocked',sourceState:'uncertain',reason:'source-attempt-interrupted',result:null,resultSha256:null}:{state:'blocked',sourceState:record.sourceState==='verified'?'verified':'failed',reason:record.sourceState==='verified'?'accepted-artifact-verification-failed':'source-verification-failed',result:null,resultSha256:null};}
      await this.ctx.storage.transaction(async tx=>{
        const current=await tx.get('job');
        if(current.admissionSha256!==record.admissionSha256){await tx.setAlarm(Date.now()+1);return;}
        await tx.put('job',{...record,...outcome});
      });
    }finally{this.running=false;}
  }
}
