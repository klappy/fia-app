const ORIGIN='https://transcode.klappy.dev';
const SHA=/^[a-f0-9]{64}$/;
const quality={small:'low',medium:'medium',large:'high'};
const videoSize={small:'xsmall',medium:'medium',large:'xlarge'};
const mimeFor={opus:['audio/ogg','audio/opus'],webp:['image/webp'],avif:['image/avif'],jpeg:['image/jpeg'],mp4:['video/mp4']};
function parse(file){
 const url=new URL(file.deliveryURL);
 if(url.origin!==ORIGIN||url.username||url.password||url.hash)throw Error('Unapproved proxy URL.');
 const match=/^\/(audio|image|video)\/([^/]+)\/(https:\/\/.+)$/.exec(url.pathname+url.search);
 if(!match||file.group!==match[1])throw Error('Invalid source-bound proxy route.');
 const source=new URL(match[3]);if(source.username||source.password||source.hash)throw Error('Invalid source URL.');
 if(match[2].split(',').some(s=>!/^\w+=[\w-]+$/.test(s)))throw Error('Invalid proxy options.');
 const options=Object.fromEntries(match[2].split(',').map(s=>s.split('=')));
 if(Object.keys(options).length!==match[2].split(',').length||Object.keys(options).some(k=>!['preset','q','f','size'].includes(k)))throw Error('Invalid proxy options.');
 const kind=match[1],format=options.f;
 if(!['low','medium','high'].includes(options.q)||kind==='audio'&&(options.preset!=='voice'||format!=='opus'||options.size)||kind==='image'&&(!['webp','avif','jpeg'].includes(format)||options.preset||options.size)||kind==='video'&&(options.preset!=='fia'||format!=='mp4'||options.q!=='medium'||options.size&&!['xsmall','small','medium','large','xlarge'].includes(options.size)))throw Error('Unsupported proxy profile.');
 if(!SHA.test(file.sourceSha256)||!Number.isSafeInteger(file.sourceBytes)||file.sourceBytes<=0||!/^\/(?!\/)/.test(file.path))throw Error('Missing source identity.');
 return {kind,format,sourceUrl:match[3]};
}
export function createProxyRequest(file,size){
 if(!quality[size])throw Error('Unknown requested size.');
 const {kind,format,sourceUrl}=parse(file),profile=kind==='video'?videoSize[size]:quality[size];
 const options=kind==='image'?`q=${profile},f=${format}`:kind==='audio'?`preset=voice,q=${profile},f=${format}`:`preset=fia,q=medium,f=mp4,size=${profile}`;
 const proxyUrl=`${ORIGIN}/${kind}/${options}/${sourceUrl}`;
 const declared=[file,...Object.values(file.variants||{})].find(v=>v.deliveryURL===proxyUrl&&v.sourceSha256===file.sourceSha256&&v.sourceBytes===file.sourceBytes&&SHA.test(v.sha256)&&Number.isSafeInteger(v.bytes)&&v.bytes>0);
 const mime=declared?.mime||file.mime;if(!mimeFor[format].includes(mime))throw Error('Unsupported declared MIME.');
 return {schema:1,path:file.path,kind,size,profile,format,mime,source:{url:sourceUrl,sha256:file.sourceSha256,bytes:file.sourceBytes},proxyUrl,expected:declared?{sha256:declared.sha256,bytes:declared.bytes}:null,timingStatus:kind==='audio'?'pending-qualification':'not-applicable'};
}
export async function fetchProxyRequest(request,{fetchImpl=globalThis.fetch,signal,maxBytes=16*1024*1024,timeoutMs=300000}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<=0||maxBytes>60*1024*1024||!Number.isSafeInteger(timeoutMs)||timeoutMs<=0||timeoutMs>300000)throw Error('Invalid request bounds.');
 // Reconstruct the request to reject altered URL/source/profile descriptors at the boundary.
 const check=createProxyRequest({path:request.path,group:request.kind,deliveryURL:request.proxyUrl,sourceSha256:request.source.sha256,sourceBytes:request.source.bytes,mime:request.mime},request.size);
 if(check.proxyUrl!==request.proxyUrl||check.profile!==request.profile||check.source.url!==request.source.url||check.format!==request.format)throw Error('Request identity changed.');
 if(request.expected&&(!SHA.test(request.expected.sha256)||!Number.isSafeInteger(request.expected.bytes)||request.expected.bytes<=0||request.expected.bytes>maxBytes))throw Error('Invalid expected output.');
 const controller=new AbortController();let reader,response;const abort=()=>controller.abort(signal?.reason||Error('Request canceled.'));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 let rejectAbort;const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(controller.signal.reason||Error('Request canceled.'));controller.signal.addEventListener('abort',rejectAbort,{once:true});if(controller.signal.aborted)rejectAbort();});
 const timer=setTimeout(()=>controller.abort(Error('Proxy request timed out.')),timeoutMs);
 const bounded=p=>Promise.race([p,aborted]);
 try{
  const pending=Promise.resolve().then(()=>{if(controller.signal.aborted)throw controller.signal.reason;return fetchImpl(request.proxyUrl,{cache:'no-store',redirect:'error',signal:controller.signal});});
  pending.then(r=>{if(controller.signal.aborted)r.body?.cancel().catch(()=>{});},()=>{});
  response=await bounded(pending);if(response.status!==200||response.type==='opaque'||response.redirected||response.url&&response.url!==request.proxyUrl)throw Error('Proxy response unavailable.');
  const mime=(response.headers.get('Content-Type')||'').split(';')[0].trim();if(mime!==request.mime)throw Error('Proxy MIME mismatch.');
  const length=response.headers.get('Content-Length');const declared=length===null?null:Number(length);if(declared!==null&&(!/^\d+$/.test(length)||!Number.isSafeInteger(declared)||declared<=0||declared>maxBytes))throw Error('Proxy size exceeds bound.');
  reader=response.body?.getReader();if(!reader)throw Error('Proxy body missing.');let count=0;const chunks=[];
  while(true){const {done,value}=await bounded(reader.read());if(done)break;count+=value.byteLength;if(count>maxBytes)throw Error('Proxy size exceeds bound.');chunks.push(value);}
  if(!count||declared!==null&&declared!==count||request.expected&&request.expected.bytes!==count)throw Error('Proxy size mismatch.');
  const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}chunks.length=0;
  const digest=await bounded(crypto.subtle.digest('SHA-256',bytes));const sha256=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');if(request.expected&&request.expected.sha256!==sha256)throw Error('Proxy hash mismatch.');
  return {bytes,receipt:{schema:1,status:'received-and-hashed',path:request.path,kind:request.kind,size:request.size,profile:request.profile,source:{...request.source},proxyUrl:request.proxyUrl,output:{sha256,bytes:count,mime},matchedDeclaredOutput:!!request.expected,timingStatus:request.kind==='audio'?'pending-qualification':'not-applicable'}};
 }catch(error){controller.abort(error);if(reader)reader.cancel().catch(()=>{});else response?.body?.cancel().catch(()=>{});throw error;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',rejectAbort);}
}

