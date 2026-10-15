import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {z} from 'zod';
import {json} from './http.mjs';
export const VERSION='2025-06-18';
const readOnly={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
const definitions=[
 ['read_pack','readPack','Read a pinned package outcome; no preparation or paid work.',z.strictObject({packId:z.string(),revision:z.string().optional()}),readOnly],
 ['read_artifact','readArtifact','Read exact immutable JSON bytes as UTF-8 content by SHA-256.',z.strictObject({sha256:z.string()}),readOnly],
 ['prepare_presentation','preparePresentation','Explicitly prepare one source-bound executable presentation. Starts or joins durable work.',z.strictObject({packId:z.string(),baseRevision:z.string(),sourceRevision:z.string(),capability:z.literal('executable-presentation')}),{...readOnly,readOnlyHint:false}],
 ['read_presentation_preparation','readPresentationPreparation','Read a previously requested presentation job; never starts interpretation or publication.',z.strictObject({jobId:z.string()}),readOnly]
];
// Node tests and local faces use the same official SDK transport underlying Agents.
async function sdkHandler(server,request){
 const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
 await server.connect(transport);
 request.signal.addEventListener('abort',()=>{void server.close();},{once:true});
 try{return await transport.handleRequest(request);}finally{if(request.method!=='GET')await server.close();}
}
export async function serveMcp(req,res,operations,{handle=sdkHandler}={}) {
 const chunks=[];let byteCount=0;
 for await(const chunk of req){byteCount+=chunk.length;if(byteCount>16384){json(res,413,{status:'refused',code:'request-too-large'});return;}chunks.push(chunk);}
 const body=Buffer.concat(chunks);
 try{new TextDecoder('utf-8',{fatal:true}).decode(body);}catch{json(res,400,{status:'refused',code:'invalid-request'});return;}
 const request=new Request(req.url||'https://localhost/mcp',{method:req.method,headers:req.headers,signal:req.signal,...(req.method==='GET'||req.method==='HEAD'?{}:{body})});
 const server=new McpServer({name:'fia-local-text-serving',version:'0.1.0'},{capabilities:{tools:{listChanged:false}}});
 for(const [name,operation,description,inputSchema,annotations] of definitions){
  if(name.includes('presentation')&&typeof operations[operation]!=='function')continue;
  server.registerTool(name,{description,inputSchema,annotations},async args=>{
   let result;
   try{result=await operations[operation](args);}catch{result={status:'refused',code:'internal-error'};}
   return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:result.status==='refused'};
  });
 }
 return handle(server,request);
}
