import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {oggOpusToWebm,playableAudio,downloadedWebm} from '../../apps/web/src/lib/opus-webm.js';
// Safari estimates the timeline of Opus in Ogg from file size and bit rate (WebKit 293310), so its currentTime drifts
// from the audio by an amount that grows with position. The same packets in WebM keep the timeline. This test reads
// the WebM back with its own parser and requires every packet to be byte-identical and on its exact time.
const ogg=new Uint8Array(readFileSync(new URL('./fixtures/guide-clip-10s.ogg',import.meta.url)));
function oggPackets(b){const v=new DataView(b.buffer,b.byteOffset,b.byteLength);const out=[];let part=[],o=0,last=0n;while(o<b.length){const n=b[o+26];last=v.getBigInt64(o+6,true);let at=o+27+n;for(let i=0;i<n;i++){const l=b[o+27+i];part.push(b.slice(at,at+l));at+=l;if(l<255){out.push(Buffer.concat(part));part=[];}}o=at;}return {packets:out,last:Number(last)};}
const vint=(b,o,keep)=>{let l=1;while(!(b[o]&(0x80>>(l-1))))l++;let v=keep?b[o]:b[o]&(0xff>>l);for(let i=1;i<l;i++)v=v*256+b[o+i];return [v,l];};
function walk(b,o,end,visit){while(o<end){const [id,il]=vint(b,o,true);const [sz,sl]=vint(b,o+il);const body=o+il+sl;visit(id,body,sz);o=body+sz;}}
function readWebm(b){const r={blocks:[],clusters:[],cues:[],info:{},track:{}};
 walk(b,0,b.length,(id,o,sz)=>{if(id!==0x18538067)return;walk(b,o,o+sz,(id,o,sz)=>{
  if(id===0x1549a966)walk(b,o,o+sz,(id,o,sz)=>{if(id===0x2ad7b1)r.info.scale=Number(Buffer.from(b.slice(o,o+sz)).readUIntBE(0,sz));if(id===0x4489)r.info.duration=Buffer.from(b.slice(o,o+8)).readDoubleBE(0);});
  if(id===0x1654ae6b)walk(b,o,o+sz,(id,o,sz)=>{if(id===0xae)walk(b,o,o+sz,(id,o,sz)=>{if(id===0x86)r.track.codec=Buffer.from(b.slice(o,o+sz)).toString();if(id===0x56aa)r.track.delay=Buffer.from(b.slice(o,o+sz)).readUIntBE(0,sz);if(id===0x63a2)r.track.head=b.slice(o,o+sz);});});
  if(id===0x1f43b675){let start=0;r.clusters.push(o-4-1);walk(b,o,o+sz,(id,o2,s2)=>{if(id===0xe7)start=Buffer.from(b.slice(o2,o2+s2)).readUIntBE(0,s2);if(id===0xa3){const rel=(b[o2+1]<<8|b[o2+2])<<16>>16;r.blocks.push({ms:start+rel,data:b.slice(o2+4,o2+s2)});}});}
  if(id===0x1c53bb6b)walk(b,o,o+sz,(id,o,sz)=>{if(id===0xbb)r.cues.push(sz);});
 });});return r;}
