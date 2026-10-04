/** Fetch transport bridge: protocol/domain behavior stays in the shared faces. */
export function createWorker({origin,operations,serveRead,serveMcp}) {
 const allowed=new URL(origin);
 if(allowed.protocol!=='https:'||allowed.port||allowed.origin!==origin)throw Error('invalid-worker-origin');
 return {async fetch(request,env){
  const url=new URL(request.url);
  const reserved=url.pathname==='/v1'||url.pathname.startsWith('/v1/')||url.pathname==='/mcp'||url.pathname.startsWith('/mcp/');
  if(!reserved)return env.ASSETS.fetch(request);
  const json=(status,body,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
  const receivedOrigin=request.headers.get('Origin');
  if(url.origin!==origin||receivedOrigin!==null&&receivedOrigin!==origin)return json(403,{status:'refused',code:'untrusted-origin'});
  if(url.pathname.startsWith('/mcp/'))return json(404,{status:'refused',code:'unsupported-operation'});
  let status=200,headers={},body=null,ended=false;
  const response={get headersSent(){return ended;},writeHead(code,values={}){status=code;headers=values;return this;},end(value){body=value??null;ended=true;}};
  const req={method:request.method,headers:Object.fromEntries(request.headers),async *[Symbol.asyncIterator](){
   if(!request.body)return;
   const reader=request.body.getReader();
   try{while(true){const {done,value}=await reader.read();if(done)break;yield value;}}
   finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  }};
  try{
   if(url.pathname==='/mcp')await serveMcp(req,response,operations);
   else await serveRead(req,response,url,operations);
   if(!ended)return json(400,{status:'refused',code:'invalid-request'});
   return new Response(body,{status,headers});
  }catch{return json(500,{status:'refused',code:'internal-error'});}
 }};
}
