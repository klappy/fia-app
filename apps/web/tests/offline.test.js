import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
const bytes={'/index.html':'app','/audio.m4a':'recording','/video.mp4':'012345'};
const manifest=(revision='r1')=>({schema:1,packId:'fia-mark-authentic',revision,files:Object.entries(bytes).map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex'),group:path.endsWith('.m4a')?'audio':path.endsWith('.mp4')?'video':'core'}))});
function worker(){
 const handlers={},stores=new Map();let current=manifest(),calls=[],options=[],fail=null;const transfers=[];const replies=new Map();
 const open=async name=>{if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {match:async key=>store.get(String(key))?.clone(),put:async(key,value)=>store.set(String(key),value.clone()),delete:async key=>store.delete(key),addAll:async()=>{}};};
 const context={self:{location:{origin:'https://fia.test'},addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>{}},skipWaiting:async()=>{}},caches:{open,keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name)},fetch:async (url,init)=>{const key=typeof url==='string'?url:url.url,path=new URL(key,'https://fia.test').pathname;calls.push(key);options.push(init);if(fail===url||fail===key||fail===path)throw new Error('Network interrupted');if(replies.has(path))return replies.get(path).clone();return url==='/offline-manifest.json'?Response.json(current):new Response(bytes[String(url)]||'live');},Response,Request,Headers,URL,Promise,console,crypto:webcrypto,AbortController,setTimeout,clearTimeout};
 vm.runInNewContext(readFileSync('src/lib/media-delivery.js','utf8').replace(/export (?=(?:async )?function)/g,'')+'\n'+readFileSync('src/lib/proxy-request.js','utf8').replace(/export (?=(?:async )?function)/g,'')+'\n'+readFileSync('public/sw.js','utf8').replace('__BUILD_ID__','test123'),context);
 return {stores,calls,options,transfers,reply:(path,response)=>replies.set(path,response),manifest:value=>current=value,fail:value=>fail=value,async fetch(request,client={}){let promise;handlers.fetch({request,...client,respondWith:p=>promise=p});return promise;},async message(data,onprogress,clientId){let task,result;handlers.message({data,source:clientId?{id:clientId}:null,ports:[{postMessage:(r,list=[])=>{transfers.push(list);if(r.progress)onprogress?.(r.progress);else result=r;}}],waitUntil:p=>task=p});await task;return result;}};
}
test('selected downloads verify hashes, report exact progress and do not fetch unselected video',async()=>{const w=worker();const progress=[];assert.equal((await w.message({type:'DOWNLOAD_START',selection:'audio'},p=>progress.push(p))).ok,true);assert.equal(w.calls.includes('/video.mp4'),false);assert.equal(progress.at(-1).received,12);const status=await w.message({type:'DOWNLOAD_STATUS'});assert.equal(status.saved,true);assert.equal(status.active.selection,'audio');assert.equal(status.choices.find(c=>c.id==='all').bytes,18);});
test('offline video supports byte ranges and rejects invalid ranges',async()=>{const w=worker();await w.message({type:'DOWNLOAD_START',selection:'all'});let r=await w.fetch(new Request('https://fia.test/video.mp4',{headers:{Range:'bytes=2-4'}}));assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),'bytes 2-4/6');assert.equal(await r.text(),'234');r=await w.fetch(new Request('https://fia.test/video.mp4',{headers:{Range:'bytes=9-'}}));assert.equal(r.status,416);r=await w.fetch(new Request('https://fia.test/video.mp4',{headers:{Range:'bytes=-2'}}));assert.equal(await r.text(),'45');});
test('interrupted download retains verified partial files and resumes without fetching them again',async()=>{const w=worker();w.fail('/audio.m4a');assert.equal((await w.message({type:'DOWNLOAD_START',selection:'all'})).ok,false);let status=await w.message({type:'DOWNLOAD_STATUS'});assert.equal(status.saved,false);assert.equal(status.pending.received,3);w.fail(null);w.calls.length=0;assert.equal((await w.message({type:'DOWNLOAD_START',selection:'all'})).ok,true);assert.equal(w.calls.includes('/index.html'),false);assert.equal((await w.message({type:'DOWNLOAD_STATUS'})).saved,true);});
test('failed update preserves last good copy; successful retry atomically activates new revision',async()=>{const w=worker();await w.message({type:'DOWNLOAD_START',selection:'all'});w.manifest(manifest('r2'));w.fail('/video.mp4');assert.equal((await w.message({type:'DOWNLOAD_START',selection:'all'})).ok,false);let s=await w.message({type:'DOWNLOAD_STATUS'});assert.equal(s.saved,true);assert.equal(s.active.revision,'r1');assert.equal(s.updateAvailable,true);w.fail(null);await w.message({type:'DOWNLOAD_START',selection:'all'});s=await w.message({type:'DOWNLOAD_STATUS'});assert.equal(s.active.revision,'r2');assert.equal(s.pending,null);assert.equal(s.updateAvailable,false);});
test('hash mismatch cannot activate and eviction cannot be reported as saved',async()=>{const w=worker();const bad=manifest();bad.files[1].sha256='a'.repeat(64);w.manifest(bad);assert.equal((await w.message({type:'DOWNLOAD_START',selection:'all'})).ok,false);assert.equal((await w.message({type:'DOWNLOAD_STATUS'})).saved,false);w.manifest(manifest());await w.message({type:'DOWNLOAD_START',selection:'all'});const s=await w.message({type:'DOWNLOAD_STATUS'});w.stores.get(s.active.cache).delete('/audio.m4a');assert.equal((await w.message({type:'DOWNLOAD_STATUS'})).saved,false);});
test('remove clears active and interrupted files',async()=>{const w=worker();await w.message({type:'DOWNLOAD_START',selection:'core'});w.manifest(manifest('r2'));w.fail('/video.mp4');await w.message({type:'DOWNLOAD_START',selection:'all'});await w.message({type:'DOWNLOAD_REMOVE'});const s=await w.message({type:'DOWNLOAD_STATUS'});assert.equal(s.saved,false);assert.equal(s.pending,null);assert.equal([...w.stores.keys()].some(k=>k.startsWith('fia-v3-pack-')),false);});
test('eviction during an update cannot activate or discard the prior saved revision',async()=>{const w=worker();await w.message({type:'DOWNLOAD_START',selection:'all'});w.manifest(manifest('r2'));const result=await w.message({type:'DOWNLOAD_START',selection:'all'},p=>{if(p.count===2)w.stores.get('fia-v3-pack-r2-all').delete('/index.html');});assert.equal(result.ok,false);assert.equal((await w.message({type:'DOWNLOAD_STATUS'})).active.revision,'r1');assert.equal((await w.message({type:'DOWNLOAD_STATUS'})).saved,true);});
test('online navigation upgrades shell without discarding saved content',async()=>{
 const w=worker();await w.message({type:'DOWNLOAD_START',selection:'all'});const before=await w.message({type:'DOWNLOAD_STATUS'});
 const html='<meta name="application-name" content="FIA Guide"><div id="app"></div><script type="module" src="/assets/new.js"></script>';
 w.reply('/',new Response(html,{headers:{'Content-Type':'text/html'}}));
 const response=await w.fetch({url:'https://fia.test/',method:'GET',mode:'navigate'},{resultingClientId:'new'});
 assert.equal(await response.text(),html);assert.equal(w.calls.includes('https://fia.test/'),true);
 assert.equal((await w.message({type:'DOWNLOAD_STATUS'})).active.cache,before.active.cache);
 w.stores.get(before.active.cache).set('/assets/new.js',new Response('old-conflict'));
 w.reply('/assets/new.js',new Response('new-code'));
 await w.message({type:'PACK_SELECT',revision:before.active.manifest.presentationRevision},null,'new');
 assert.equal(await(await w.fetch(new Request('https://fia.test/assets/new.js'),{clientId:'new'})).text(),'new-code');
 assert.equal((await w.message({type:'DOWNLOAD_STATUS'})).saved,true);
});
test('invalid navigation response falls back to coherent installed shell',async()=>{
 for(const [status,type,body] of [[404,'text/html','missing'],[500,'text/html','error'],[200,'application/json','{}'],[200,'text/html','<html>maintenance</html>'],[200,'text/html','<!-- <meta name="application-name" content="FIA Guide"><div id="app"></div><script type="module" src="/assets/old.js"></script> -->Maintenance'],[200,'text/html','<div id="app"></div><script type="module" src="/assets/other.js"></script>'],[200,'text/html','<meta name="application-name" content="FIA Guide"><div id="app"></div><script type="module" src="https://other.test/assets/app.js"></script>']]){
  const w=worker();await w.message({type:'DOWNLOAD_START',selection:'all'});w.reply('/',new Response(body,{status,headers:{'Content-Type':type}}));
  assert.equal(await(await w.fetch({url:'https://fia.test/',method:'GET',mode:'navigate'},{resultingClientId:'fallback'})).text(),'app');
  assert.equal((await w.stores.get('fia-v3-download-metadata@1').get('/client-fallback').json()).revision,'r1');
 }
});

