import {test,expect} from '@playwright/test';import {readFileSync,writeFileSync} from 'node:fs';
const source=readFileSync(new URL('../apps/web/src/lib/media-delivery.js',import.meta.url),'utf8').replace(/export (?=(?:async )?function)/g,'');
test('16MiB fixture verifies once, transfers ownership and creates one video Blob snapshot',async({page},testInfo)=>{
 await page.route('https://fixture.test/',route=>route.fulfill({body:'<!doctype html><title>Private payload fixture</title>',contentType:'text/html'}));await page.goto('https://fixture.test/');
 const result=await page.evaluate(async source=>{
  const Native=Uint8Array,size=16777216,chunkSize=65536;let allocated=0,chunkBytes=0;
  // This observer counts explicit typed-array allocation in the actual reader, not browser RAM.
  const Tracking=class extends Native{constructor(...args){super(...args);if(typeof args[0]==='number')allocated+=this.byteLength;}};
  const reader=new Function('Uint8Array',source+';return readVerifiedMedia;')(Tracking);
  const expected=new Native(size);const sha=Array.from(new Native(await crypto.subtle.digest('SHA-256',expected)),x=>x.toString(16).padStart(2,'0')).join('');
  let sent=0;const stream=new ReadableStream({pull(c){if(sent===size){c.close();return;}const chunk=new Native(Math.min(chunkSize,size-sent));sent+=chunk.length;chunkBytes+=chunk.length;c.enqueue(chunk);}});
  const bytes=await reader(new Response(stream,{headers:{'Content-Type':'video/mp4'}}),{group:'video',bytes:size,sha256:sha,mime:'video/mp4'});
  const channel=new MessageChannel();const received=new Promise(resolve=>channel.port2.onmessage=e=>resolve(e.data));channel.port1.postMessage(bytes.buffer,[bytes.buffer]);const detached=bytes.byteLength===0;
  const transferred=await received,blob=new Blob([transferred],{type:'video/mp4'});channel.port1.close();channel.port2.close();
  return {chunkBytes,contiguousBytes:allocated,blobBytes:blob.size,detached,budget:chunkBytes+allocated+blob.size,scope:'Payload allocation accounting only; excludes browser network/decoder/GC and no decode claim.'};
 },source);
 expect(result).toMatchObject({chunkBytes:16777216,contiguousBytes:16777216,blobBytes:16777216,detached:true,budget:50331648});
 writeFileSync(testInfo.outputPath('payload-allocation.json'),JSON.stringify(result,null,2));
 await testInfo.attach('payload-allocation.json',{body:JSON.stringify(result,null,2),contentType:'application/json'});
});

test('changed MP4 plays through the bounded reader in Chromium and transfers its served identity',async({page})=>{
 const mp4=readFileSync(new URL('fixtures/video-playback.mp4',import.meta.url));
 await page.route('https://fixture.test/',route=>route.fulfill({body:'<!doctype html><title>Video playback fixture</title>',contentType:'text/html'}));await page.goto('https://fixture.test/');
 const result=await page.evaluate(async({source,data})=>{
  const read=new Function(source+';return readPlayableVideo;')(),bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
  const output=await read(new Response(bytes,{headers:{'Content-Type':'video/mp4'}}),{sha256:'a'.repeat(64),bytes:6,deliveryURL:'https://transcode.klappy.dev/video/source'});
  const channel=new MessageChannel(),received=new Promise(resolve=>channel.port2.onmessage=e=>resolve(e.data));channel.port1.postMessage(output.bytes.buffer,[output.bytes.buffer]);const detached=output.bytes.byteLength===0,body=await received;channel.port1.close();channel.port2.close();
  const video=document.createElement('video'),url=URL.createObjectURL(new Blob([body],{type:'video/mp4'}));video.muted=true;document.body.append(video);video.src=url;
  await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('decode failed'));});await video.play();
  const result={drift:output.drift,detached,bytes:body.byteLength,served:output.served.bytes,width:video.videoWidth,height:video.videoHeight,paused:video.paused};video.pause();video.remove();URL.revokeObjectURL(url);return result;
 },{source,data:mp4.toString('base64')});
 expect(result).toMatchObject({drift:true,detached:true,bytes:mp4.length,served:mp4.length,paused:false});expect(result.width).toBeGreaterThan(0);expect(result.height).toBeGreaterThan(0);
});
