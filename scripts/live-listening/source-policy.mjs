// QA-only, opt-in real-source policy for the packaged Worker preview (U008 first proof). Without it the
// controlled authority forbids every outbound request. With it, exactly the two publisher originals named by
// VISUAL_FIRST_PROOF may be read: a literal GET of the exact URL, never a host, prefix, query or redirect.
// Each attempt is recorded with its actual status, type, length and sha256 beside the expected source pin.
// Nothing is substituted: an allowed answer passes through byte for byte, a refused one fails the Worker's
// fetch, and a non-200 answer reaches the Worker unchanged.
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
export const U008_SOURCE_POLICY='u008-first-proof';
const CREDENTIALS=['authorization','cookie','proxy-authorization'];
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
// The exact allowed tuple, read from the server's own first-proof descriptors.
export async function u008Sources(repo){
 const {VISUAL_FIRST_PROOF}=await import(pathToFileURL(join(repo,'server/fia/preparation/visual-publication.mjs')).href);
 return Object.freeze(VISUAL_FIRST_PROOF.map(e=>Object.freeze({url:e.source.url,packId:e.packId,assetId:e.assetId,kind:e.kind,sourceVersion:e.source.sourceVersion})));
}
export function createSourcePolicyOutbound(sources,{fetch=globalThis.fetch,observe=()=>{}}={}){
 const allowed=new Map(sources.map(s=>[s.url,s]));
 const refuse=(record,reason)=>{observe({...record,outcome:'refused',reason});throw Error(`U008 source policy refuses ${record.method} ${record.url}: ${reason}`);};
 return async request=>{
  const record={at:new Date().toISOString(),method:request.method,url:request.url};
  const source=allowed.get(request.url);
  if(!source)return refuse(record,'url-not-listed');
  if(request.method!=='GET')return refuse(record,'method-not-get');
  if(new URL(request.url).search)return refuse(record,'query-not-allowed');
  if(CREDENTIALS.some(h=>request.headers.has(h)))return refuse(record,'credential-header');
  Object.assign(record,{assetId:source.assetId,expectedSourceVersion:source.sourceVersion});
  const response=await fetch(source.url,{method:'GET',redirect:'manual'});
  if((response.status>=300&&response.status<400)||response.headers.has('location'))return refuse({...record,status:response.status},'redirect-not-followed');
  const bytes=new Uint8Array(await response.arrayBuffer()),headers=new Headers();
  for(const key of ['content-type','etag','last-modified'])if(response.headers.has(key))headers.set(key,response.headers.get(key));
  headers.set('content-length',String(bytes.length));
  observe({...record,outcome:'fetched',status:response.status,mime:response.headers.get('content-type'),bytes:bytes.length,sha256:sha256(bytes)});
  return new Response(bytes,{status:response.status,headers});
 };
}