/** Request planning has unknown totals until missing outputs have been received. */
export function planProxyDownload(manifest,selection,sizes={}){
 if(!['core','audio','all'].includes(selection)||Object.keys(sizes).some(k=>!['audio','image','video'].includes(k))||Object.values(sizes).some(s=>!quality[s]))throw Error('Invalid download selection.');
 const selectedSizes={};const files=manifest.files.map(file=>{
  if(file.group==='core'||selection==='core'||selection==='audio'&&file.group!=='audio')return file;
  const size=sizes[file.group]||file.defaultSize;if(!file.deliveryURL||!size)return file;
  if(!file.sourceBytes){const declared=file.variants?.[size]||(!file.variants?file:null);if(declared?.deliveryURL&&file.group!=='video'&&declared.deliveryURL.includes(`q=${quality[size]},`)){selectedSizes[file.group]=size;return {...declared,selectedSize:size};}throw Error('Source metadata is required for this request.');}
  const request=createProxyRequest(file,size);selectedSizes[file.group]=size;
  const declared=[file,...Object.values(file.variants||{})].find(v=>v.deliveryURL===request.proxyUrl&&v.sha256===request.expected?.sha256);
  if(declared)return {...declared,selectedSize:size};
  return {path:file.path,group:file.group,...(file.logicalSourceSha256?{logicalSourceSha256:file.logicalSourceSha256,logicalSourceBytes:file.logicalSourceBytes}:{}),selectedSize:size,sourceSha256:file.sourceSha256,sourceBytes:file.sourceBytes,deliveryRevision:file.deliveryRevision,deliveryURL:request.proxyUrl,mime:request.mime,bytes:null,sha256:null,proxyRequest:request,timingDependent:file.group==='audio'&&!!(file.playbackRange||file.scriptureAlignment||file.timing?.alignmentSha256||file.timing?.mapping)};
 });
 const tuple=['audio','image','video'].map(g=>selectedSizes[g]||'none').join('-');return {...manifest,catalogRevision:manifest.catalogRevision||manifest.revision,revision:Object.keys(selectedSizes).length?`${manifest.catalogRevision||manifest.revision}-${selection}-${tuple}`:manifest.revision,mediaSizes:selectedSizes,files};
}

export function matchesObservedProxy(file,saved){
 try{const receipt=saved.proxyReceipt,request=createProxyRequest(file,saved.selectedSize);return !!receipt&&receipt.status==='received-and-hashed'&&saved.timing?.status!=='pending-qualification'&&receipt.path===file.path&&receipt.proxyUrl===request.proxyUrl&&receipt.source.sha256===request.source.sha256&&receipt.source.bytes===request.source.bytes&&receipt.source.url===request.source.url&&receipt.output.sha256===saved.sha256&&receipt.output.bytes===saved.bytes&&receipt.output.mime===saved.mime&&saved.deliveryURL===request.proxyUrl&&!saved.playbackRange&&!saved.scriptureAlignment;}catch{return false;}
}
