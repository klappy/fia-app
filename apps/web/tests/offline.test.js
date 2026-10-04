import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
const bytes={'/index.html':'app','/audio.m4a':'recording','/video.mp4':'012345'};
const manifest=(revision='r1')=>({schema:1,packId:'fia-mark-authentic',revision,files:Object.entries(bytes).map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex'),group:path.endsWith('.m4a')?'audio':path.endsWith('.mp4')?'video':'core'}))});
function worker(){
 const handlers={},stores=new Map();let current=manifest(),calls=[],options=[],fail=null;const replies=new Map();
 const open=async name=>{if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {match:async key=>store.get(String(key))?.clone(),put:async(key,value)=>store.set(String(key),value.clone()),delete:async key=>store.delete(key),addAll:async()=>{}};};
 const context={self:{location:{origin:'https://fia.test'},addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>{}},skipWaiting:async()=>{}},caches:{open,keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name)},fetch:async (url,init)=>{const key=typeof url==='string'?url:url.url,path=new URL(key,'https://fia.test').pathname;calls.push(key);options.push(init);if(fail===url||fail===key||fail===path)throw new Error('Network interrupted');if(replies.has(path))return replies.get(path).clone();return url==='/offline-manifest.json'?Response.json(current):new Response(bytes[String(url)]||'live');},Response,Request,Headers,URL,Promise,console,crypto:webcrypto,AbortController,setTimeout,clearTimeout};
 vm.runInNewContext(readFileSync('public/sw.js','utf8').replace('__BUILD_ID__','test123'),context);
 return {stores,calls,options,reply:(path,response)=>replies.set(path,response),manifest:value=>current=value,fail:value=>fail=value,async fetch(request,client={}){let promise;handlers.fetch({request,...client,respondWith:p=>promise=p});return promise;},async message(data,onprogress,clientId){let task,result;handlers.message({data,source:clientId?{id:clientId}:null,ports:[{postMessage:r=>{if(r.progress)onprogress?.(r.progress);else result=r;}}],waitUntil:p=>task=p});await task;return result;}};
}
test('selected downloads verify hashes, report exact progress and do not fetch unselected video',async()=>{const w=worker();const progress=[];assert.equal((await w.message({type:'DOWNLOAD_START',selection:'audio'},p=>progress.push(p))).ok,true);assert.equal(w.calls.includes('/video.mp4'),false);assert.equal(progress.at(-1).received,12);const status=await w.message({type:'DOWNLOAD_STATUS'});assert.equal(status.saved,true);assert.equal(status.active.selection,'audio');assert.equal(status.choices.find(c=>c.id==='all').bytes,18);});
test('offline video supports byte ranges and rejects invalid ranges',async()=>{const w=worker();await w.message({type:'DOWNLOAD_START',selection:'all'});let r=await w.fetch(new Request('https://fia.test/video.mp4',{headers:{Range:'bytes=2-4'}}));assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),'bytes 2-4/6');assert.equal(await r.text(),'234');r=await w.fetch(new Request('https://fia.test/video.mp4',{headers:{Range:'bytes=9-'}}));assert.equal(r.status,416);r=await w.fetch(new Request('https://fia.test/video.mp4',{headers:{Range:'bytes=-2'}}));assert.equal(await r.text(),'45');});
test('interrupted download retains verified partial files and resumes without fetching them again',async()=>{const w=worker();w.fail('/audio.m4a');assert.equal((await w.message({type:'DOWNLOAD_START',selection:'all'})).ok,false);let status=await w.message({type:'DOWNLOAD_STATUS'});assert.equal(status.saved,false);assert.equal(status.pending.received,3);w.fail(null);w.calls.length=0;assert.equal((await w.message({type:'DOWNLOAD_START',selection:'all'})).ok,true);assert.equal(w.calls.includes('/index.html'),false);assert.equal((await w.message({type:'DOWNLOAD_STATUS'})).saved,true);});
test('failed update preserves last good copy; successful retry atomically activates new revision',async()=>{const w=worker();await w.message({type:'DOWNLOAD_START',selection:'all'});w.manifest(manifest('r2'));w.fail('/video.mp4');assert.equal((await w.message({type:'DOWNLOAD_START',selection:'all'})).ok,false);let s=await w.message({type:'DOWNLOAD_STATUS'});assert.equal(s.saved,true);assert.equal(s.active.revision,'r1');assert.equal(s.updateAvailable,true);w.fail(null);await w.message({type:'DOWNLOAD_START',selection:'all'});s=await w.message({type:'DOWNLOAD_STATUS'});assert.equal(s.active.revision,'r2');assert.equal(s.pending,null);assert.equal(s.updateAvailable,false);});
test('hash mismatch cannot activate and eviction cannot be reported as saved',async()=>{const w=worker();const bad=manifest();bad.files[1].sha256='a'.repeat(64);w.manifest(bad);assert.equal((await w.message({type:'DOWNLOAD_START',selection:'all'})).ok,false);assert.equal((await w.message({type:'DOWNLOAD_STATUS'})).saved,false);w.manifest(manifest());await w.message({type:'DOWNLOAD_START',selection:'all'});const s=await w.message({type:'DOWNLOAD_STATUS'});w.stores.get(s.active.cache).delete('/audio.m4a');assert.equal((await w.message({type:'DOWNLOAD_STATUS'})).saved,false);});
test('remove clears active and interrupted files',async()=>{const w=worker();await w.message({type:'DOWNLOAD_START',selection:'core'});w.manifest(manifest('r2'));w.fail('/video.mp4');await w.message({type:'DOWNLOAD_START',selection:'all'});await w.message({type:'DOWNLOAD_REMOVE'});const s=await w.message({type:'DOWNLOAD_STATUS'});assert.equal(s.saved,false);assert.equal(s.pending,null);assert.equal([...w.stores.keys()].some(k=>k.startsWith('fia-v3-pack-')),false);});
test('eviction during an update cannot activate or discard the prior saved revision',async()=>{const w=worker();await w.message({type:'DOWNLOAD_START',selection:'all'});w.manifest(manifest('r2'));const result=await w.message({type:'DOWNLOAD_START',selection:'all'},p=>{if(p.count===2)w.stores.get('fia-v3-pack-r2-all').delete('/index.html');});assert.equal(result.ok,false);assert.equal((await w.message({type:'DOWNLOAD_STATUS'})).active.revision,'r1');assert.equal((await w.message({type:'DOWNLOAD_STATUS'})).saved,true);});
test('navigation stays on the installed app instead of mixing network HTML with old media',async()=>{const w=worker();await w.message({type:'DOWNLOAD_START',selection:'all'});const response=await w.fetch({url:'https://fia.test/',method:'GET',mode:'navigate'});assert.equal(await response.text(),'app');assert.equal(w.calls.includes('https://fia.test/'),false);});

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
  const id='page-'+i,response=await w.fetch({url:'https://fia.test'+path,method:'GET',mode:'navigate'},{resultingClientId:id});
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
