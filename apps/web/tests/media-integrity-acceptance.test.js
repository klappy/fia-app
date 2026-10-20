// v3 media integrity — acceptance proofs (cookbook work/active/2026-10-03-fia-v3-media-integrity).
// Each test names the Acceptance clause it proves. Offline only: no proxy request, no paid encoding.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readVerifiedMedia,readPlayableVideo,validateDelivery} from '../src/lib/media-delivery.js';
import {verifyVideoReplacement} from '../../../scripts/video-publication.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const original=Buffer.from('ID3 original mp3 source bytes'),derivative=Buffer.from('OggS derivative opus bytes');
const sourceUrl='https://fiaguide.app/audio/a.mp3';
const audioUrl=(q='medium',f='opus',preset='voice')=>`https://transcode.klappy.dev/audio/preset=${preset},q=${q},f=${f}/${sourceUrl}`;
const identity={packId:'eng.MRK-1-1-13',presentationRevision:'a'.repeat(64)};
function sidecar({status='transformed',bytes=derivative,mime='audio/ogg',timing={status:'not-applicable'}}={}){
 return {schema:1,...identity,recipeRevision:'accepted',entries:[{path:'/audio/a.mp3',
  source:{url:sourceUrl,sha256:sha(original),bytes:original.length},
  delivery:{url:audioUrl(),sha256:sha(bytes),bytes:bytes.length,mime,kind:'audio',format:'opus',preset:'voice',q:'medium',status},
  timing}]};
}
const descriptor=s=>({...s.entries[0].delivery});
const response=(body,headers={},init={})=>new Response(body,{status:200,...init,headers});

// Acceptance: "Hash/size/MIME actual responses" — descriptor separates derivative, passthrough, unavailable.
test('descriptor: verified derivative and original passthrough are distinct, closed states', ()=>{
 assert.ok(validateDelivery(sidecar(),identity),'transformed derivative with its own hash/size');
 const pass=sidecar({status:'passthrough',bytes:original,mime:'audio/ogg'});
 assert.ok(validateDelivery(pass,identity),'passthrough declares source identity');
 const changed=sidecar({status:'passthrough',bytes:derivative});
 assert.throws(()=>validateDelivery(changed,identity),/Pass-through bytes changed/);
 for(const status of ['unavailable','cached','verified',null])assert.throws(()=>validateDelivery(sidecar({status}),identity),'unknown status '+status);
 const missing=sidecar();delete missing.entries[0].delivery.status;assert.throws(()=>validateDelivery(missing,identity),'missing status');
});

test('descriptor: a "transformed" claim whose hash and size equal the original is a false derivative identity', ()=>{
 assert.throws(()=>validateDelivery(sidecar({status:'transformed',bytes:original}),identity),/passthrough|pass-through/i);
});

test('actual response: verified derivative accepted only on exact MIME, Content-Length, byte count and SHA-256', async()=>{
 const file=descriptor(sidecar());
 assert.deepEqual(Buffer.from(await readVerifiedMedia(response(derivative,{'Content-Type':'audio/ogg; codecs=opus','Content-Length':String(derivative.length)}),file)),derivative);
 await assert.rejects(readVerifiedMedia(response(derivative,{'Content-Type':'audio/mpeg'}),file),/format/);
 await assert.rejects(readVerifiedMedia(response(derivative,{'Content-Type':'audio/ogg','Content-Length':String(derivative.length+1)}),file),/size/);
 const tampered=Buffer.from(derivative);tampered[0]^=1;
 await assert.rejects(readVerifiedMedia(response(tampered,{'Content-Type':'audio/ogg'}),file),/verified/);
 await assert.rejects(readVerifiedMedia(response(derivative.subarray(1),{'Content-Type':'audio/ogg'}),file),/size/);
});