const samples=p=>{const c=p[0]>>3,k=p[0]&3,ms=c<12?[10,20,40,60][c%4]:c<16?[10,20][c%2]:[2.5,5,10,20][c%4];return (k===0?1:k<3?2:p[1]&63)*ms*48;};
test('Ogg Opus becomes WebM with every packet unchanged and on its exact time',()=>{
 const {packets,last}=oggPackets(ogg);const audio=packets.slice(2);
 const w=readWebm(oggOpusToWebm(ogg));
 assert.equal(w.track.codec,'A_OPUS');assert.equal(w.info.scale,1000000);
 assert.equal(w.blocks.length,audio.length);
 const preSkip=packets[0][10]|packets[0][11]<<8;
 assert.equal(w.track.delay,Math.round(preSkip*1e9/48000));assert.deepEqual(Buffer.from(w.track.head),Buffer.from(packets[0]));
 let n=0,worst=0;
 audio.forEach((p,i)=>{assert.deepEqual(Buffer.from(w.blocks[i].data),Buffer.from(p),`packet ${i} changed`);worst=Math.max(worst,Math.abs(w.blocks[i].ms-n/48));n+=samples(p);});
 // No accumulation: the last packet is as close to its exact time as the first.
 assert.ok(worst<=0.5+1e-9,`a packet is ${worst} ms off`);
 assert.ok(Math.abs(w.info.duration-(last-preSkip)/48)<1e-6);
 assert.ok(w.cues.length>=2,'seekable: cue points');
});
test('only Ogg Opus is converted, and anything it cannot read is returned unchanged',()=>{
 const can=()=>'maybe';
 const out=playableAudio(ogg,'audio/ogg',{canPlay:can});assert.equal(out.mime,'audio/webm');assert.notEqual(out.bytes,ogg);
 const mp3=new Uint8Array([0xff,0xfb,1,2,3]);assert.equal(playableAudio(mp3,'audio/mpeg',{canPlay:can}).bytes,mp3);
 assert.equal(playableAudio(ogg,'audio/ogg',{canPlay:()=>''}).bytes,ogg);
 const cut=ogg.slice(0,ogg.length-5);assert.equal(playableAudio(cut,'audio/ogg',{canPlay:can}).bytes,cut);
 const vorbis=ogg.slice();vorbis.set(new TextEncoder().encode('vorbis  '),ogg.indexOf(0x4f,60)); // not an OpusHead
 assert.equal(playableAudio(vorbis,'audio/ogg',{canPlay:can}).mime,'audio/ogg');
});
test('checking for WebM support never constructs an Audio element (the verified-player hooks track those)',()=>{
 const NativeAudio=globalThis.Audio,doc=globalThis.document;let built=0,probed=[];
 globalThis.Audio=class{constructor(){built++;}};
 globalThis.document={createElement:tag=>({canPlayType:type=>{probed.push([tag,type]);return 'maybe';}})};
 try{const out=playableAudio(ogg,'audio/ogg');assert.equal(out.mime,'audio/webm');}finally{globalThis.Audio=NativeAudio;if(doc===undefined)delete globalThis.document;else globalThis.document=doc;}
 assert.equal(built,0);assert.deepEqual(probed,[['audio','audio/webm; codecs=opus']]);
});
test('a verified saved Ogg Opus clip plays as the same remux, and anything unverified plays by its saved path',async()=>{
 const can=()=>'maybe',sha=createHash('sha256').update(ogg).digest('hex');
 const descriptor={path:'/audio/source/x.mp3',mime:'audio/ogg',bytes:ogg.length,sha256:sha,playbackRange:{startSeconds:1,endSeconds:2}};
 const serve=(bytes,ok=true)=>async()=>({ok,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
 const got=await downloadedWebm(descriptor.path,descriptor,{fetchImpl:serve(ogg),canPlay:can});
 assert.equal(got.mime,'audio/webm');assert.deepEqual(Buffer.from(got.bytes),Buffer.from(oggOpusToWebm(ogg)));
 const other=ogg.slice();other[other.length-1]^=1;
 assert.equal(await downloadedWebm(descriptor.path,descriptor,{fetchImpl:serve(other),canPlay:can}),null,'same length, other bytes');
 assert.equal(await downloadedWebm(descriptor.path,descriptor,{fetchImpl:serve(ogg.slice(0,-3)),canPlay:can}),null,'other length');
 assert.equal(await downloadedWebm(descriptor.path,descriptor,{fetchImpl:serve(ogg,false),canPlay:can}),null,'refused');
 assert.equal(await downloadedWebm(descriptor.path,descriptor,{fetchImpl:async()=>{throw Error('offline');},canPlay:can}),null,'rejected');
 assert.equal(await downloadedWebm(descriptor.path,descriptor,{fetchImpl:serve(ogg),canPlay:()=>''}),null,'browser cannot play WebM');
 assert.equal(await downloadedWebm(descriptor.path,{...descriptor,mime:'audio/mpeg'},{fetchImpl:serve(ogg),canPlay:can}),null,'not Ogg');
 assert.equal(await downloadedWebm(descriptor.path,{...descriptor,playbackRange:undefined},{fetchImpl:serve(ogg),canPlay:can}),null,'whole-file clip is not ranged');
});
