export const domainStatus=result=>({ready:200,preparing:202,unavailable:404,blocked:409,refused:400}[result.status]||500);
export function json(res,status,body,headers={}) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(body));
}
export async function serveRead(req,res,url,operations) {
  const preparation=url.pathname==='/v1/presentation-preparations',poll=url.pathname.match(/^\/v1\/presentation-preparations\/([a-f0-9]{64})$/);
  if(preparation||poll){
    if(url.search){json(res,400,{status:'refused',code:'invalid-request'});return;}
    if(req.method!==(preparation?'POST':'GET')){json(res,405,{status:'refused',code:'unsupported-operation'});return;}
    let result;
    if(preparation){
      if(String(req.headers['content-type']||'').split(';')[0].trim()!=='application/json'){json(res,415,{status:'refused',code:'json-required'});return;}
      let bytes=0,chunks=[],args;try{for await(const chunk of req){bytes+=chunk.length;if(bytes>16384)throw Error();chunks.push(chunk);}args=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{json(res,400,{status:'refused',code:'invalid-request'});return;}
      result=operations.preparePresentation?await operations.preparePresentation(args):{status:'unavailable',reason:'presentation-preparation-unavailable'};
    }else result=operations.readPresentationPreparation?await operations.readPresentationPreparation({jobId:poll[1]}):{status:'unavailable',reason:'presentation-preparation-unavailable'};
    json(res,domainStatus(result),result);return;
  }
  if(req.method!=='GET'){json(res,405,{status:'refused',code:'unsupported-operation'},{Allow:'GET'});return;}
  let result;
  const pack=url.pathname.match(/^\/v1\/packs\/([^/]+)$/), artifact=url.pathname.match(/^\/v1\/artifacts\/([^/]+)$/);
  let decoded;
  try{decoded=decodeURIComponent((pack||artifact)?.[1]||'');}catch{json(res,400,{status:'refused',code:'invalid-request'});return;}
    if(pack){
      if([...url.searchParams.keys()].some(k=>k!=='revision')||url.searchParams.getAll('revision').length>1)result={status:'refused',code:'invalid-request'};
      else result=await operations.readPack({packId:decoded,...(url.searchParams.has('revision')?{revision:url.searchParams.get('revision')}:{})});
    }else if(artifact){
      result=url.search?{status:'refused',code:'invalid-request'}:await operations.readArtifact({sha256:decoded});
      if(result.status==='ready'){res.writeHead(200,{'Content-Type':result.artifact.mime,'Content-Length':result.artifact.bytes,'Cache-Control':result.cacheControl==='private, no-store'?'private, no-store':'public, max-age=31536000, immutable','ETag':`"${result.artifact.sha256}"`,'X-Content-Type-Options':'nosniff'});res.end(result.content);return;}
    }else {json(res,404,{status:'refused',code:'unsupported-operation'});return;}
  json(res,domainStatus(result),result,result.status==='preparing'?{'Retry-After':String(result.retryAfterSeconds)}:{});
}
