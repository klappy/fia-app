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
