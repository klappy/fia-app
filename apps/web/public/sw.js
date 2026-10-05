/* Build-scoped shell; content is activated only after every selected file verifies. */
const VERSION='__BUILD_ID__';
const isBuild=!VERSION.startsWith('__');
const META='fia-v3-download-metadata@1', SHELL=`fia-v3-shell-${VERSION}`, PREFIX='fia-v3-pack-';
const jobs=new Map(),playbackJobs=new Map(),canceledPlayback=new Set();
const legacy='fia-mark-authentic';
const packKey=(id,key)=>id===legacy?key:`pack:${id}:${key}`;
const validPack=id=>id===legacy||/^(eng|spa)\.MRK-\d+(?:-\d+)+$/.test(id);
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
async function read(key){return (await (await caches.open(META)).match('/'+key))?.json()||null;}
async function write(key,value){await (await caches.open(META)).put('/'+key,json(value));}
function validate(manifest){
 if(manifest?.schema!==1||!validPack(manifest.packId)||!/^\w[\w-]*$/.test(manifest.revision)||!Array.isArray(manifest.files)||!manifest.files.length)throw new Error('This download manifest is not supported.');
 const paths=new Set();
 for(const f of manifest.files){if(!/^\/(?!\/|.*(?:\.\.|[?#]))/.test(f.path)||paths.has(f.path)||!['core','audio','video','image'].includes(f.group)||!Number.isSafeInteger(f.bytes)||f.bytes<0||!/^[a-f0-9]{64}$/.test(f.sha256))throw new Error('Invalid download file.');if(f.deliveryURL){const u=new URL(f.deliveryURL);if(u.origin!=='https://transcode.klappy.dev'||!/^\/(audio|image|video)\//.test(u.pathname)||!['audio','image','video'].includes(f.group)||!f.mime||!/^[a-f0-9]{64}$/.test(f.sourceSha256)||f.deliveryRevision!==manifest.deliveryRevision)throw Error('Invalid delivery descriptor.');}if(f.deliveryURL&&f.group==='video'){validateVideoSize(f);if(!/^[a-f0-9]{64}$/.test(f.logicalSourceSha256)||!Number.isSafeInteger(f.logicalSourceBytes)||f.logicalSourceBytes<=0||!Number.isSafeInteger(f.sourceBytes)||f.sourceBytes<=0||f.mime!=='video/mp4')throw Error('Invalid video source binding.');}paths.add(f.path);}
 return manifest;
}
const selectedFiles=(manifest,selection)=>manifest.files.filter(f=>f.group==='core'||selection==='all'||selection==='audio'&&f.group==='audio');
async function latest(packId=legacy){
 const response=await fetch(packId===legacy?'/offline-manifest.json':`/offline/${packId}.json`,{cache:'no-store'});
 if(!response.ok)throw new Error('Could not check the latest download. Connect and try again.');
 const manifest=validate(await response.json());if(manifest.packId!==packId)throw new Error('The download belongs to a different passage.');return manifest;
}
async function verified(response,file){
 if(!response?.ok)return false;
 const bytes=await response.arrayBuffer();
 if(bytes.byteLength!==file.bytes)return false;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 return hash===file.sha256;
}
async function complete(record){
 if(!record)return false;
 const cache=await caches.open(record.cache);
 for(const file of record.files){const response=await cache.match(file.path);if(!await verified(response,file))return false;}
 return true;
}
async function status(packId=legacy){
 if(!isBuild)return {available:false,saved:false,reason:'Downloads work on the published Site. This local development preview does not store offline content.'};
 const active=await read(packKey(packId,'active')),pending=await read(packKey(packId,'pending'));
 let manifest,error='';try{manifest=await latest(packId);}catch(e){error=e.message;manifest=active?.manifest||pending?.manifest;}
 const saved=await complete(active);
 return {available:true,saved,active:active?{...active,valid:saved}:null,pending:pending?{...pending,running:jobs.has(packId)}:null,manifest,error,updateAvailable:!!(active&&manifest&&active.revision!==manifest.revision),choices:manifest?['core',...(manifest.files.some(f=>f.group==='audio')?['audio']:[]),...(manifest.files.some(f=>f.group==='video'||f.group==='image')?['all']:[])].map(id=>({id,bytes:selectedFiles(manifest,id).reduce((n,f)=>n+f.bytes,0)})):[]};
}
self.addEventListener('install',event=>{if(isBuild)event.waitUntil(caches.open(SHELL).then(c=>c.addAll(['/','/index.html','/manifest.webmanifest'])).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
async function cachedResponse(request,clientId){
 const url=new URL(request.url);let active=clientId&&await read('client-'+clientId)||await read('active');
 const target=/^\/content\/packs\/([^/]+)\//.exec(url.pathname)?.[1];
 if(target&&validPack(target)&&active?.packId!==target)active=await read(packKey(target,'active'));
 if(url.pathname==='/content/registry.json'){try{const live=await fetch(request);if(live.ok)return live;}catch{} }
 const cached=active?.cache&&await (await caches.open(active.cache)).match(url.pathname);
 if(cached){
  const range=request.headers.get('range');
  if(range){
   const bytes=await cached.arrayBuffer(),total=bytes.byteLength;
   const match=/^bytes=(\d*)-(\d*)$/.exec(range);
   if(!match||!match[1]&&!match[2])return new Response(null,{status:416,headers:{'Content-Range':`bytes */${total}`}});
   const start=match[1]?Number(match[1]):Math.max(0,total-Number(match[2]));
   const end=match[1]&&match[2]?Math.min(Number(match[2]),total-1):total-1;
   if(start>=total||start>end)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${total}`}});
   return new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Type':cached.headers.get('Content-Type')||'application/octet-stream','Content-Range':`bytes ${start}-${end}/${total}`,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'}});
  }
  return cached;
 }
 // Unselected media may be streamed only if it still matches this installed revision.
 const file=active?.manifest?.files.find(f=>f.path===url.pathname);
 if(file&&file.group!=='core')return new Response('Download this resource before playback.',{status:409});
 if(file){const response=await fetch(file.path,{cache:'no-store'});if(!await verified(response.clone(),file))return new Response('This media has changed. Update the download to play it.',{status:409});return response;}
 if(/\.(mp3|m4a|wav|ogg|mp4|webm|jpe?g|png|webp)$/i.test(url.pathname)&&!url.pathname.startsWith('/assets/fia-'))return new Response('Download this resource before playback.',{status:409});
 return fetch(request);
}
self.addEventListener('fetch',event=>{
 if(!isBuild||event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 const path=new URL(event.request.url).pathname;
 const inFamily=root=>path===root||path.startsWith(root+'/');
 // Online destinations retain their own responses/errors, never an installed app shell.
 if(path==='/version.json'||path==='/build-status.html'||inFamily('/build-status')){event.respondWith(fetch(event.request,{cache:'no-store'}));return;}
 if(['/v1','/mcp','/docs','/content/source'].some(inFamily)){event.respondWith(fetch(event.request));return;}
 if(event.request.mode==='navigate')event.respondWith((async()=>{
  const preferred=await read('selected');const active=preferred&&await read(packKey(preferred.packId,'active'))||await read('active');
  const cached=active&&await(await caches.open(active.cache)).match('/index.html');
  if(cached){if(event.resultingClientId)await write('client-'+event.resultingClientId,active);return cached;}
  return fetch(event.request).catch(async()=>await(await caches.open(SHELL)).match('/index.html')||Response.error());
 })());
 else event.respondWith(cachedResponse(event.request,event.clientId));
});
async function start(selection,port,packId=legacy){
 if(!isBuild)throw new Error('Downloads work on the published Site.');
 if(!['core','audio','all'].includes(selection))throw new Error('Choose a download option.');
 if(jobs.has(packId))throw new Error('A download is already running for this passage.');
 const controller=new AbortController();jobs.set(packId,controller);
 let pending;
 try{
  let manifest;
  try{manifest=await latest(packId);}catch(error){const previous=await read(packKey(packId,'pending'));if(!previous)throw error;manifest=validate(previous.manifest);}
  const files=selectedFiles(manifest,selection),cacheName=`${PREFIX}${packId===legacy?'':packId+'-'}${manifest.revision}-${selection}`;
  const active=await read(packKey(packId,'active'));
  // A repair stages separately from the last working copy, even at the same revision.
  const cacheId=active?.cache===cacheName?cacheName+'-repair':cacheName;
  const cache=await caches.open(cacheId);
  pending={packId,cache:cacheId,revision:manifest.revision,selection,manifest,files,bytes:files.reduce((n,f)=>n+f.bytes,0),received:0,count:0,status:'downloading'};
  await write(packKey(packId,'pending'),pending);
  const report=()=>port?.postMessage({progress:{received:pending.received,bytes:pending.bytes,count:pending.count,total:files.length}});
  for(const file of files){
   if(controller.signal.aborted)throw new Error('Download paused. Verified files are kept for Resume.');
   let response=await cache.match(file.path);
   if(!await verified(response?.clone(),file)){
    const timeout=setTimeout(()=>controller.abort(),30000);
    try{response=await fetch(file.deliveryURL||file.path,{cache:'no-store',signal:controller.signal});if(file.deliveryURL){const bytes=await readVerifiedMedia(response,file,{signal:controller.signal});response=new Response(bytes,{headers:{'Content-Type':file.mime}});}else if(!await verified(response.clone(),file))throw new Error('A file could not be verified. Retry to keep the files already downloaded.');
     const headers=new Headers(response.headers);headers.set('Content-Length',String(file.bytes));await cache.put(file.path,new Response(await response.arrayBuffer(),{headers}));
    }finally{clearTimeout(timeout);}
   }
   pending.received+=file.bytes;pending.count++;await write(packKey(packId,'pending'),pending);report();
  }
  if(controller.signal.aborted)throw new Error('Download paused. Verified files are kept for Resume.');
  if(!await complete(pending))throw new Error('Storage changed before verification finished. Retry the download.');
  // Single metadata write is the commit point. An interrupted update keeps active intact.
  await write(packKey(packId,'active'),pending);await(await caches.open(META)).delete('/'+packKey(packId,'pending'));
  // Keep the prior revision for already-open clients. Removal clears every revision.
  // Do not switch an open page's media beneath its loaded text and alignment.
  return {saved:true,selection};
 }catch(error){
  if(pending){pending.status='interrupted';pending.error=error.name==='QuotaExceededError'?'Your device does not have enough storage. Free space or choose a smaller download.':controller.signal.aborted?'Download paused. Verified files are kept for Resume.':error.message;await write(packKey(packId,'pending'),pending);throw new Error(pending.error);}
  throw error;
 }finally{jobs.delete(packId);}
}
self.addEventListener('message',event=>{
 const port=event.ports?.[0],type=event.data?.type,packId=event.data?.packId||legacy;
 event.waitUntil((async()=>{
  try{
   if(!validPack(packId))throw new Error('Invalid passage identity.');
   let result={};
   if(type==='MEDIA_CANCEL'){const key=(event.source?.id||'')+':'+event.data.requestId;canceledPlayback.add(key);if(canceledPlayback.size>256)canceledPlayback.delete(canceledPlayback.values().next().value);playbackJobs.get(key)?.abort();result={canceled:true};
   }else if(type==='MEDIA_STATUS'||type==='MEDIA_PLAY'){
    const active=await read(packKey(packId,'active'));let manifest;try{manifest=await latest(packId);}catch{manifest=active?.manifest;}
    if(!manifest||manifest.presentationRevision!==event.data.revision)throw Error('The media revision is unavailable.');
    if(type==='MEDIA_STATUS')result={deliveryRevision:manifest.deliveryRevision||null,files:manifest.files.filter(f=>f.deliveryURL)};
    else{
     const file=manifest.files.find(f=>f.path===event.data.path&&f.deliveryURL);
     if(!file||manifest.deliveryRevision!==event.data.deliveryRevision)throw Error('This resource is not prepared for online playback.');
     const key=(event.source?.id||'')+':'+event.data.requestId;if(canceledPlayback.delete(key))throw Error('Playback canceled.');if(!event.data.requestId||playbackJobs.has(key))throw Error('Invalid playback request.');
     validateVideoSize(file);const controller=new AbortController();playbackJobs.set(key,controller);
     try{let response=active?.cache&&await(await caches.open(active.cache)).match(file.path),bytes=null;
      if(response){try{bytes=await readVerifiedMedia(response,file,{signal:controller.signal});}catch(error){if(controller.signal.aborted)throw error;}}
      if(!bytes){response=await fetch(file.deliveryURL,{cache:'no-store',signal:controller.signal});bytes=await readVerifiedMedia(response,file,{signal:controller.signal});}
      if(controller.signal.aborted)throw Error('Playback canceled.');result={bytes:bytes.buffer,mime:file.mime,timing:file.timing};
     }finally{playbackJobs.delete(key);canceledPlayback.delete(key);}
    }
   }else if(type==='PACK_SELECT'){
    const active=await read(packKey(packId,'active'));
    const matches=active&&active.manifest?.presentationRevision===event.data.revision;
    if(event.source?.id)await write('client-'+event.source.id,matches?active:{packId,revision:event.data.revision});
    await write('selected',{packId});result={selected:true};
   }else if(type==='DOWNLOAD_STATUS'||type==='CACHE_STATUS')result=await status(packId);
   else if(type==='DOWNLOAD_START'){const active=await read(packKey(packId,'active'));if(active&&event.source?.id&&!await read('client-'+event.source.id))await write('client-'+event.source.id,active);result=await start(event.data.selection,port,packId);}
   else if(type==='DOWNLOAD_PAUSE'){jobs.get(packId)?.abort();result={paused:true};}
   else if(type==='DOWNLOAD_REMOVE'){
    if(jobs.has(packId))throw new Error('Pause the download before removing it.');
    const keys=await caches.keys(),prefix=packId===legacy?PREFIX:`${PREFIX}${packId}-`;
    const meta=await caches.open(META);
    const active=await read(packKey(packId,'active')),pending=await read(packKey(packId,'pending'));
    const owned=new Set([active?.cache,pending?.cache]);
    await Promise.all(keys.filter(k=>packId===legacy?owned.has(k)||new RegExp('^'+PREFIX+'[a-zA-Z0-9]+-(core|audio|all)(-repair)?$').test(k):k.startsWith(prefix)).map(k=>caches.delete(k)));
    await meta.delete('/'+packKey(packId,'active'));await meta.delete('/'+packKey(packId,'pending'));result={saved:false};
   }else return;
   port?.postMessage({ok:true,...result},result.bytes instanceof ArrayBuffer?[result.bytes]:[]);
  }catch(error){port?.postMessage({ok:false,error:error.message});}
 })());
});