test('repeated saves do not move an unchanged open page to another content revision',async()=>{const w=worker();await w.message({type:'DOWNLOAD_START',selection:'all'});w.manifest(manifest('r2'));await w.message({type:'DOWNLOAD_START',selection:'all'},null,'page-a');w.manifest(manifest('r3'));await w.message({type:'DOWNLOAD_START',selection:'all'},null,'page-a');const pin=await w.stores.get('fia-v3-download-metadata@1').get('/client-page-a').clone().json();assert.equal(pin.revision,'r1');assert.equal((await w.message({type:'DOWNLOAD_STATUS'})).active.revision,'r3');});

test('live version bypasses a historic installed cache and never falls back to it offline',async()=>{
 const w=worker();await w.message({type:'DOWNLOAD_START',selection:'core'});const status=await w.message({type:'DOWNLOAD_STATUS'});
 w.stores.get(status.active.cache).set('/version.json',new Response('stale-installed-version'));
 const request=new Request('https://fia.test/version.json');
 assert.equal(await(await w.fetch(request)).text(),'live');assert.equal(w.options.at(-1).cache,'no-store');
 w.fail(request);await assert.rejects(w.fetch(request),/Network interrupted/);
});

const onlineRoutes=['/version.json','/build-status','/build-status/','/build-status.html','/build-status/observations.json','/docs','/docs/TEST-GUIDE.html','/content/source','/content/source/audio-manifest.json','/v1','/v1/not-a-route','/mcp','/mcp/unsupported'];
test('hosting HTML fallback for deployment config rejects old manifest; corrected explicit retry succeeds without weakening asset integrity',async()=>{
 const w=worker(),control='/*\n X-Test: retained';
 const old=manifest('bad-config');old.files.unshift({path:'/_headers',bytes:Buffer.byteLength(control),sha256:createHash('sha256').update(control).digest('hex'),group:'core'});
 w.reply('/_headers',new Response('<html>app fallback</html>',{headers:{'Content-Type':'text/html'}}));w.manifest(old);
 assert.equal((await w.message({type:'DOWNLOAD_START',selection:'audio'})).ok,false);assert.equal((await w.message({type:'DOWNLOAD_STATUS'})).pending.received,0);
 w.manifest(manifest('public-assets-only'));w.calls.length=0;
 assert.equal((await w.message({type:'DOWNLOAD_START',selection:'audio'})).ok,true);assert.equal(w.calls.includes('/_headers'),false);assert.equal((await w.message({type:'DOWNLOAD_STATUS'})).saved,true);
 w.reply('/audio.m4a',new Response('corrupt'));w.manifest(manifest('corrupt-real-asset'));
 assert.equal((await w.message({type:'DOWNLOAD_START',selection:'audio'})).ok,false);assert.equal((await w.message({type:'DOWNLOAD_STATUS'})).active.revision,'public-assets-only');
});
test('installed packs preserve online-only navigation response status, headers and body',async()=>{
 const w=worker();await w.message({type:'DOWNLOAD_START',selection:'core'});
 for(const path of onlineRoutes){
  const status=path.startsWith('/v1')?404:path.startsWith('/mcp')?405:200;
  w.reply(path,new Response('network:'+path,{status,headers:{'Content-Type':path.startsWith('/v1')?'application/json':'text/plain','X-Route-Evidence':path}}));
  const request={url:'https://fia.test'+path,method:'GET',mode:'navigate'};
  const response=await w.fetch(request,{resultingClientId:'online-document'});
  assert.equal(response.status,status,path);assert.equal(response.headers.get('X-Route-Evidence'),path);assert.equal(await response.text(),'network:'+path);
  if(path==='/version.json'||path.startsWith('/build-status'))assert.equal(w.options.at(-1).cache,'no-store');
 }
 assert.equal(w.stores.get('fia-v3-download-metadata@1').has('/client-online-document'),false);
});
test('online-only network failure never falls back to installed or shell-only HTML',async()=>{
 for(const active of [true,false]){
  const w=worker();if(active)await w.message({type:'DOWNLOAD_START',selection:'core'});
  w.stores.set('fia-v3-shell-test123',new Map([['/index.html',new Response('cached-shell')]]));
  for(const path of onlineRoutes){w.fail(path);await assert.rejects(w.fetch({url:'https://fia.test'+path,method:'GET',mode:'navigate'}),/Network interrupted/,`${active}:${path}`);}
 }
});
test('root, sessions and near-prefix routes retain installed revision and new-client pin',async()=>{
 const w=worker();await w.message({type:'DOWNLOAD_START',selection:'core'});
 for(const [i,path]of ['/','/session/continuation','/v10/example','/mcp-other','/docs-extra','/content/sources','/build-status-extra'].entries()){
  w.fail(path);const id='page-'+i,response=await w.fetch({url:'https://fia.test'+path,method:'GET',mode:'navigate'},{resultingClientId:id});
  assert.equal(await response.text(),'app',path);
  const pin=await w.stores.get('fia-v3-download-metadata@1').get('/client-'+id).clone().json();assert.equal(pin.revision,'r1');
 }
});