// Acceptance: "detect passthrough headers" — the proxy returning the original instead of the derivative.
test('passthrough response: original bytes under the derivative URL are detected from headers or bytes, never accepted', async()=>{
 const file=descriptor(sidecar());
 // Proxy passthrough keeps the source's own Content-Type and Content-Length headers.
 await assert.rejects(readVerifiedMedia(response(original,{'Content-Type':'audio/mpeg','Content-Length':String(original.length)}),file),/format/);
 // Even if the proxy relabels the MIME, the source length header is caught before the body is read.
 let pulled=false;const body=new ReadableStream({pull(c){pulled=true;c.enqueue(new Uint8Array(original));c.close();}},{highWaterMark:0});
 await assert.rejects(readVerifiedMedia(response(body,{'Content-Type':'audio/ogg','Content-Length':String(original.length)}),file),/size/);
 assert.equal(pulled,false,'header mismatch rejects before reading the body');
 // No length header and same-length original bytes: the hash still separates it.
 const sameLength=Buffer.alloc(derivative.length,1);
 await assert.rejects(readVerifiedMedia(response(sameLength,{'Content-Type':'audio/ogg'}),file),/verified/);
 // A declared passthrough accepts exactly the original source bytes.
 const pass=descriptor(sidecar({status:'passthrough',bytes:original}));
 assert.deepEqual(Buffer.from(await readVerifiedMedia(response(original,{'Content-Type':'audio/ogg'}),pass)),original);
});

test('unavailable: failed, opaque or bodiless responses are unavailable, never a degraded success', async()=>{
 const file=descriptor(sidecar());
 for(const r of [new Response('missing',{status:404,headers:{'Content-Type':'audio/ogg'}}),new Response('err',{status:502,headers:{'Content-Type':'audio/ogg'}}),null,undefined])
  await assert.rejects(readVerifiedMedia(r,file),/could not be received/);
 const opaque=response(derivative,{'Content-Type':'audio/ogg'});Object.defineProperty(opaque,'type',{value:'opaque'});
 await assert.rejects(readVerifiedMedia(opaque,file),/could not be received/);
 await assert.rejects(readVerifiedMedia(response(null,{'Content-Type':'audio/ogg'}),file),/body is missing|size/);
});

// Acceptance: "changed source/recipe/encoder cannot reuse false identity".
test('changed source: verified timing bound to the old source or derivative hash is rejected; new source bytes fail the old identity', async()=>{
 const timing={status:'verified',sourceAudioSha256:sha(original),deliveryAudioSha256:sha(derivative),method:'measured',evidence:'e'};
 assert.ok(validateDelivery(sidecar({timing}),identity));
 const changedSource=sidecar({timing:{...timing}});const s=changedSource.entries[0].source;const next=Buffer.from('re-recorded source');s.sha256=sha(next);s.bytes=next.length;
 assert.throws(()=>validateDelivery(changedSource,identity),/timing identity/);
 const changedOutput=sidecar({timing:{...timing},bytes:Buffer.from('new derivative')});
 assert.throws(()=>validateDelivery(changedOutput,identity),/timing identity/);
 // Same long-lived URL, upstream source replaced: proxy output changes, the pinned derivative hash rejects it.
 await assert.rejects(readVerifiedMedia(response(Buffer.from('OggS output of a changed src'),{'Content-Type':'audio/ogg'}),descriptor(sidecar())),/verified|size/);
});

test('changed recipe: options must match the URL, and a recipe change behind the same URL fails the pinned hash', async()=>{
 for(const alter of [d=>d.q='low',d=>d.url=audioUrl('high'),d=>d.preset='music',d=>{d.format='mp3';d.url=audioUrl('medium','mp3');},d=>d.url=d.url.replace('transcode.klappy.dev','transcode.example')]){
  const s=sidecar();alter(s.entries[0].delivery);assert.throws(()=>validateDelivery(s,identity));
 }
 const reEncoded=Buffer.from('OggS same url, new recipe');
 await assert.rejects(readVerifiedMedia(response(reEncoded,{'Content-Type':'audio/ogg'}),descriptor(sidecar())),/verified|size/);
});

