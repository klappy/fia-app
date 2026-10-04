import {json} from './http.mjs';
export const VERSION='2025-06-18';
const schema=properties=>({type:'object',properties,required:Object.keys(properties).filter(k=>k!=='revision'),additionalProperties:false});
const tools=[
 {name:'read_pack',description:'Read a pinned package outcome; no preparation or paid work.',inputSchema:schema({packId:{type:'string'},revision:{type:'string'}}),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:'read_artifact',description:'Read exact immutable JSON bytes as UTF-8 content by SHA-256.',inputSchema:schema({sha256:{type:'string'}}),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}}
];
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export async function serveMcp(req,res,operations) {
  const error=(status,id,code,message)=>json(res,status,{jsonrpc:'2.0',id:id??null,error:{code,message}});
  if(req.method!=='POST'){json(res,405,{status:'refused',code:'unsupported-operation'},{Allow:'POST'});return;}
  if(!(String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase()==='application/json')){error(415,null,-32600,'JSON content type required');return;}
  const accept=String(req.headers.accept||'');if(!accept.includes('application/json')||!accept.includes('text/event-stream')){error(406,null,-32600,'Accept JSON and event-stream');return;}
  const chunks=[];let byteCount=0;
  try {for await(const chunk of req){byteCount+=chunk.length;if(byteCount>16384){error(413,null,-32600,'Request too large');return;}chunks.push(chunk);}}catch{return;}
  let rpc;try {const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));rpc=JSON.parse(raw);}catch{error(400,null,-32700,'Parse error');return;}
  if(!object(rpc)||rpc.jsonrpc!=='2.0'||typeof rpc.method!=='string'||('id'in rpc&&!(typeof rpc.id==='string'||(typeof rpc.id==='number'&&Number.isSafeInteger(rpc.id))))){error(400,null,-32600,'Invalid request');return;}
  const params=rpc.params??{};
  if(!object(params)){error(400,rpc.id,-32602,'Invalid params');return;}
  const reply=result=>json(res,200,{jsonrpc:'2.0',id:rpc.id,result});
  if(rpc.method==='initialize'){
    if(!('id'in rpc)||params.protocolVersion!==VERSION||!object(params.capabilities)||!object(params.clientInfo)||typeof params.clientInfo.name!=='string'||typeof params.clientInfo.version!=='string'){error(400,rpc.id,-32602,'Unsupported version or invalid initialization');return;}
    reply({protocolVersion:VERSION,capabilities:{tools:{listChanged:false}},serverInfo:{name:'fia-local-text-serving',version:'0.1.0'}});return;
  }
  if(req.headers['mcp-protocol-version']!==VERSION){error(400,rpc.id,-32600,'MCP-Protocol-Version must be 2025-06-18');return;}
  if(!('id'in rpc)){
    if(rpc.method==='notifications/initialized'){res.writeHead(202);res.end();return;}
    error(400,null,-32600,'Unsupported notification');return;
  }
  if(rpc.method==='ping'){reply({});return;}
  if(rpc.method==='tools/list'){reply({tools});return;}
  if(rpc.method!=='tools/call'){error(404,rpc.id,-32601,'Method not found');return;}
  let result;
  if(params.name==='read_pack')result=await operations.readPack(params.arguments);
  else if(params.name==='read_artifact')result=await operations.readArtifact(params.arguments);
  else result={status:'refused',code:'unsupported-operation'};
  reply({content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:result.status==='refused'});
}