test('two installed passages isolate removal and verify media before explicit downloads',async()=>{
 const w=worker(),eng='eng.MRK-1-1-13',spa='spa.MRK-1-14-20';
 const perPack=id=>({...manifest(),packId:id,presentationRevision:'a'.repeat(64)});
 w.reply('/offline/'+eng+'.json',Response.json(perPack(eng)));w.reply('/offline/'+spa+'.json',Response.json(perPack(spa)));
 const blocked=await w.fetch(new Request('https://fia.test/audio.m4a'));assert.equal(blocked.status,409);assert.equal(w.calls.includes('https://fia.test/audio.m4a'),false);
 assert.equal((await w.message({type:'DOWNLOAD_START',packId:eng,selection:'audio'})).ok,true);
 assert.equal((await w.message({type:'DOWNLOAD_START',packId:spa,selection:'core'})).ok,true);
 assert.equal((await w.message({type:'DOWNLOAD_STATUS',packId:eng})).saved,true);
 await w.message({type:'DOWNLOAD_REMOVE',packId:spa});assert.equal((await w.message({type:'DOWNLOAD_STATUS',packId:eng})).saved,true);assert.equal((await w.message({type:'DOWNLOAD_STATUS',packId:spa})).saved,false);
 await w.message({type:'PACK_SELECT',packId:eng,revision:'a'.repeat(64)},null,'page');
 assert.equal(await(await w.fetch(new Request('https://fia.test/audio.m4a'),{clientId:'page'})).text(),'recording');
});

