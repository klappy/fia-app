import catalog from './catalog.json';
import {json,resolveSelection,operationId,indexedCatalog,readBounded,prepareAccepted} from './service.mjs';
import {readPreparedAudio} from './contract.mjs';
import {acquireOriginal,storeOriginal,readOriginal,originalResponse} from './original.mjs';

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
    row=catalog.entries.find(item=>item.source.sha256===audioMatch[1]);
    if(!row)return json(404,{status:'unavailable',code:'unknown-source'});
    if(!env.FIA_PREPARATION_JOBS)return json(503,{status:'unavailable',code:'preparation-storage-unavailable'});
    id=await operationId(row);
    const stub=env.FIA_PREPARATION_JOBS.get(env.FIA_PREPARATION_JOBS.idFromName(id));
    return stub.fetch(new Request(`https://preparation.internal/${id}/audio`,{method:request.method,headers:request.headers}));
  }
  if(url.pathname===prefix){
    if(request.method!=='POST')return json(405,{status:'refused',code:'method-not-allowed'});
    if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')return json(415,{status:'refused',code:'json-required'});
    try{row=resolveSelection(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBounded(request,4096))),catalog);}
    catch(error){return json(error.message==='body-too-large'?413:400,{status:'refused',code:'invalid-request'});}
    if(!row)return json(422,{status:'refused',code:'unsupported-preparation'});
    id=await operationId(row);
  }else{
    if(request.method!=='GET')return json(405,{status:'refused',code:'method-not-allowed'});
    id=url.pathname.slice(prefix.length+1);
    // Enumerate only admitted IDs before touching the namespace: arbitrary IDs
    // cannot create durable objects or persist caller-controlled data.
    row=(await indexedCatalog(catalog)).find(entry=>entry.id===id)?.row;
    if(!row)return json(404,{status:'unavailable',code:'unknown-preparation'});
  }
  if(!env.FIA_PREPARATION_JOBS)return json(503,{status:'unavailable',code:'preparation-storage-unavailable'});
  const stub=env.FIA_PREPARATION_JOBS.get(env.FIA_PREPARATION_JOBS.idFromName(id));
  return stub.fetch(new Request(`https://preparation.internal/${id}`,{method:request.method}));
}

// SQLite-backed Durable Object, one bounded public operation per catalog identity.
// No provider credentials, arbitrary media fetching, caller aliases or private data.
export class FiaPreparationJobs{
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  async fetch(request){
    const parts=new URL(request.url).pathname.slice(1).split('/'),id=parts[0],audio=parts.length===2&&parts[1]==='audio';
    const row=(await indexedCatalog(catalog)).find(entry=>entry.id===id)?.row;
    if(!row)return json(404,{status:'unavailable',code:'unknown-preparation'});
    if(audio){try{return originalResponse(request,row.source,await readOriginal(this.ctx.storage,row.source));}catch{return json(409,{status:'unavailable',code:'source-not-verified'});}}
    if(!['POST','GET'].includes(request.method))return json(405,{status:'refused',code:'method-not-allowed'});
    const {record,created}=await this.ctx.storage.transaction(async tx=>{
      const prior=await tx.get('job');
      if(prior){
        if(prior.jobId!==id)throw Error('operation-identity-conflict');
        // Evidence revision is an output admission, not a canonical input key.
        // A newly reviewed result can unblock the SAME input operation. Never
        // retry a failed admission unchanged and never serve a revoked revision.
        if(request.method==='POST'&&row.accepted&&prior.admissionSha256!==row.accepted.expected.resultSha256){
          const next={...prior,state:'preparing',reason:null,result:null,resultSha256:null,resultSerialized:null,admissionSha256:row.accepted.expected.resultSha256};
          await tx.put('job',next);await tx.setAlarm(Date.now()+1);return {record:next,created:false};
        }
        return {record:prior,created:false};
      }
      if(request.method==='GET')return {record:null,created:false};
      const next={schema:'fia-preparation-job@1',jobId:id,selection:row.selection,state:'preparing',sourceState:'queued',reason:null,result:null,resultSha256:null,admissionSha256:row.accepted?.expected.resultSha256??null};
      await tx.put('job',next);
      await tx.setAlarm(Date.now()+1);
      return {record:next,created:true};
    });
    if(!record)return json(404,{status:'unavailable',code:'not-requested'});
    if(record.sourceState==='verified'){
      try{await readOriginal(this.ctx.storage,row.source);}
      catch{return json(503,{status:'unavailable',code:'stored-source-invalid'});}
    }
    if(record.state==='ready'&&record.resultSha256!==row.accepted?.expected.resultSha256)return json(200,statusBody({...record,state:'blocked',reason:'accepted-result-changed',result:null,resultSha256:null},true));
    if(record.state==='ready'){
      try{record.result=await readPreparedAudio(new TextEncoder().encode(record.resultSerialized),row.accepted.expected);}
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
      const record=await this.ctx.storage.get('job');
      if(!record||record.state!=='preparing')return;
      const row=(await indexedCatalog(catalog)).find(entry=>entry.id===record.jobId)?.row;
      if(!row)return;
      let outcome;
      try{
        const source=await this.ctx.storage.get('source');
        if(source?.state==='attempting'){
          await this.ctx.storage.put('job',{...record,state:'blocked',sourceState:'uncertain',reason:'source-attempt-interrupted'});return;
        }
        if(source?.state!=='verified'){
          await this.ctx.storage.put('source',{state:'attempting'});
          const bytes=await acquireOriginal(row.source);
          await storeOriginal(this.ctx.storage,row.source,bytes);
        }else await readOriginal(this.ctx.storage,row.source);
        record.sourceState='verified';
        outcome=await prepareAccepted(row,path=>this.env.ASSETS.fetch(new Request(new URL(path,this.env.FIA_API_ORIGIN),{redirect:'manual'})));
      }
      catch{outcome={state:'blocked',sourceState:record.sourceState==='verified'?'verified':'failed',reason:record.sourceState==='verified'?'accepted-artifact-verification-failed':'source-verification-failed',result:null,resultSha256:null};}
      await this.ctx.storage.transaction(async tx=>{
        const current=await tx.get('job');
        if(current.admissionSha256!==record.admissionSha256){await tx.setAlarm(Date.now()+1);return;}
        await tx.put('job',{...record,...outcome});
      });
    }finally{this.running=false;}
  }
}
