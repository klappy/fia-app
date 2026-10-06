import {sha256} from './contract.mjs';
import {readBounded,json} from './service.mjs';

const chunkSize=65536,maxBytes=2*1024*1024;
export async function acquireOriginal(source,fetchSource=fetch){
  if(!Number.isSafeInteger(source.bytes)||source.bytes<1||source.bytes>maxBytes)throw Error('source-limit');
  const response=await fetchSource(source.url,{redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(response.status!==200||response.headers.get('Content-Type')?.split(';')[0].trim()!=='audio/mpeg')throw Error('source-response');
  const bytes=await readBounded(response,source.bytes);
  if(bytes.byteLength!==source.bytes||await sha256(bytes)!==source.sha256)throw Error('source-identity');
  return bytes;
}
export async function storeOriginal(storage,source,bytes){
  const count=Math.ceil(bytes.byteLength/chunkSize);
  await storage.transaction(async tx=>{
    for(let n=0;n<count;n++)await tx.put(`source:${n}`,bytes.slice(n*chunkSize,(n+1)*chunkSize));
    await tx.put('source',{state:'verified',sha256:source.sha256,bytes:source.bytes,chunks:count});
  });
}
export async function readOriginal(storage,source){
  const meta=await storage.get('source');
  if(meta?.state!=='verified'||meta.sha256!==source.sha256||meta.bytes!==source.bytes||meta.chunks!==Math.ceil(source.bytes/chunkSize))throw Error('source-not-verified');
  const bytes=new Uint8Array(source.bytes);
  for(let n=0;n<meta.chunks;n++){
    const chunk=await storage.get(`source:${n}`);
    if(!(chunk instanceof Uint8Array)||chunk.byteLength!==Math.min(chunkSize,source.bytes-n*chunkSize))throw Error('source-chunk-invalid');
    bytes.set(chunk,n*chunkSize);
  }
  if(await sha256(bytes)!==source.sha256)throw Error('source-bytes-invalid');
  return bytes;
}
export function originalResponse(request,source,bytes){
  // Immutable storage identity is separate from current serving eligibility.
  // A browser cache must not bypass a later source revocation.
  const headers={'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','ETag':`"${source.sha256}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if(!['GET','HEAD'].includes(request.method))return json(405,{status:'refused',code:'method-not-allowed'});
  const range=request.headers.get('Range'),ifRange=request.headers.get('If-Range');
  let start=0,end=bytes.byteLength-1,status=200;
  if(range&&(!ifRange||ifRange===headers.ETag)){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!match||!match[1]&&!match[2])return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${bytes.byteLength}`}});
    if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
    else start=Math.max(0,bytes.byteLength-Number(match[2]));
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=bytes.byteLength)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${bytes.byteLength}`}});
    status=206;headers['Content-Range']=`bytes ${start}-${end}/${bytes.byteLength}`;
  }
  headers['Content-Length']=String(end-start+1);
  return new Response(request.method==='HEAD'?null:bytes.slice(start,end+1),{status,headers});
}