test('text-only selection excludes resource images until an explicit all-resources download',async()=>{const w=worker();const m=manifest();m.files.push({path:'/image.png',bytes:4,sha256:createHash('sha256').update('live').digest('hex'),group:'image'});w.manifest(m);await w.message({type:'DOWNLOAD_START',selection:'core'});assert.equal(w.calls.includes('/image.png'),false);await w.message({type:'DOWNLOAD_START',selection:'all'});assert.equal(w.calls.includes('/image.png'),true);});

test('explicit online play and optional download use identical verified proxy derivative; passive requests stay blocked',async()=>{
 const w=worker(),id='eng.MRK-1-1-13',revision='a'.repeat(64),deliveryRevision='b'.repeat(64),url='https://transcode.klappy.dev/audio/preset=voice,q=medium,f=opus/https://fia.test/audio.m4a';
 const m={...manifest(),packId:id,presentationRevision:revision,deliveryRevision};
 const f=m.files.find(f=>f.path==='/audio.m4a');Object.assign(f,{bytes:3,sha256:createHash('sha256').update('abc').digest('hex'),mime:'audio/ogg',deliveryURL:url,sourceSha256:'c'.repeat(64),deliveryRevision,timing:{status:'not-applicable'}});
 w.reply('/offline/'+id+'.json',Response.json(m));w.reply(new URL(url).pathname,new Response('abc',{headers:{'Content-Type':'audio/ogg'}}));
 await w.message({type:'MEDIA_STATUS',packId:id,revision});assert.equal(w.calls.includes(url),false);
 assert.equal((await w.fetch(new Request('https://fia.test/audio.m4a'))).status,409);
 const args={type:'MEDIA_PLAY',packId:id,revision,deliveryRevision,path:'/audio.m4a',requestId:'one'};
 let r=await w.message(args,null,'page');assert.equal(r.ok,true,r.error);assert.equal(new TextDecoder().decode(r.bytes),'abc');assert.equal((await w.message({type:'DOWNLOAD_STATUS',packId:id})).saved,false);
 assert.equal(w.calls.filter(x=>x===url).length,1);
 assert.equal((await w.message({type:'DOWNLOAD_START',packId:id,selection:'audio'})).ok,true);
 w.calls.length=0;r=await w.message({...args,requestId:'two'},null,'page');assert.equal(r.ok,true);assert.equal(w.calls.includes(url),false);
 assert.equal((await w.message({...args,requestId:'bad',revision:'d'.repeat(64)},null,'page')).ok,false);
 await w.message({type:'MEDIA_CANCEL',packId:id,requestId:'canceled'},null,'page');assert.equal((await w.message({...args,requestId:'canceled'},null,'page')).ok,false);
});

