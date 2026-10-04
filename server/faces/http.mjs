export const domainStatus=result=>({ready:200,preparing:202,unavailable:404,refused:400}[result.status]||500);
export function json(res,status,body,headers={}) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(body));
}
export async function serveRead(req,res,url,operations) {
  if(req.method!=='GET'){json(res,405,{status:'refused',code:'unsupported-operation'},{Allow:'GET'});return;}
  let result;
  try {
    const pack=url.pathname.match(/^\/v1\/packs\/([^/]+)$/), artifact=url.pathname.match(/^\/v1\/artifacts\/([^/]+)$/);
    if(pack){
      if([...url.searchParams.keys()].some(k=>k!=='revision')||url.searchParams.getAll('revision').length>1)result={status:'refused',code:'invalid-request'};
      else result=await operations.readPack({packId:decodeURIComponent(pack[1]),...(url.searchParams.has('revision')?{revision:url.searchParams.get('revision')}:{})});
    }else if(artifact){
      result=url.search?{status:'refused',code:'invalid-request'}:await operations.readArtifact({sha256:decodeURIComponent(artifact[1])});
      if(result.status==='ready'){res.writeHead(200,{'Content-Type':result.artifact.mime,'Content-Length':result.artifact.bytes,'Cache-Control':'public, max-age=31536000, immutable','ETag':`"${result.artifact.sha256}"`,'X-Content-Type-Options':'nosniff'});res.end(result.content);return;}
    }else {json(res,404,{status:'refused',code:'unsupported-operation'});return;}
  }catch{result={status:'refused',code:'invalid-request'};}
  json(res,domainStatus(result),result,result.status==='preparing'?{'Retry-After':String(result.retryAfterSeconds)}:{});
}