function videoFixture(){
 const evidence=new Map();const put=x=>{const b=Buffer.from(JSON.stringify(x)),h=sha(b);evidence.set(h,b);return h;};
 const id='a13',input=Buffer.from('source video a13'),old=Buffer.from('bundled video a13'),output=Buffer.from('0000ftypisom qualified a13'),path='/assets/a13.mp4',url='https://publisher.example/a13.mp4',revision='a'.repeat(64);
 const metadata={repository:'publisher/repo',revision:'b'.repeat(40),path:'eng/a13.json',contentId:id,assetVersion:'1.0.4',collectionVersion:'1.1.2'};
 metadata.sha256=put([{content_id:id,version:'1.0.4',content:`<a href='${url}'>video</a>`}]);
 const rights={metadataPath:'metadata.json',holder:'Publisher',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/'};rights.metadataSha256=put({resource_metadata:{version:'1.1.2',license_info:{copyright:{holder:{name:rights.holder}},licenses:[{eng:{url:rights.licenseUrl}}]}}});
 const published={url,sha256:sha(input),bytes:input.length,width:1280,height:720,duration:12};
 const review={recipeRevision:'recipe',evidenceUrl:'https://review.example/source'};review.evidenceSha256=put({status:'accepted',assetId:id,published,metadataSha256:metadata.sha256,rightsSha256:rights.metadataSha256});
 const row={id:'mapping-a13',packId:identity.packId,presentationRevision:revision,assetId:id,path,bundled:{sha256:sha(old),bytes:old.length},published,metadata,rights,review};
 const delivery={kind:'video',mime:'video/mp4',format:'mp4',preset:'fia',q:'medium',status:'transformed',duration:12,width:960,height:540,videoCodec:'h264',audioCodec:'aac',encoderRevision:'e'.repeat(64),recipeRevision:'recipe',serverContractSha256:'c'.repeat(64),cacheKey:'video-v1/'+'f'.repeat(64)+'.mp4',url:`https://transcode.klappy.dev/video/preset=fia,q=medium,f=mp4/${url}`,sha256:sha(output),bytes:output.length};
 delivery.qualification={evidenceUrl:'https://review.example/output',evidenceSha256:put({status:'accepted',sourceSha256:published.sha256,sourceBytes:published.bytes,sourceUrl:url,delivery:{...delivery},allocationProof:{status:'accepted',maxApplicationPayloadBytes:output.length*3}})};
 const entry={path,logicalSource:{assetId:id,sha256:sha(old),bytes:old.length,ledgerEntryId:row.id},source:{url,sha256:published.sha256,bytes:input.length,provenance:{metadata,rights,review}},delivery,timing:{status:'not-applicable'}};
 return {entry,output,args:{entry,ledger:{schema:1,entries:[row]},pack:{assets:{[id]:{id,kind:'video',src:path}}},descriptor:{id:identity.packId,revision},file:{path,sha256:sha(old),bytes:old.length},readEvidence:h=>evidence.get(h)}};
}

test('changed encoder/recipe/source (video): qualification evidence pins every identity field; a changed one cannot reuse it', ()=>{
 assert.ok(verifyVideoReplacement(videoFixture().args));
 for(const alter of [d=>d.encoderRevision='9'.repeat(64),d=>d.recipeRevision='recipe-2',d=>d.serverContractSha256='9'.repeat(64),d=>d.cacheKey='video-v1/'+'9'.repeat(64)+'.mp4',d=>d.sha256='9'.repeat(64),d=>d.videoCodec='hevc']){
  const f=videoFixture();alter(f.entry.delivery);assert.throws(()=>verifyVideoReplacement(f.args),/qualification|Unqualified/);
 }
 const f=videoFixture();f.entry.source.sha256='9'.repeat(64);assert.throws(()=>verifyVideoReplacement(f.args));
});

test('changed encoder (video bytes): strict download rejects; playback reports served identity as drift, never the declared one', async()=>{
 const f=videoFixture(),file={group:'video',...f.entry.delivery,deliveryURL:f.entry.delivery.url};
 const reEncoded=Buffer.from('0000ftypisom new encoder output');
 await assert.rejects(readVerifiedMedia(response(reEncoded,{'Content-Type':'video/mp4'}),file),/verified|size/);
 const played=await readPlayableVideo(response(reEncoded,{'Content-Type':'video/mp4'}),file);
 assert.equal(played.drift,true);
 assert.deepEqual(played.served,{sha256:sha(reEncoded),bytes:reEncoded.length});
 assert.notEqual(played.served.sha256,file.sha256);
 assert.equal((await readPlayableVideo(response(f.output,{'Content-Type':'video/mp4'}),file)).drift,false);
});

// Acceptance: "mark untested video and unavailable iPhone evidence explicitly".
test('range/resume and codec playback on a real video target', {skip:'UNTESTED VIDEO: no device run in this slice; byte-range is covered only by the service-worker fixture in offline.test.js'},()=>{});
test('iPhone Safari playback/codec evidence', {skip:'UNAVAILABLE iPHONE EVIDENCE: no iPhone or iOS Safari target available to this run'},()=>{});