test('video delivery verifies cached bytes and transfers output; oversized descriptors never fetch media',async()=>{
 const w=worker(),id='eng.MRK-1-1-13',revision='a'.repeat(64),deliveryRevision='b'.repeat(64),url='https://transcode.klappy.dev/video/preset=fia,q=medium,f=mp4/https://publisher.test/video.mp4';
 const m={...manifest(),packId:id,presentationRevision:revision,deliveryRevision},file=m.files.find(f=>f.group==='video');Object.assign(file,{mime:'video/mp4',deliveryURL:url,sourceSha256:'c'.repeat(64),sourceBytes:100,logicalSourceSha256:'d'.repeat(64),logicalSourceBytes:6,deliveryRevision,timing:{status:'not-applicable'}});
 w.reply('/offline/'+id+'.json',Response.json(m));w.reply(new URL(url).pathname,new Response('012345',{headers:{'Content-Type':'video/mp4'}}));
 const args={type:'MEDIA_PLAY',packId:id,revision,deliveryRevision,path:'/video.mp4',requestId:'v1'};
 await w.message({type:'MEDIA_STATUS',packId:id,revision});assert.equal(w.calls.includes(url),false);let r=await w.message(args);assert.equal(r.ok,true,r.error);assert.equal(w.transfers.at(-1)[0],r.bytes);
 assert.equal((await w.message({type:'DOWNLOAD_START',packId:id,selection:'all'})).ok,true);w.calls.length=0;r=await w.message({...args,requestId:'v2'});assert.equal(r.ok,true);assert.equal(w.calls.includes(url),false);
 const active=(await w.message({type:'DOWNLOAD_STATUS',packId:id})).active;w.stores.get(active.cache).set('/video.mp4',new Response('wrong!',{headers:{'Content-Type':'video/mp4'}}));w.calls.length=0;r=await w.message({...args,requestId:'v3'});assert.equal(r.ok,true);assert.equal(new TextDecoder().decode(r.bytes),'012345');assert.equal(w.calls.includes(url),true);
 file.bytes=16777217;w.reply('/offline/'+id+'.json',Response.json(m));await w.message({type:'DOWNLOAD_REMOVE',packId:id});w.calls.length=0;r=await w.message({...args,requestId:'v4'});assert.equal(r.ok,false);assert.equal(w.calls.includes(url),false);
});
test('custom download sizes own distinct caches and playback verifies the actual saved member',async()=>{
 const w=worker(),m=manifest('variants'),revision='a'.repeat(64),deliveryRevision='b'.repeat(64);Object.assign(m,{presentationRevision:revision,deliveryRevision});
 const file=m.files.find(f=>f.group==='audio'),make=(size,body)=>({...file,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex'),mime:'audio/ogg',deliveryURL:`https://transcode.klappy.dev/audio/preset=voice,q=${size==='small'?'low':'high'},f=opus/https://fia.test/audio.m4a`,sourceSha256:'c'.repeat(64),deliveryRevision,timing:{status:'not-applicable'}});
 const small=make('small','s'),large=make('large','LARGE');Object.assign(file,small,{defaultSize:'small',variants:{small,large}});w.manifest(m);w.reply(new URL(small.deliveryURL).pathname,new Response('s',{headers:{'Content-Type':'audio/ogg'}}));w.reply(new URL(large.deliveryURL).pathname,new Response('LARGE',{headers:{'Content-Type':'audio/ogg'}}));
 assert.equal((await w.message({type:'DOWNLOAD_START',selection:'audio',sizes:{audio:'small',video:'large'}})).ok,true);const first=(await w.message({type:'DOWNLOAD_STATUS'})).active;assert.equal(first.manifest.mediaSizes.audio,'small');assert.equal(first.manifest.mediaSizes.video,undefined);
 w.calls.length=0;const played=await w.message({type:'MEDIA_PLAY',packId:'fia-mark-authentic',revision,deliveryRevision,path:file.path,size:'large',requestId:'saved-small'});assert.equal(played.ok,true);assert.equal(played.file.sha256,small.sha256);assert.equal(new TextDecoder().decode(played.bytes),'s');assert(!w.calls.some(x=>x.startsWith('https://transcode.klappy.dev')));
 assert.equal((await w.message({type:'DOWNLOAD_START',selection:'audio',sizes:{audio:'large'}})).ok,true);const second=(await w.message({type:'DOWNLOAD_STATUS'})).active;assert.notEqual(first.cache,second.cache);assert.equal(second.files.find(f=>f.group==='audio').sha256,large.sha256);assert(w.stores.has(first.cache));
});
test('saved media metadata cannot substitute an unlisted delivery under the same revision',async()=>{
 const w=worker(),m=manifest('metadata'),revision='a'.repeat(64),deliveryRevision='b'.repeat(64);Object.assign(m,{presentationRevision:revision,deliveryRevision});const f=m.files.find(f=>f.group==='audio');Object.assign(f,{mime:'audio/ogg',deliveryURL:'https://transcode.klappy.dev/audio/preset=voice,q=medium,f=opus/https://fia.test/audio.m4a',sourceSha256:'c'.repeat(64),deliveryRevision,timing:{status:'not-applicable'}});w.manifest(m);w.reply(new URL(f.deliveryURL).pathname,new Response('recording',{headers:{'Content-Type':'audio/ogg'}}));await w.message({type:'DOWNLOAD_START',selection:'audio'});
 const meta=w.stores.get('fia-v3-download-metadata@1'),active=await meta.get('/active').json();active.files.find(x=>x.path===f.path).deliveryURL='https://transcode.klappy.dev/audio/unlisted';meta.set('/active',Response.json(active));
 const status=await w.message({type:'MEDIA_STATUS',revision});assert.equal(status.savedFiles.length,0);w.calls.length=0;const result=await w.message({type:'MEDIA_PLAY',revision,deliveryRevision,path:f.path,requestId:'metadata'});assert.equal(result.ok,true);assert.equal(result.file.deliveryURL,f.deliveryURL);assert(!w.calls.includes('https://transcode.klappy.dev/audio/unlisted'));
});

test('recorded guide range survives online and saved playback and rejects altered saved range',async()=>{
 const w=worker(),id='eng.MRK-1-1-13',revision='a'.repeat(64),deliveryRevision='b'.repeat(64),url='https://transcode.klappy.dev/audio/preset=voice,q=medium,f=opus/https://fia.test/original.mp3';
 const m={...manifest(),packId:id,presentationRevision:revision,deliveryRevision},f=m.files.find(f=>f.path==='/audio.m4a'),range={startSeconds:12.012,endSeconds:19.512};
 Object.assign(f,{bytes:3,sha256:createHash('sha256').update('abc').digest('hex'),mime:'audio/ogg',deliveryURL:url,sourceSha256:'c'.repeat(64),sourceBytes:100,logicalSourceSha256:'d'.repeat(64),logicalSourceBytes:9,recordingLedgerSha256:'e'.repeat(64),recordingLedgerEntryId:'U1',duration:100,playbackRange:range,deliveryRevision,timing:{status:'verified'}});
 w.reply('/offline/'+id+'.json',Response.json(m));w.reply(new URL(url).pathname,new Response('abc',{headers:{'Content-Type':'audio/ogg'}}));
 const args={type:'MEDIA_PLAY',packId:id,revision,deliveryRevision,path:f.path,requestId:'online'};
 const online=await w.message(args);assert.equal(online.ok,true,online.error);assert.deepEqual(JSON.parse(JSON.stringify(online.playbackRange)),range);
 assert.equal((await w.message({type:'DOWNLOAD_START',packId:id,selection:'audio'})).ok,true);
 w.calls.length=0;const saved=await w.message({...args,requestId:'saved'});assert.equal(saved.ok,true,saved.error);assert.deepEqual(JSON.parse(JSON.stringify(saved.playbackRange)),range);assert(!w.calls.includes(url));
 const metadata=w.stores.get('fia-v3-download-metadata@1');for(const [key,response] of metadata){if(key.includes('active')){const value=await response.clone().json();value.files.find(x=>x.path===f.path).playbackRange={startSeconds:0,endSeconds:100};metadata.set(key,Response.json(value));}}
 const status=await w.message({type:'MEDIA_STATUS',packId:id,revision});assert.equal(status.savedFiles.length,0);
});
test('Scripture output-clock alignment survives online and saved playback; altered saved words are rejected',async()=>{
 const w=worker(),id='eng.MRK-1-1-13',revision='a'.repeat(64),deliveryRevision='b'.repeat(64),url='https://transcode.klappy.dev/audio/preset=voice,q=medium,f=opus/https://fia.test/bsb.mp3';
 const m={...manifest(),packId:id,presentationRevision:revision,deliveryRevision},f=m.files.find(f=>f.path==='/audio.m4a'),range={startSeconds:4.4,endSeconds:6},audioSha=createHash('sha256').update('abc').digest('hex');
 const alignment={schemaVersion:2,id:'bsb-output-medium',clockDomain:'delivery-media-seconds',audioSha256:audioSha,duration:100,sourceSha256:'f'.repeat(64),verses:[{verse:1,text:'This',sourceId:'MRK.1.1',start:4.4,end:6,highlightMode:'word',words:[{from:0,to:4,start:4.4,end:6}]}]};
 Object.assign(f,{bytes:3,sha256:audioSha,mime:'audio/ogg',deliveryURL:url,sourceSha256:'c'.repeat(64),sourceBytes:100,logicalSourceSha256:'d'.repeat(64),logicalSourceBytes:9,scriptureLedgerSha256:'e'.repeat(64),scriptureLedgerEntryId:'bsb',scriptureAssetId:'BSB',scriptureAlignment:alignment,scriptureAlignmentSha256:createHash('sha256').update(JSON.stringify(alignment)).digest('hex'),duration:100,playbackRange:range,deliveryRevision,timing:{status:'verified'}});
 w.reply('/offline/'+id+'.json',Response.json(m));w.reply(new URL(url).pathname,new Response('abc',{headers:{'Content-Type':'audio/ogg'}}));const args={type:'MEDIA_PLAY',packId:id,revision,deliveryRevision,path:f.path,requestId:'online'};
 const online=await w.message(args);assert.equal(online.ok,true,online.error);assert.deepEqual(JSON.parse(JSON.stringify(online.scriptureAlignment)),alignment);assert.equal((await w.message({type:'DOWNLOAD_START',packId:id,selection:'audio'})).ok,true);w.calls.length=0;
 const saved=await w.message({...args,requestId:'saved'});assert.equal(saved.ok,true,saved.error);assert.deepEqual(JSON.parse(JSON.stringify(saved.scriptureAlignment)),alignment);assert(!w.calls.includes(url));
 const metadata=w.stores.get('fia-v3-download-metadata@1');for(const [key,response] of metadata){if(key.includes('active')){const value=await response.clone().json();value.files.find(x=>x.path===f.path).scriptureAlignment.verses[0].words[0].end=5;metadata.set(key,Response.json(value));}}
 assert.equal((await w.message({type:'MEDIA_STATUS',packId:id,revision})).savedFiles.length,0);
});

test('requested missing image quality is received, hashed and saved without a prepared variant',async()=>{
 const w=worker(),revision='d'.repeat(64),f={path:'/image.webp',group:'image',sha256:'a'.repeat(64),bytes:9,mime:'image/webp',sourceSha256:'b'.repeat(64),sourceBytes:50,deliveryRevision:revision,deliveryURL:'https://transcode.klappy.dev/image/q=medium,f=webp/https://source.test/image.jpg',defaultSize:'medium'};f.variants={medium:{...f}};
 w.manifest({schema:1,packId:'fia-mark-authentic',revision:'dynamic-image',deliveryRevision:revision,files:[f]});w.reply('/image/q=low,f=webp/https://source.test/image.jpg',new Response('new-image',{headers:{'Content-Type':'image/webp'}}));
 const result=await w.message({type:'DOWNLOAD_START',selection:'all',sizes:{image:'small'}});assert.equal(result.ok,true);assert.equal(result.saved,true);const status=await w.message({type:'DOWNLOAD_STATUS'});assert.equal(status.saved,true);assert.equal(status.active.files[0].sha256,createHash('sha256').update('new-image').digest('hex'));assert.equal(status.active.files[0].proxyReceipt.profile,'low');
});
test('new timed audio receives requested bytes but preserves previous active copy pending timing',async()=>{
 const w=worker();await w.message({type:'DOWNLOAD_START',selection:'core'});const revision='d'.repeat(64),f={path:'/chapter.opus',group:'audio',sha256:'a'.repeat(64),bytes:9,mime:'audio/ogg',sourceSha256:'b'.repeat(64),sourceBytes:50,deliveryRevision:revision,deliveryURL:'https://transcode.klappy.dev/audio/preset=voice,q=medium,f=opus/https://source.test/chapter.mp3',defaultSize:'medium',timing:{mapping:{scale:1,offsetSeconds:0}}};f.variants={medium:{...f}};
 w.manifest({schema:1,packId:'fia-mark-authentic',revision:'dynamic-audio',deliveryRevision:revision,files:[f]});w.reply('/audio/preset=voice,q=low,f=opus/https://source.test/chapter.mp3',new Response('new-audio',{headers:{'Content-Type':'audio/ogg'}}));
 const result=await w.message({type:'DOWNLOAD_START',selection:'audio',sizes:{audio:'small'}});assert.equal(result.ok,true);assert.equal(result.saved,false);assert.equal(result.timingPending,true);const status=await w.message({type:'DOWNLOAD_STATUS'});assert.equal(status.active.revision,'r1');assert.equal(status.pending.status,'timing-pending');assert.equal(status.pending.files[0].playbackRange,undefined);assert.equal(status.pending.files[0].sha256,createHash('sha256').update('new-audio').digest('hex'));
});

test('passage-only Scripture without legacy audio validates pins, reuses saved bytes and returns no alignment',async()=>{
 const w=worker(),id='eng.MRK-1-14-20',revision='a'.repeat(64),deliveryRevision='b'.repeat(64),url='https://transcode.klappy.dev/audio/preset=voice,q=medium,f=opus/https://fia.test/chapter.mp3';
 const m={...manifest(),packId:id,presentationRevision:revision,deliveryRevision},f=m.files.find(x=>x.group==='audio');
 Object.assign(f,{path:`/audio/scripture/${id}/BSB.opus`,bytes:3,sha256:createHash('sha256').update('abc').digest('hex'),mime:'audio/ogg',deliveryURL:url,deliveryRevision,sourceSha256:'c'.repeat(64),sourceBytes:99,duration:321,playbackRange:{startSeconds:96.8,endSeconds:144.375},scriptureAssetId:'BSB',scriptureLedgerEntryId:'p2',scriptureLedgerSha256:'d'.repeat(64),scripturePlaybackMode:'passage-only',scriptureHighlighting:'disabled',scriptureAlignment:null,scriptureRangeReviewSha256:'e'.repeat(64),scriptureCanonicalTextSha256:'f'.repeat(64),scriptureSourceEvidenceSha256:'1'.repeat(64),scriptureSourceRangeReviewSha256:'2'.repeat(64)});f.timing={status:'verified',sourceAudioSha256:f.sourceSha256,deliveryAudioSha256:f.sha256,mappingEvidenceSha256:'3'.repeat(64),mapping:{scale:1,offsetSeconds:0}};
 w.reply(`/offline/${id}.json`,Response.json(m));w.reply(new URL(url).pathname,new Response('abc',{headers:{'Content-Type':'audio/ogg'}}));const args={type:'MEDIA_PLAY',packId:id,revision,deliveryRevision,path:f.path,requestId:'range-only'};
 const online=await w.message(args);assert.equal(online.ok,true,online.error);assert.equal(online.scriptureAlignment,null);assert.equal(online.file.scriptureCanonicalTextSha256,f.scriptureCanonicalTextSha256);assert.equal(online.file.logicalSourceSha256,undefined);
 assert.equal((await w.message({type:'DOWNLOAD_START',packId:id,selection:'audio'})).ok,true);w.calls.length=0;const saved=await w.message({...args,requestId:'saved'});assert.equal(saved.ok,true,saved.error);assert(!w.calls.includes(url));assert.equal(saved.scriptureHighlighting,'disabled');
 const store=w.stores.get('fia-v3-download-metadata@1');for(const [k,r]of store){if(k.includes('active')){const a=await r.clone().json();a.files.find(x=>x.path===f.path).scriptureRangeReviewSha256='9'.repeat(64);store.set(k,Response.json(a));}}
 assert.equal((await w.message({type:'MEDIA_STATUS',packId:id,revision})).savedFiles.length,0);
 for(const change of [{scriptureCanonicalTextSha256:null},{scriptureAlignment:{}},{logicalSourceSha256:'4'.repeat(64)},{scriptureHighlighting:'word'},{path:'/audio/scripture/eng.MRK-2-1-12/BSB.opus'}]){const bad=structuredClone(m);Object.assign(bad.files.find(x=>x.group==='audio'),change);const isolated=worker();isolated.reply(`/offline/${id}.json`,Response.json(bad));assert.equal((await isolated.message(args)).ok,false);}
});
