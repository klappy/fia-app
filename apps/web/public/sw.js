/* Build-scoped shell; content is activated only after every selected file verifies. */
const VERSION='__BUILD_ID__';
const isBuild=!VERSION.startsWith('__');
const META='fia-v3-download-metadata@1', SHELL=`fia-v3-shell-${VERSION}`, PREFIX='fia-v3-pack-';
const jobs=new Map(),playbackJobs=new Map(),canceledPlayback=new Set();
const legacy='fia-mark-authentic';
const packKey=(id,key)=>id===legacy?key:`pack:${id}:${key}`;
const validPack=id=>id===legacy||/^(eng|spa)\.(?:MRK|LUK)-\d+(?:-\d+)+$/.test(id);
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
async function read(key){return (await (await caches.open(META)).match('/'+key))?.json()||null;}
async function write(key,value){await (await caches.open(META)).put('/'+key,json(value));}
const isPassageHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const scripturePassagePins=['scriptureLedgerEntryId','scriptureLedgerSha256','scriptureAssetId','scripturePlaybackMode','scriptureHighlighting','scriptureRangeReviewSha256','scriptureCanonicalTextSha256','scriptureSourceEvidenceSha256','scriptureSourceRangeReviewSha256'];
function validateScripturePassageFile(file,packId){
 if(file.scripturePlaybackMode!=='passage-only'||file.scriptureHighlighting!=='disabled'||file.scriptureAlignment!==null||file.scriptureAlignmentSha256!==undefined||file.logicalSourceSha256!==undefined||file.logicalSourceBytes!==undefined||file.recordingLedgerEntryId!==undefined||file.recordingLedgerSha256!==undefined||typeof file.scriptureLedgerEntryId!=='string'||!file.scriptureLedgerEntryId||typeof file.scriptureAssetId!=='string'||!/^[-\w]+$/.test(file.scriptureAssetId)||file.path!==`/audio/scripture/${packId}/${file.scriptureAssetId}.opus`||file.group!=='audio'||file.mime!=='audio/ogg')throw Error('Invalid passage-only Scripture descriptor.');
 for(const key of ['sha256','sourceSha256','deliveryRevision',...scripturePassagePins.filter(k=>k.endsWith('Sha256'))])if(!isPassageHash(file[key]))throw Error('Missing Scripture identity pin.');
 for(const key of ['bytes','sourceBytes'])if(!Number.isSafeInteger(file[key])||file[key]<=0)throw Error('Invalid Scripture byte identity.');
 const url=new URL(file.deliveryURL);if(url.origin!=='https://transcode.klappy.dev'||!url.pathname.startsWith('/audio/')||url.username||url.password||url.hash)throw Error('Invalid Scripture delivery origin.');
 validatePlaybackRange(file.playbackRange,file.duration);const t=file.timing;
 if(t?.status!=='verified'||t.sourceAudioSha256!==file.sourceSha256||t.deliveryAudioSha256!==file.sha256||!isPassageHash(t.mappingEvidenceSha256)||!Number.isFinite(t.mapping?.scale)||t.mapping.scale<=0||!Number.isFinite(t.mapping?.offsetSeconds)||t.alignment!==undefined||t.alignmentSha256!==undefined)throw Error('Invalid passage-only Scripture clock.');return file;
}
function validate(manifest){
 if(manifest?.schema!==1||!validPack(manifest.packId)||!/^\w[\w-]*$/.test(manifest.revision)||!Array.isArray(manifest.files)||!manifest.files.length)throw new Error('This download manifest is not supported.');
 const paths=new Set();
 for(const f of manifest.files){if(!/^\/(?!\/|.*(?:\.\.|[?#]))/.test(f.path)||paths.has(f.path)||!['core','audio','video','image'].includes(f.group)||!Number.isSafeInteger(f.bytes)||f.bytes<0||!/^[a-f0-9]{64}$/.test(f.sha256))throw new Error('Invalid download file.');if(f.deliveryURL){const u=new URL(f.deliveryURL);if(u.origin!=='https://transcode.klappy.dev'||!/^\/(audio|image|video)\//.test(u.pathname)||!['audio','image','video'].includes(f.group)||!f.mime||!/^[a-f0-9]{64}$/.test(f.sourceSha256)||f.deliveryRevision!==manifest.deliveryRevision)throw Error('Invalid delivery descriptor.');}if(f.deliveryURL&&f.group==='video'){validateVideoSize(f);if(!/^[a-f0-9]{64}$/.test(f.logicalSourceSha256)||!Number.isSafeInteger(f.logicalSourceBytes)||f.logicalSourceBytes<=0||!Number.isSafeInteger(f.sourceBytes)||f.sourceBytes<=0||f.mime!=='video/mp4')throw Error('Invalid video source binding.');}if((f.playbackRange&&!f.scriptureLedgerEntryId)||f.recordingLedgerEntryId||f.recordingLedgerSha256){if(f.group!=='audio'||!f.deliveryURL||!f.recordingLedgerEntryId||!/^[a-f0-9]{64}$/.test(f.recordingLedgerSha256)||!/^[a-f0-9]{64}$/.test(f.logicalSourceSha256)||!Number.isSafeInteger(f.logicalSourceBytes)||f.logicalSourceBytes<=0)throw Error('Invalid recorded guide binding.');validatePlaybackRange(f.playbackRange,f.duration); }if(f.scripturePlaybackMode==='passage-only'){validateScripturePassageFile(f,manifest.packId);}else if(f.scriptureLedgerEntryId||f.scriptureAlignment){if(f.group!=='audio'||!f.deliveryURL||!f.scriptureLedgerEntryId||!f.scriptureAssetId||!/^[a-f0-9]{64}$/.test(f.scriptureLedgerSha256)||!/^[a-f0-9]{64}$/.test(f.scriptureAlignmentSha256)||!/^[a-f0-9]{64}$/.test(f.logicalSourceSha256)||!Number.isSafeInteger(f.logicalSourceBytes)||f.logicalSourceBytes<=0)throw Error('Invalid Scripture binding.');validatePlaybackRange(f.playbackRange,f.duration);validateScriptureAlignment(f.scriptureAlignment,{audioSha256:f.sha256,duration:f.duration,assetId:f.scriptureAssetId});}if(f.variants){
  if(!['small','medium','large'].includes(f.defaultSize)||!f.variants[f.defaultSize]||Object.keys(f.variants).some(k=>!['small','medium','large'].includes(k)))throw Error('Invalid media variants.');
  for(const key of ['sha256','bytes','mime','deliveryURL'])if(f.variants[f.defaultSize][key]!==f[key])throw Error('Default variant changed.');
  for(const v of Object.values(f.variants)){if(v.variants||v.path!==f.path||v.group!==f.group||v.sourceSha256!==f.sourceSha256||v.logicalSourceSha256!==f.logicalSourceSha256)throw Error('Variant source identity changed.');validate({...manifest,files:[v]});}
 }paths.add(f.path);}
 return {...manifest,files:permittedRecordings(manifest.files,generatedRecordingPaths)};
}
const selectedFiles=(manifest,selection)=>manifest.files.filter(f=>downloadSelectionIncludes(selection,f.group));
function matchingSavedFile(file,active,manifest){
 if(active?.manifest?.deliveryRevision!==manifest.deliveryRevision)return null;
 const saved=active.files.find(f=>f.path===file.path&&f.deliveryURL&&recordingAllowed(f,generatedRecordingPaths));if(!saved)return null;
 if(matchesObservedProxy(file,saved))return saved;
 const approved=[file,...Object.values(file.variants||{})];
 return approved.some(f=>['path','sha256','bytes','mime','deliveryURL','sourceSha256','sourceBytes','logicalSourceSha256','logicalSourceBytes'].every(k=>f[k]===saved[k])&&JSON.stringify(f.timing)===JSON.stringify(saved.timing)&&JSON.stringify(f.playbackRange)===JSON.stringify(saved.playbackRange)&&f.recordingLedgerSha256===saved.recordingLedgerSha256&&f.recordingLedgerEntryId===saved.recordingLedgerEntryId&&[...scripturePassagePins,'scriptureAlignmentSha256'].every(k=>f[k]===saved[k])&&JSON.stringify(f.scriptureAlignment)===JSON.stringify(saved.scriptureAlignment)&&f.duration===saved.duration)?saved:null;
}
// Only failures at the fetch boundary are eligible for retaining an old snapshot.
// Parsing, hashes, identity, authorization and unknown exceptions fail closed.
async function fetchLatest(path,options){
 let response;
 try{response=await fetch(path,options);}catch(error){
  if(error?.name==='TypeError'||error?.name==='AbortError')throw Object.assign(Error('Media status is temporarily unavailable.'),{mediaStatusCode:'media-status-transient'});
  throw error;
 }
 if([408,429,500,502,503,504].includes(response.status))throw Object.assign(Error('Media status is temporarily unavailable.'),{mediaStatusCode:'media-status-transient'});
 return response;
}
async function latest(packId=legacy,media=false,onprogress){
 const request=media?fetchLatest:fetch;
 const response=await request(packId===legacy?'/offline-manifest.json':`/offline/${packId}.json`,{cache:'no-store'});
 if(!response.ok)throw new Error('Could not check the latest download. Connect and try again.');
 const manifest=validate(await response.json());if(manifest.packId!==packId)throw new Error('The download belongs to a different passage.');
 onprogress?.({phase:'manifest-verified',verified:0,total:null});
 const delivery=manifest.files.find(f=>f.group==='core'&&f.path===`/content/delivery/${packId}/${manifest.deliveryRevision}.json`);
 if(delivery){const r=await request(delivery.path,{cache:'no-store'});if(!await verified(r.clone(),delivery))throw Error('Delivery source metadata changed.');const sidecar=validateDelivery(await r.json(),{packId,presentationRevision:manifest.presentationRevision});for(const f of manifest.files){const e=sidecar.entries.find(e=>e.path===f.path);if(e){if(e.source.sha256!==f.sourceSha256)throw Error('Source identity changed.');f.sourceBytes=e.source.bytes;for(const v of Object.values(f.variants||{}))v.sourceBytes=e.source.bytes;}}}
 if(delivery)onprogress?.({phase:'delivery-verified',verified:0,total:null});
 return manifest;
}
async function verified(response,file){
 if(!response?.ok)return false;
 const bytes=await response.arrayBuffer();
 if(bytes.byteLength!==file.bytes)return false;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 return hash===file.sha256;
}
// Explicit downloads may retain a coherent server-read snapshot in the existing
// pack cache. It is historical offline evidence, never fresh server authority.
const offlineServerHeader='X-FIA-Offline-Snapshot';
const artifactPath=sha=>`/v1/artifacts/${sha}`;
const stableJSON=v=>JSON.stringify(v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(x=>JSON.parse(stableJSON(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stableJSON(v[k]))])));
async function contentHash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');}
function serverRecord(value,packId){
 if(value?.status!=='ready'||value.packId!==packId||value.identity?.packId!==packId||!isPassageHash(value.revision)||value.artifact?.sha256!==value.revision||!Number.isSafeInteger(value.artifact.bytes)||value.artifact.bytes<1||value.artifact.bytes>1048576||value.artifact.mime!=='application/json')throw Error('Invalid server record.');
 if(Object.hasOwn(value,'execution')){const e=value.execution;if(!e||e.mediaIdentity?.packId!==packId||!isPassageHash(e.mediaIdentity?.revision)||Object.keys(e.mediaIdentity).sort().join(',')!=='packId,revision'||!isPassageHash(e.mediaAssetsSha256)||e.schema!=='fia-executable-catalog@1'||!isPassageHash(e.baseRevision)||typeof e.sourceRevision!=='string'||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(e.sourceRevision)||!Array.isArray(e.artifacts)||e.artifacts.length>1024)throw Error('Invalid executable catalog.');const ids=new Set(),hashes=new Set([value.revision]);for(const d of e.artifacts){if(typeof d.id!=='string'||!d.id||ids.has(d.id)||!isPassageHash(d.sha256)||hashes.has(d.sha256)||!Number.isSafeInteger(d.bytes)||d.bytes<1||d.bytes>1048576||d.mime!=='application/json')throw Error('Invalid executable dependency.');ids.add(d.id);hashes.add(d.sha256);}}
 return value;
}
function serverFiles(record){return [{...record.artifact,path:artifactPath(record.revision),group:'core'},...(record.execution?.artifacts||[]).map(d=>({...d,path:artifactPath(d.sha256),group:'core'}))];}
async function serverJSON(response,file,record){
 if(response.status!==200||response.redirected||!await verified(response.clone(),file))throw Error('Server artifact could not be verified.');const value=await response.clone().json();
 if(file.sha256===record.revision){if(!value||!value.assets||!Array.isArray(value.activities)||!value.activities.length||!Array.isArray(value.sections)||!Array.isArray(value.listContracts)||(value.id!==record.packId&&!(record.packId==='eng.MRK-1-1-13'&&value.id==='fia-mark-authentic@1')))throw Error('Invalid server presentation.');if(record.execution&&(value.execution?.schema!=='fia-executable-presentation@1'||value.execution.sourceRevision!==record.execution.sourceRevision))throw Error('Invalid executable presentation.');if(record.execution&&await contentHash(new TextEncoder().encode(stableJSON(value.assets)))!==record.execution.mediaAssetsSha256)throw Error('Executable media assets changed.');}
 else if(value?.id!==file.id||!['fia-bound-narration-demand@1','fia-bound-narration-audio@1'].includes(value.schema))throw Error('Invalid bound artifact schema.');
 return response;
}
const revokedSnapshotKey=(packId,revision)=>packKey(packId,'revoked-server:'+revision);
const legacyRefusedApprovedKey=(packId,revision,dependency)=>packKey(packId,'refused-approved:'+revision+':'+dependency.sha256);
const refusedApprovedKey=(packId,revision,dependency)=>packKey(packId,'refused-approved:'+dependency.sha256);
async function approvedRefused(packId,revision,dependency){return await read(refusedApprovedKey(packId,revision,dependency))||await read(legacyRefusedApprovedKey(packId,revision,dependency));}
const approvedAuthorityTurns=new Map();
async function approvedAuthorityTurn(packId,work){const prior=approvedAuthorityTurns.get(packId)||Promise.resolve();let release;const turn=new Promise(r=>release=r);approvedAuthorityTurns.set(packId,turn);await prior;try{return await work();}finally{release();if(approvedAuthorityTurns.get(packId)===turn)approvedAuthorityTurns.delete(packId);}}
const refusalMarker=()=>({refused:true,generation:crypto.randomUUID()});
async function invalidateServerSnapshot(packId){jobs.get(packId)?.abort();const key=packKey(packId,'active'),active=await read(key);if(active?.serverSnapshot){await write(revokedSnapshotKey(packId,active.serverSnapshot.record.revision),{revoked:true});active.serverSnapshot.invalid=true;await write(key,active);}}
async function snapshotComplete(active,{authorityOnly=false}={}){
 const snapshot=active?.serverSnapshot;if(!snapshot||(!authorityOnly&&snapshot.invalid))return false;
 try{serverRecord(snapshot.record,active.packId);const expected=serverFiles(snapshot.record);if(JSON.stringify(expected)!==JSON.stringify(snapshot.files))return false;const cache=await caches.open(active.cache);for(const f of expected)await serverJSON(await cache.match(f.path),f,snapshot.record);return true;}catch{return false;}
}
async function savedServerSnapshot(packId,revision){const active=await read(packKey(packId,'active'));if(revision&&active?.serverSnapshot?.record.revision!==revision)return null;return await snapshotComplete(active)?active:null;}
async function retainServerSnapshot(packId,revision,cache,signal,onprogress){
 if(packId===legacy||revision===undefined)return null;
 if(!isPassageHash(revision))throw Error('Invalid server revision.');
 const checkCanceled=()=>{if(signal.aborted)throw Object.assign(Error('Download paused. Verified files are kept for Resume.'),{name:'AbortError'});};
 let record;try{
  checkCanceled();const r=await fetchLatest(`/v1/packs/${packId}${revision?'?revision='+revision:''}`,{cache:'no-store',redirect:'error',signal});checkCanceled();
  if(r.status!==200||r.redirected)throw Error('Server record unavailable.');record=serverRecord(await r.json(),packId);checkCanceled();if(revision&&record.revision!==revision)throw Error('Server revision changed.');
  const files=serverFiles(record);onprogress?.({phase:'record-verified',verified:0,total:files.length});
  for(const [index,f] of files.entries()){
   checkCanceled();let response=await cache.match(f.path);try{await serverJSON(response,f,record);}catch{checkCanceled();response=await fetchLatest(f.path,{cache:'no-store',redirect:'error',signal});await serverJSON(response,f,record);checkCanceled();await cache.put(f.path,response);}
   checkCanceled();onprogress?.({phase:'artifact-verified',verified:index+1,total:files.length});
  }
  return {record,files,invalid:false};
 }
 catch(error){if(!(signal.aborted&&error.name==='AbortError')&&error.mediaStatusCode!=='media-status-transient')await invalidateServerSnapshot(packId);throw error;}
}
// Catalog retrieval may precede UI cancellation/activation. Keep its artifact
// lookup context separate from PACK_SELECT's native-media custody.
const serverReadPrefix=clientId=>'server-read-context:'+encodeURIComponent(clientId)+':';
async function rememberServerRead(clientId,record){
 if(clientId)await write(serverReadPrefix(clientId)+record.packId+':'+record.revision,{packId:record.packId,revision:record.revision});
}
async function serverReadContexts(clientId){
 if(!clientId)return [];
 const cache=await caches.open(META),prefix='/'+serverReadPrefix(clientId),contexts=[];
 for(const key of await cache.keys()){const path=new URL(typeof key==='string'?key:key.url,self.location.origin).pathname;if(path.startsWith(prefix)){const context=await(await cache.match(key))?.json();if(context)contexts.push(context);}}
 return contexts;
}
async function serverRead(request,clientId){
 const url=new URL(request.url),match=/^\/v1\/packs\/([^/]+)$/.exec(url.pathname),digest=/^\/v1\/artifacts\/([a-f0-9]{64})$/.exec(url.pathname)?.[1];let packId,revision,active,file;
 if(match){packId=match[1];if(!validPack(packId)||packId===legacy||[...url.searchParams.keys()].some(k=>k!=='revision')||url.searchParams.getAll('revision').length>1)return fetch(request);revision=url.searchParams.get('revision')||undefined;if(revision&&!isPassageHash(revision))return fetch(request);active=await read(packKey(packId,'active'));}
 else if(digest&&!url.search){const selected=clientId&&await read('client-'+clientId)||await read('selected');for(const candidate of [...await serverReadContexts(clientId),selected]){if(!candidate?.packId)continue;const saved=candidate.serverSnapshot?candidate:await read(packKey(candidate.packId,'active'));if(!candidate.serverSnapshot&&candidate.revision&&saved?.serverSnapshot?.record.revision!==candidate.revision)continue;const match=saved?.serverSnapshot?.files.find(f=>f.sha256===digest);if(match){packId=candidate.packId;revision=saved.serverSnapshot.record.revision;active=saved;file=match;break;}}}
 else return fetch(request);
 // The server's answer is the page's answer: status, type and body pass through.
 // Verification only decides whether a saved snapshot stays usable. Only a failed
 // fetch (no answer) or a transient server status may use a verified snapshot.
 let response;
 try{response=await fetch(request,{cache:'no-store',redirect:'error'});}catch(error){
  if(error?.name!=='TypeError'&&error?.name!=='AbortError'){if(packId)await invalidateServerSnapshot(packId);return Response.error();}
  return historicalServerRead({match,packId,revision,digest,clientId});
 }
 if([408,429,500,502,503,504].includes(response.status))return historicalServerRead({match,packId,revision,digest,clientId,answer:response});
 // A live preparation is not a revocation of an already verified saved pack.
 if(match&&response.status===202&&!response.redirected)return response;
 try{
  if(match){if(response.status!==200||response.redirected)throw Error('Server record unavailable.');const record=serverRecord(await response.clone().json(),packId);if(revision&&record.revision!==revision)throw Error('Server revision changed.');await rememberServerRead(clientId,record);}
  else if(file)await serverJSON(response.clone(),file,active.serverSnapshot.record);
 }catch{if(packId)await invalidateServerSnapshot(packId);}
 return response;
}
// A verified saved snapshot answers only when the server could not; otherwise the
// server's own transient answer (when there is one) reaches the page unchanged.
async function historicalServerRead({match,packId,revision,digest,clientId,answer}){
 const active=packId&&await savedServerSnapshot(packId,revision);if(!active)return answer||new Response('This server content is not saved for offline use.',{status:503});
 let response;if(match){response=json(active.serverSnapshot.record);await rememberServerRead(clientId,active.serverSnapshot.record);}
 else{const file=active.serverSnapshot.files.find(f=>f.sha256===digest);if(!file)return answer||new Response('This server artifact is not saved.',{status:503});response=await(await caches.open(active.cache)).match(file.path);}
 const headers=new Headers(response.headers);headers.set(offlineServerHeader,'historical-verified');headers.set('Cache-Control','private, no-store');return new Response(await response.arrayBuffer(),{status:200,headers});
}

// Binding authority is independent of whether its audio bytes are already Saved.
// A hash in a URL or another passage's copy is never sufficient authority.
function boundApprovedDelivery(bound,dependency){
 const delivery=bound?.delivery,route=/^\/v1\/approved-audio\/([a-f0-9]{64})\/([a-f0-9]{64})\.(ogg|mp3)$/.exec(delivery?.url||'');
 if(!route||bound.schema!=='fia-bound-narration-audio@1'||bound.id!==dependency.id||dependency.id!=='approved-audio:'+route[1]||Object.keys(bound).sort().join(',')!=='delivery,id,playbackRange,schema'||Object.keys(delivery).sort().join(',')!=='bytes,mime,sha256,url'||delivery.sha256!==route[2]||delivery.mime!==(route[3]==='ogg'?'audio/ogg':'audio/mpeg')||!Number.isSafeInteger(delivery.bytes)||delivery.bytes<=0||delivery.bytes>16777216)return null;
 return delivery;
}
const approvedTransientStatus=status=>[408,429].includes(status)||status>=500;
async function verifiedApprovedResponse(response,delivery){return response.status===200&&!response.redirected&&response.headers.get('Content-Type')===delivery.mime&&response.headers.get('Content-Length')===String(delivery.bytes)&&response.headers.get('ETag')==='"'+delivery.sha256+'"'&&await verified(response.clone(),delivery);}
async function verifyApprovedOutputs(packId,snapshot,cache,signal,onprogress){
 if(!snapshot)return [];
 const record=snapshot.record,refused=[];
 const presentationResponse=await cache.match(artifactPath(record.revision));await serverJSON(presentationResponse,serverFiles(record)[0],record);const presentation=await presentationResponse.json();
 const check=()=>{if(signal.aborted)throw Object.assign(Error('Download paused. Verified files are kept for Resume.'),{name:'AbortError'});};
 for(const dependency of record.execution?.artifacts||[]){check();if(!dependency.id.startsWith('approved-audio:')||!presentation.activities.some(a=>a.execution?.narration?.action==='play-bound-audio'&&a.execution.narration.artifact?.id===dependency.id&&a.execution.narration.artifact.sha256===dependency.sha256))continue;const key=refusedApprovedKey(packId,record.revision,dependency);refused.push({dependency,key,marker:JSON.stringify(await read(key)||null),legacyKey:legacyRefusedApprovedKey(packId,record.revision,dependency),legacyMarker:JSON.stringify(await read(legacyRefusedApprovedKey(packId,record.revision,dependency))||null)});}
 for(const [index,{dependency}] of refused.entries()){
  check();const response=await cache.match(artifactPath(dependency.sha256));await serverJSON(response,dependency,record);const delivery=boundApprovedDelivery(await response.json(),dependency);if(!delivery)throw Error('The approved recording binding could not be verified.');
  const live=await fetch(new URL(delivery.url,self.location.origin).href,{cache:'no-store',redirect:'manual',signal});if(!await verifiedApprovedResponse(live,delivery)){if(!approvedTransientStatus(live.status))await retireApprovedContext({packId,record,dependency});throw Error('The approved recording is still unavailable. Its refusal is preserved.');}check();
  onprogress?.({phase:'approved-output-verified',verified:index+1,total:refused.length});
 }
 return refused.flatMap(({key,marker,legacyKey,legacyMarker})=>[{key,marker},{key:legacyKey,marker:legacyMarker}]);
}
async function approvedAudioAuthority(request,clientId){
 const url=new URL(request.url),route=/^\/v1\/approved-audio\/([a-f0-9]{64})\/([a-f0-9]{64})\.(ogg|mp3)$/.exec(url.pathname);
 if(!route||url.search||request.headers.has('range')||!clientId)return null;
 try{
  const pin=await read('client-'+clientId),packId=pin?.packId;if(!validPack(packId)||packId===legacy)return null;
  const current=await read(packKey(packId,'active')),active=pin.serverSnapshot&&!(current?.cache===pin.cache&&current.serverSnapshot?.record.revision===pin.serverSnapshot.record.revision)?pin:current,record=active?.serverSnapshot?.record;
  // Refusals authenticate the pinned binding independently of offline eligibility.
  if(!record||(pin.serverSnapshot?.record.revision||pin.revision)!==record.revision||!await snapshotComplete(active,{authorityOnly:true}))return null;
  const manifest=validate(active.manifest);if(active.packId!==packId||manifest.packId!==packId||record.execution?.mediaIdentity?.packId!==packId||record.execution.mediaIdentity.revision!==manifest.presentationRevision)return null;
  const dependency=record.execution.artifacts.find(f=>f.id==='approved-audio:'+route[1]);if(!dependency)return null;
  const cache=await caches.open(active.cache),presentationResponse=await cache.match(artifactPath(record.revision));await serverJSON(presentationResponse,serverFiles(record)[0],record);const presentation=await presentationResponse.json();
  if(!presentation.activities.some(a=>a.execution?.narration?.action==='play-bound-audio'&&a.execution.narration.artifact?.id===dependency.id&&a.execution.narration.artifact.sha256===dependency.sha256))return null;
  const boundResponse=await cache.match(artifactPath(dependency.sha256));await serverJSON(boundResponse,dependency,record);const delivery=boundApprovedDelivery(await boundResponse.json(),dependency);if(!delivery||delivery.url!==url.pathname)return null;const mime=delivery.mime;
  const file=permittedRecordings(active.files,generatedRecordingPaths).find(f=>f.group==='audio'&&f.sha256===delivery.sha256&&f.bytes===delivery.bytes&&f.mime===mime&&manifest.files.some(d=>d.path===f.path&&matchingSavedFile(d,active,manifest)===f));
  return {packId,active,record,dependency,delivery,file,cache,clientId};
 }catch{return null;}
}
async function approvedContextCurrent(context){
 if(!context)return false;const pin=await read('client-'+context.clientId);
 const active=pin?.packId&&await read(packKey(pin.packId,'active')),current=pin?.serverSnapshot&&!(active?.cache===pin.cache&&active.serverSnapshot?.record.revision===pin.serverSnapshot.record.revision)?pin:active;
 return pin?.packId===context.packId&&!pin.serverSnapshot?.invalid&&(pin.serverSnapshot?.record.revision||pin.revision)===context.record.revision&&!!current&&current.cache===context.active.cache&&current.serverSnapshot?.record.revision===context.record.revision&&!current.serverSnapshot.invalid&&!await read(revokedSnapshotKey(context.packId,context.record.revision));
}
async function retireApprovedContext(context){
 if(!context)return;
 return approvedAuthorityTurn(context.packId,async()=>{
 // Persist authenticated refusals even after a client moves or another binding
 // invalidates this revision. Do not invalidate a different active revision.
 await write(refusedApprovedKey(context.packId,context.record.revision,context.dependency),refusalMarker());
 await write(revokedSnapshotKey(context.packId,context.record.revision),{revoked:true});
 const active=await read(packKey(context.packId,'active'));
 if(active?.serverSnapshot?.record.execution?.artifacts.some(d=>d.id===context.dependency.id&&d.sha256===context.dependency.sha256))await invalidateServerSnapshot(context.packId);
 });
}
async function historicalApprovedAudio(context,answer){
 if(!context?.file||!await approvedContextCurrent(context)||await approvedRefused(context.packId,context.record.revision,context.dependency)||!await snapshotComplete(context.active))return answer||new Response('This approved recording is not saved for this presentation.',{status:503});
 for(const file of context.active.files.filter(f=>f.group==='core'))if(!await verified(await context.cache.match(file.path),file))return answer||new Response('The saved core could not be verified.',{status:503});
 const response=await context.cache.match(context.file.path);if(!response?.ok||response.headers.get('Content-Type')!==context.file.mime)return answer||new Response('This saved recording could not be verified.',{status:503});
 const bytes=await response.arrayBuffer();if(bytes.byteLength!==context.file.bytes||await contentHash(bytes)!==context.file.sha256||!await approvedContextCurrent(context)||await approvedRefused(context.packId,context.record.revision,context.dependency))return answer||new Response('This saved recording could not be verified.',{status:503});
 const headers=new Headers({'Content-Type':context.file.mime,'Content-Length':String(context.file.bytes),'ETag':'"'+context.file.sha256+'"','Cache-Control':'private, no-store',[offlineServerHeader]:'historical-verified'});
 return new Response(bytes,{status:200,headers});
}
async function approvedAudioRead(request,clientId){
 const context=await approvedAudioAuthority(request,clientId);let response;
 try{response=await fetch(request,{cache:'no-store',redirect:'manual'});}catch(error){if(error?.name==='TypeError'||error?.name==='AbortError')return historicalApprovedAudio(context);await retireApprovedContext(context);return Response.error();}
 if(approvedTransientStatus(response.status))return historicalApprovedAudio(context,response);
 if(context){try{if(!await verifiedApprovedResponse(response,context.delivery))await retireApprovedContext(context);}catch(error){if(error?.name==='TypeError'||error?.name==='AbortError')return historicalApprovedAudio(context);await retireApprovedContext(context);return Response.error();}}
 return response;
}

async function restorableSaved(record){if(!await complete(record))return false;const snapshot=record.serverSnapshot;if(!snapshot)return true;if(await read(revokedSnapshotKey(record.packId,snapshot.record.revision)))return false;for(const dependency of snapshot.record.execution?.artifacts||[])if(await approvedRefused(record.packId,snapshot.record.revision,dependency))return false;return true;}

async function complete(record){
 if(!record)return false;
 if(record.serverSnapshot&&!await snapshotComplete(record))return false;
 const cache=await caches.open(record.cache);
 for(const file of permittedRecordings(record.files,generatedRecordingPaths)){const response=await cache.match(file.path);if(!await verified(response,file))return false;}
 return true;
}
async function status(packId=legacy){
 if(!isBuild)return {available:false,saved:false,reason:'Downloads work on the published Site. This local development preview does not store offline content.'};
 const active=await read(packKey(packId,'active')),pending=await read(packKey(packId,'pending'));
 let manifest,error='';try{manifest=await latest(packId,true);}catch(e){error=e.message;if(e.mediaStatusCode!=='media-status-transient'&&active?.serverSnapshot){await invalidateServerSnapshot(packId);active.serverSnapshot.invalid=true;}manifest=active?.manifest||pending?.manifest;}
 const saved=await complete(active);
 if(active)active.files=permittedRecordings(active.files,generatedRecordingPaths);
 if(manifest)manifest={...manifest,files:permittedRecordings(manifest.files,generatedRecordingPaths)};
 return {available:true,mediaNotices:(await read('media-notices'))||[],saved,active:active?{...active,valid:saved}:null,pending:pending?{...pending,running:jobs.has(packId)}:null,manifest,error,updateAvailable:!!(active&&manifest&&(active.manifest.catalogRevision||active.revision)!==manifest.revision),choices:manifest?['core',...(manifest.files.some(f=>f.group==='audio')?['audio']:[]),...(manifest.files.some(f=>f.group==='video')&&manifest.files.some(f=>f.group==='image')?['visual']:[]),...(manifest.files.some(f=>f.group==='video'||f.group==='image')?['all']:[])].map(id=>({id,bytes:downloadTransferBytes(selectedFiles(manifest,id))})):[]};
}
self.addEventListener('install',event=>{if(isBuild)event.waitUntil(caches.open(SHELL).then(c=>c.addAll(['/','/index.html','/manifest.webmanifest'])).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
async function cachedResponse(request,clientId){
 const url=new URL(request.url);let active=clientId&&await read('client-'+clientId)||await read('active');
 if(active?.shell==='network'&&/\.(?:js|css)$/.test(url.pathname))return fetch(request);
 const target=/^\/content\/packs\/([^/]+)\//.exec(url.pathname)?.[1];
 if(target&&validPack(target)&&active?.packId!==target)active=await read(packKey(target,'active'));
 // Client selection copies are not revocation authority; consult current pack metadata.
 if(active?.serverSnapshot&&active.manifest?.files.some(file=>file.path===url.pathname)){
  const current=await read(packKey(active.packId,'active'));
  if(active.serverSnapshot.invalid||await read(revokedSnapshotKey(active.packId,active.serverSnapshot.record.revision))||!current||current.serverSnapshot?.invalid)return new Response('This saved presentation is no longer valid.',{status:409});
 }
 if(url.pathname==='/content/registry.json'){try{const live=await fetch(request);if(live.ok)return live;}catch{} }
 const declared=active?.files?.find(f=>f.path===url.pathname);
 if(generatedRecordingPaths.has(url.pathname)&&(!declared||!recordingAllowed(declared,generatedRecordingPaths)))return new Response('This recording is unavailable.',{status:404});
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
 if(path.startsWith('/v1/approved-audio/')){event.respondWith(approvedAudioRead(event.request,event.clientId));return;}
 if(/^\/v1\/(?:packs|artifacts)\//.test(path)){event.respondWith(serverRead(event.request,event.clientId));return;}
 if(['/v1','/mcp','/docs','/content/source'].some(inFamily)){event.respondWith(fetch(event.request));return;}
 if(event.request.mode==='navigate')event.respondWith((async()=>{
  let live;
  try{
   live=await fetch(event.request,{cache:'no-store'});
   if(live.status===200&&/^text\/html(?:;|$)/i.test(live.headers.get('Content-Type')||'')){
    const html=(await live.clone().text()).replace(/<!--[\s\S]*?-->/g,'');
    if(/<meta\b[^>]*\bname=["']application-name["'][^>]*\bcontent=["']FIA Guide["']/i.test(html)&&/<div\b[^>]*\bid=["']app["']/i.test(html)&&/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']\/assets\/[^"'?#]+\.js["']/i.test(html)){
     if(event.resultingClientId)await write('client-'+event.resultingClientId,{shell:'network'});
     return live;
    }
   }
  }catch{}
  const preferred=await read('selected');const active=preferred&&await read(packKey(preferred.packId,'active'))||await read('active');
  const cached=active&&await(await caches.open(active.cache)).match('/index.html');
  if(cached){if(event.resultingClientId)await write('client-'+event.resultingClientId,active);return cached;}
  return await(await caches.open(SHELL)).match('/index.html')||live||Response.error();
 })());
 else event.respondWith(cachedResponse(event.request,event.clientId));
});
// Whole-book downloads: a verified copy in another passage's cache serves as this passage's file.
// The passage's own revisions are never a source, so an update still fetches what it repairs.
async function savedElsewhere(file,packId,signal){
 if(packId===legacy)return null;
 const own=`${PREFIX}${packId}-`,outputKey=downloadOutputKey(file);
 for(const name of await caches.keys()){
  signal?.throwIfAborted();if(!name.startsWith(PREFIX))continue;
  // A prefix collision is ambiguous; only a matching other-pack record may override it.
  const cache=await caches.open(name),samePath=name.startsWith(own)?null:await cache.match(file.path);
  if(await verified(samePath?.clone(),file))return samePath;
  if(!outputKey)continue;
  // Cache names embed a pack id; existing validation/key helpers identify its declared records.
  const suffix=name.slice(PREFIX.length);
  for(let cut=suffix.indexOf('-');cut!==-1;cut=suffix.indexOf('-',cut+1)){
   const other=suffix.slice(0,cut);if(other===packId||other===legacy||!validPack(other))continue;
   for(const state of ['active','pending']){
    signal?.throwIfAborted();let record;try{record=await read(packKey(other,state));}catch{continue;}
    if(record?.packId!==other||record.cache!==name||!Array.isArray(record.files))continue;
    for(const candidate of record.files){
     signal?.throwIfAborted();if(!candidate||typeof candidate.path!=='string'||!/^\/(?!\/|.*(?:\.\.|[?#]))/.test(candidate.path)||downloadOutputKey(candidate)!==outputKey||candidate.sourceSha256!==file.sourceSha256||candidate.group!==file.group||candidate.mime!==file.mime||candidate.bytes!==file.bytes)continue;
     const response=await cache.match(candidate.path);
     if((response?.headers.get('Content-Type')||'').split(';')[0].trim()===file.mime&&await verified(response?.clone(),file))return response;
    }
   }
  }
 }
 return null;
}
async function start(selection,port,packId=legacy,sizes={},revision){
 if(!isBuild)throw new Error('Downloads work on the published Site.');
 if(!['core','audio','visual','all'].includes(selection))throw new Error('Choose a download option.');
 if(jobs.has(packId))throw new Error('A download is already running for this passage.');
 const controller=new AbortController();jobs.set(packId,controller);
 let pending;
 // Real bounded preflight work keeps the existing inactivity guard informed.
 // These are metadata milestones, never payload bytes or saved availability.
 const preflight=stage=>{if(controller.signal.aborted)throw Object.assign(Error('Download paused. Verified files are kept for Resume.'),{name:'AbortError'});port?.postMessage({progress:{received:0,bytes:null,count:0,total:0,preflight:stage}});};
 try{
  preflight({phase:'authority-check',verified:0,total:null});
  let manifest;
  try{manifest=await latest(packId,true,preflight);}catch(error){if(controller.signal.aborted&&error.name==='AbortError')throw error;if(error.mediaStatusCode!=='media-status-transient'){await invalidateServerSnapshot(packId);throw error;}const previous=await read(packKey(packId,'pending'));if(!previous)throw error;manifest=validate(previous.manifest);}
  const priorPending=await read(packKey(packId,'pending'));if(!Object.keys(sizes).length&&priorPending?.selection===selection)sizes=priorPending.manifest.mediaSizes||{};
  manifest=planProxyDownload(manifest,selection,sizes);
  const files=selectedFiles(manifest,selection),cacheName=`${PREFIX}${packId===legacy?'':packId+'-'}${manifest.revision}-${selection}`;
  const active=await read(packKey(packId,'active'));
  // A repair stages separately from the last working copy, even at the same revision.
  const cacheId=active?.cache===cacheName?cacheName+'-repair':cacheName;
  const cache=await caches.open(cacheId);
  const serverSnapshot=await retainServerSnapshot(packId,revision,cache,controller.signal,preflight);
  if(serverSnapshot){const binding=serverSnapshot.record.execution?.mediaIdentity||{packId:serverSnapshot.record.packId,revision:serverSnapshot.record.revision};if(binding.packId!==manifest.packId||binding.revision!==manifest.presentationRevision)throw Error('The saved media belongs to a different server presentation.');}
  // Old loaded callers use the same Save protocol. Never downgrade a verified
  // executable Saved snapshot to a static base (or a snapshot-less legacy save).
  if(active?.serverSnapshot?.record.execution&&!serverSnapshot?.record.execution&&await snapshotComplete(active))throw Error('The executable saved passage is preserved. Reload before saving this selection.');
  // Every audio Save authenticates canonical outputs; fresh pack/proxy bytes
  // cannot override a refusal observed before the first Saved snapshot exists.
  const verifiedRefusals=downloadSelectionIncludes(selection,'audio')?await verifyApprovedOutputs(packId,serverSnapshot,cache,controller.signal,preflight):[];
  const downloadFiles=[...files,...(serverSnapshot?.files||[])];
  pending={packId,cache:cacheId,revision:manifest.revision,selection,manifest,files,...(serverSnapshot?{serverSnapshot}:{}),bytes:downloadTransferBytes(downloadFiles),received:0,count:0,status:'downloading'};
  await write(packKey(packId,'pending'),pending);
  const report=()=>port?.postMessage({progress:{received:pending.received,bytes:pending.bytes,count:pending.count,total:downloadFiles.length}});
  const transferred=new Map();
  for(const file of downloadFiles){
   if(controller.signal.aborted)throw new Error('Download paused. Verified files are kept for Resume.');
   let response=await cache.match(file.path);
   if(file.proxyRequest){
    const prior=priorPending?.files.find(f=>f.path===file.path&&observedProxyMatchesRequest(file.proxyRequest,f));
    if(prior&&await verified(response?.clone(),prior)){Object.assign(file,{bytes:prior.bytes,sha256:prior.sha256,proxyReceipt:prior.proxyReceipt,timing:{status:file.timingDependent?'pending-qualification':'not-applicable'}});}
    else {const result=await fetchProxyRequest(file.proxyRequest,{signal:controller.signal});Object.assign(file,{bytes:result.receipt.output.bytes,sha256:result.receipt.output.sha256,proxyReceipt:result.receipt,timing:{status:file.timingDependent?'pending-qualification':'not-applicable'}});await cache.put(file.path,new Response(result.bytes,{headers:{'Content-Type':file.mime,'Content-Length':String(file.bytes)}}));response=await cache.match(file.path);}
    pending.bytes=downloadTransferBytes(downloadFiles);
   }
   const outputKey=downloadOutputKey(file),twin=outputKey&&transferred.get(outputKey),shared=!!twin&&twin!==file.path;
   // A clip shared by several paths is fetched once; later paths reuse the verified copy.
   if(shared&&!await verified(response?.clone(),file)){const copy=await cache.match(twin);if(await verified(copy?.clone(),file)){await cache.put(file.path,new Response(await copy.arrayBuffer(),{headers:copy.headers}));response=await cache.match(file.path);}}
   // A file another passage already saved and verified (the app, the catalog, a shared clip) is copied, not fetched again.
   if(!await verified(response?.clone(),file)){const elsewhere=await savedElsewhere(file,packId,controller.signal);if(elsewhere){await cache.put(file.path,new Response(await elsewhere.arrayBuffer(),{headers:elsewhere.headers}));response=await cache.match(file.path);}}
   if(!await verified(response?.clone(),file)){
    const timeout=setTimeout(()=>controller.abort(),30000);
    try{response=await fetch(file.deliveryURL||file.path,{cache:'no-store',signal:controller.signal});if(file.deliveryURL){const bytes=await readVerifiedMedia(response,file,{signal:controller.signal});response=new Response(bytes,{headers:{'Content-Type':file.mime}});}else if(!await verified(response.clone(),file))throw new Error('A file could not be verified. Retry to keep the files already downloaded.');
     const headers=new Headers(response.headers);headers.set('Content-Length',String(file.bytes));await cache.put(file.path,new Response(await response.arrayBuffer(),{headers}));
    }finally{clearTimeout(timeout);}
   }
   if(outputKey&&!transferred.has(outputKey))transferred.set(outputKey,file.path);
   if(!shared)pending.received+=file.bytes;pending.count++;await write(packKey(packId,'pending'),pending);report();
  }
  if(controller.signal.aborted)throw new Error('Download paused. Verified files are kept for Resume.');
  if(files.some(f=>f.timing?.status==='pending-qualification')){pending.status='timing-pending';pending.error='Files received. Recording timing must be qualified before this selection can play offline.';await write(packKey(packId,'pending'),pending);return {saved:false,received:true,timingPending:true};}
  if(!await complete(pending))throw new Error('Storage changed before verification finished. Retry the download.');
  if(controller.signal.aborted)throw new Error('Download authority changed before activation.');
  // Single metadata write is the commit point. An interrupted update keeps active intact.
  await approvedAuthorityTurn(packId,async()=>{for(const {key,marker} of verifiedRefusals)if(JSON.stringify(await read(key)||null)!==marker)throw Error('Recording authority changed after verification. Retry the Save.');await write(packKey(packId,'active'),pending);for(const {key} of verifiedRefusals){if(controller.signal.aborted)break;await(await caches.open(META)).delete('/'+key);}if(serverSnapshot&&!controller.signal.aborted)await(await caches.open(META)).delete('/'+revokedSnapshotKey(packId,serverSnapshot.record.revision));await(await caches.open(META)).delete('/'+packKey(packId,'pending'));if(controller.signal.aborted){for(const {key,marker} of verifiedRefusals)if(marker!=='null')await write(key,JSON.parse(marker));if(await restorableSaved(active))await write(packKey(packId,'active'),active);else await invalidateServerSnapshot(packId);throw new Error('Download authority changed during activation.');}});
  // Keep the prior revision for already-open clients. Removal clears every revision.
  // Do not switch an open page's media beneath its loaded text and alignment.
  return {saved:true,selection};
 }catch(error){
  if(pending){pending.status='interrupted';pending.error=error.name==='QuotaExceededError'?'Your device does not have enough storage. Free space or choose a smaller download.':controller.signal.aborted?'Download paused. Verified files are kept for Resume.':error.message;await write(packKey(packId,'pending'),pending);throw new Error(pending.error);}
  throw error;
 }finally{jobs.delete(packId);}
}
async function declaredMediaRevision(data,packId){
 if(data.mediaIdentity===undefined&&data.mediaAssetsSha256===undefined)return data.revision;
 if(data.mediaIdentity?.packId!==packId||!isPassageHash(data.mediaIdentity?.revision)||!isPassageHash(data.mediaAssetsSha256)||!isPassageHash(data.revision))throw Error('Invalid declared media identity.');
 let record;try{const response=await fetchLatest(`/v1/packs/${packId}?revision=${data.revision}`,{cache:'no-store',redirect:'error'});if(response.status!==200||response.redirected)throw Error('Media authority is unavailable.');record=serverRecord(await response.json(),packId);}
 catch(error){if(error.mediaStatusCode!=='media-status-transient'){await invalidateServerSnapshot(packId);throw error;}const active=await savedServerSnapshot(packId,data.revision);if(!active)throw error;record=active.serverSnapshot.record;}
 if(record.revision!==data.revision||record.execution?.mediaIdentity?.packId!==data.mediaIdentity.packId||record.execution?.mediaIdentity?.revision!==data.mediaIdentity.revision||record.execution?.mediaAssetsSha256!==data.mediaAssetsSha256)throw Error('Media identity is not authorized by the server record.');
 return data.mediaIdentity.revision;
}
async function recordMediaNotices({packId,path,notes}){packId=validPack(packId)?packId:null;path=typeof path==='string'&&/^\/[A-Za-z0-9/._-]{1,240}$/.test(path)?path:null;const at=new Date().toISOString(),list=(await read('media-notices'))||[];for(const n of notes){list.push({at,build:VERSION,packId,path,...n});console.warn('[fia.media]',n.kind,path,n);}await write('media-notices',list.slice(-20));}
self.addEventListener('message',event=>{
 const port=event.ports?.[0],type=event.data?.type,packId=event.data?.packId||legacy;
 event.waitUntil((async()=>{
  let noticeLog=null;
  try{
   if(!validPack(packId))throw new Error('Invalid passage identity.');
   let result={};
   if(type==='MEDIA_CANCEL'){const key=(event.source?.id||'')+':'+event.data.requestId;canceledPlayback.add(key);if(canceledPlayback.size>256)canceledPlayback.delete(canceledPlayback.values().next().value);playbackJobs.get(key)?.abort();result={canceled:true};
   }else if(type==='MEDIA_STATUS'||type==='MEDIA_PLAY'){
    const mediaRevision=await declaredMediaRevision(event.data,packId);const active=await read(packKey(packId,'active'));let manifest;try{manifest=await latest(packId,true);}catch(error){if(type==='MEDIA_STATUS'||error?.mediaStatusCode!=='media-status-transient')throw error;manifest=active?.manifest?validate(active.manifest):null;}
    if(!manifest||manifest.packId!==packId||manifest.presentationRevision!==mediaRevision)throw Error('The media revision is unavailable.');
    if(type==='MEDIA_STATUS')result={deliveryRevision:manifest.deliveryRevision||null,files:manifest.files.filter(f=>f.deliveryURL),savedFiles:manifest.files.filter(f=>f.deliveryURL).map(f=>matchingSavedFile(f,active,manifest)).filter(Boolean)};
    else{
     let file=manifest.files.find(f=>f.path===event.data.path&&f.deliveryURL);
     const video=file?.group==='video',notes=[];
     const saved=file&&matchingSavedFile(file,active,manifest);
     if(saved)file=saved;else if(event.data.size){normalizeMediaSizes({[file?.group]:event.data.size});const variant=file?.variants?.[event.data.size];if(variant)file=variant;else if(file?.defaultSize!==event.data.size){if(!video)throw Error('This media size is not prepared.');notes.push({kind:'size-fallback',requested:event.data.size,served:file.defaultSize||null});}}
     if(!file)throw Error('This resource is not prepared for online playback.');
     if(manifest.deliveryRevision!==event.data.deliveryRevision){if(!video)throw Error('This resource is not prepared for online playback.');notes.push({kind:'revision-changed',page:/^[a-f0-9]{64}$/.test(event.data.deliveryRevision)?event.data.deliveryRevision:null,worker:manifest.deliveryRevision||null});}
     const key=(event.source?.id||'')+':'+event.data.requestId;if(canceledPlayback.delete(key))throw Error('Playback canceled.');if(!event.data.requestId||playbackJobs.has(key))throw Error('Invalid playback request.');
     if(file.scripturePlaybackMode==='passage-only')validateScripturePassageFile(file,packId);validateVideoSize(file);const controller=new AbortController();playbackJobs.set(key,controller);
     try{let response=active?.cache&&await(await caches.open(active.cache)).match(file.path),bytes=null,served={sha256:file.sha256,bytes:file.bytes};
      if(response){try{bytes=await readVerifiedMedia(response,file,{signal:controller.signal});}catch(error){if(controller.signal.aborted)throw error;if(video&&saved)notes.push({kind:'saved-copy-unreadable'});}}
      if(!bytes){response=await fetch(file.deliveryURL,{cache:'no-store',signal:controller.signal,...(video?{redirect:'error'}:{})});
       if(video){const read=await readPlayableVideo(response,file,{signal:controller.signal});bytes=read.bytes;served=read.served;if(read.drift)notes.push({kind:'content-drift',expected:{sha256:file.sha256,bytes:file.bytes},served});}
       else bytes=await readVerifiedMedia(response,file,{signal:controller.signal});}
      if(controller.signal.aborted)throw Error('Playback canceled.');result={bytes:bytes.buffer,mime:file.mime,timing:file.timing,...(file.playbackRange?{playbackRange:file.playbackRange}:{}),...(file.scriptureAlignment?{scriptureAlignment:file.scriptureAlignment,scriptureAlignmentSha256:file.scriptureAlignmentSha256}:{}),...(file.scripturePlaybackMode==='passage-only'?{scriptureAlignment:null,scripturePlaybackMode:'passage-only',scriptureHighlighting:'disabled'}:{}),file:file.scripturePlaybackMode==='passage-only'?file:{path:file.path,sha256:served.sha256,bytes:served.bytes,deliveryURL:file.deliveryURL},...(notes.length?{notes}:{})};
      if(notes.length)noticeLog={packId,path:file.path,notes};
     }finally{playbackJobs.delete(key);canceledPlayback.delete(key);}
    }
   }else if(type==='PACK_SELECT'){
    const active=await read(packKey(packId,'active'));
    const matches=active&&(active.manifest?.presentationRevision===event.data.revision||!active.serverSnapshot?.invalid&&active.serverSnapshot?.record.revision===event.data.revision);
    if(event.source?.id){const prior=await read('client-'+event.source.id);await write('client-'+event.source.id,{...(matches?active:{packId,revision:event.data.revision}),...(prior?.shell==='network'?{shell:'network'}:{})});}
    await write('selected',{packId});result={selected:true};
   }else if(type==='DOWNLOAD_STATUS'||type==='CACHE_STATUS')result=await status(packId);
   else if(type==='DOWNLOAD_START'){const active=await read(packKey(packId,'active'));if(active&&event.source?.id&&!await read('client-'+event.source.id))await write('client-'+event.source.id,active);result=await start(event.data.selection,port,packId,event.data.sizes||{},event.data.revision);}
   else if(type==='DOWNLOAD_PAUSE'){jobs.get(packId)?.abort();result={paused:true};}
   else if(type==='DOWNLOAD_REMOVE'){
    if(jobs.has(packId))throw new Error('Pause the download before removing it.');
    const keys=await caches.keys(),prefix=packId===legacy?PREFIX:`${PREFIX}${packId}-`;
    const meta=await caches.open(META);
    const active=await read(packKey(packId,'active')),pending=await read(packKey(packId,'pending'));
    const owned=new Set([active?.cache,pending?.cache]);
    await Promise.all(keys.filter(k=>packId===legacy?owned.has(k)||new RegExp('^'+PREFIX+'[a-zA-Z0-9]+-(core|audio|visual|all)(-repair)?$').test(k):k.startsWith(prefix)).map(k=>caches.delete(k)));
    await meta.delete('/'+packKey(packId,'active'));await meta.delete('/'+packKey(packId,'pending'));result={saved:false};
   }else return;
   port?.postMessage({ok:true,...result},result.bytes instanceof ArrayBuffer?[result.bytes]:[]);
   if(noticeLog)await recordMediaNotices(noticeLog).catch(()=>{});
  }catch(error){port?.postMessage(type==='MEDIA_STATUS'?{ok:false,error:'Media availability could not be verified.',code:error?.mediaStatusCode==='media-status-transient'?'media-status-transient':'media-status-invalid'}:{ok:false,error:error.message});if(type==='MEDIA_PLAY'&&error.message!=='Playback canceled.')await recordMediaNotices({packId,path:event.data.path,notes:[{kind:'play-failed',message:'Playback failed.'}]}).catch(()=>{});}
 })());
});
