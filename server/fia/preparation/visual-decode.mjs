import {createInflate,inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import decodeJpeg from 'jpeg-js/lib/decoder.js';
// Full decode proof for visual-original (F6, T5 YES with conditions at cookbook d922aa5). It runs on read-back bytes only and
// returns evidence, never pixels: dimensions and a SHA256 of the decoded samples. Every refusal is a VisualDecodeRefusal whose
// subReason is a recipe sub-reason; header inspection alone never returns a result.
export const PNG_DECODER=Object.freeze({name:'fia-png-row-stream',version:'3',inflate:'node:zlib',pixels:'unfiltered-scanlines'});
// Pinned exactly in package.json; sha256 of node_modules/jpeg-js/lib/decoder.js, the only file bundled (tests check it).
export const JPEG_DECODER=Object.freeze({name:'jpeg-js',version:'0.4.4',entry:'jpeg-js/lib/decoder.js',sha256:'a3f175fd6f62d142aad94d3bd90f3a30be4e076baf9b6a6fa31c8e84d9d4aa9f',pixels:'rgb8'});
export class VisualDecodeRefusal extends Error{constructor(subReason,{final=true}={}){super(subReason);this.subReason=subReason;this.final=final;}}
const refuse=(r,o)=>{throw new VisualDecodeRefusal(r,o);};
// The supported subset as explicit allowlists (named in the recipe). Anything outside them is a typed refusal:
// png-chunk-unsupported, jpeg-marker-unsupported or jpeg-format-unsupported. Ancillary entries are only those the first-proof
// originals carry (c4: pHYs, zTXt; a1400: none), each validated for position, count, length and content.
const f=Object.freeze;
export const PNG_ALLOWLIST=f({critical:f(['IHDR','PLTE','IDAT','IEND']),ancillary:f({pHYs:'once, before the first IDAT, length 9, pixels per unit at most 2^31-1, unit 0 or 1',zTXt:'any count between IHDR and IEND; keyword 1-79 Latin-1 bytes with no leading, trailing or double space; compression method 0; exactly one complete zlib stream using every byte; text within 65536 bytes and without NUL'})});
export const JPEG_ALLOWLIST=f({markers:f(['SOI','DQT','DHT','SOF0','SOF1','SOF2','SOS','EOI']),dqt:'before the first scan; Pq 0 (8-bit), Tq 0-3, 64 entries of 1-255 each, exact length',dht:'Tc 0-1, Th 0-1 for SOF0 and 0-3 otherwise (re-checked at SOF), a valid prefix code (no over-subscription, no all-ones code), distinct symbols, DC 0-11, AC SSSS 1-10 or EOB/ZRL (EOBn only for SOF2), exact length; redefinition applies in stream order',sof:'one frame; 8-bit, 1 or 3 components, distinct ids, H and V 1-4, Tq 0-3 defined before the first scan',sos:'Ns 1-4 in frame order, Ls 6+2Ns, Td and Ta 0-3 (0-1 for SOF0), every used table defined; sequential: Ss 0, Se 63, Ah Al 0, each component in exactly one scan; progressive: DC Ss=Se=0, AC Ns 1 with 1<=Ss<=Se<=63, successive approximation per component and band; at most 10 blocks per MCU; no restart markers (no DRI)'});
const PNG_SIG=[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];
export function sniffRaster(bytes){
 if(bytes.length>=8&&PNG_SIG.every((v,i)=>bytes[i]===v))return 'image/png';
 if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
 return null;
}
const CRC=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;CRC[n]=c>>>0;}
function crc32(bytes,start,end){let c=0xffffffff;for(let i=start;i<end;i++)c=CRC[(c^bytes[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
const u32=(b,i)=>((b[i]<<24)>>>0)+(b[i+1]<<16)+(b[i+2]<<8)+b[i+3];
const u16=(b,i)=>(b[i]<<8)|b[i+1];
// Supported subset: 8-bit samples, non-interlaced, every standard colour type. Channels per colour type.
const PNG_CHANNELS=new Map([[0,1],[2,3],[3,1],[4,2],[6,4]]);
function pngStructure(bytes,limits,clock){
 let pos=8,ihdr=null,plte=0,idat=[],idatDone=false,iend=false,first=true,chunks=0,phys=false;
 while(pos<bytes.length){
  // Bounded parse: the recipe caps the chunk count (so no PNG holds one view per tiny chunk), and the deadline is checked as it goes.
  if(++chunks>limits.maxPngChunks)refuse('png-chunk-cap');if(!(chunks&1023)&&clock()>limits.decodeMs)refuse('decode-deadline',{final:false});
  if(pos+12>bytes.length)refuse('png-truncated-chunk');
  const length=u32(bytes,pos);if(length>0x7fffffff||pos+12+length>bytes.length)refuse('png-truncated-chunk');
  const type=String.fromCharCode(bytes[pos+4],bytes[pos+5],bytes[pos+6],bytes[pos+7]);if(!/^[A-Za-z]{4}$/.test(type))refuse('png-chunk-invalid');
  if(crc32(bytes,pos+4,pos+8+length)!==u32(bytes,pos+8+length))refuse('png-crc-mismatch');
  const data=bytes.subarray(pos+8,pos+8+length);pos+=12+length;
  if(first!==(type==='IHDR'))refuse('png-chunk-order');first=false;
  if(type==='IHDR'){
   if(length!==13)refuse('png-chunk-invalid');
   const width=u32(data,0),height=u32(data,4),depth=data[8],color=data[9],interlace=data[12];
   if(!width||!height||width>0x7fffffff||height>0x7fffffff||data[10]!==0||data[11]!==0||interlace>1)refuse('png-header-invalid');
   if(interlace===1)refuse('decode-not-streamable');
   if(depth!==8||!PNG_CHANNELS.has(color))refuse('png-format-unsupported');
   ihdr={width,height,depth,color,channels:PNG_CHANNELS.get(color)};
   if(width>limits.maxDimension||height>limits.maxDimension)refuse('dimension-cap');if(width*height>limits.maxPixels)refuse('pixel-cap');
  }else if(type==='PLTE'){if(plte||ihdr.color===0||ihdr.color===4)refuse('png-plte-invalid');if(idat.length||!length||length%3||length>768)refuse('png-chunk-invalid');plte=length/3;}
  else if(type==='IDAT'){if(idatDone)refuse('png-chunk-order');idat.push(data);}
  else if(type==='IEND'){if(length)refuse('png-chunk-invalid');iend=true;if(pos!==bytes.length)refuse('png-trailing-data');break;}
  else if(type==='pHYs'){if(phys||idat.length||length!==9||data[8]>1||u32(data,0)>0x7fffffff||u32(data,4)>0x7fffffff)refuse('png-chunk-invalid');phys=true;}
  else if(type==='zTXt'){
   const k=data.indexOf(0);if(k<1||k>79||k+2>length||data[k+1]!==0)refuse('png-chunk-invalid');
   for(let i=0;i<k;i++){const c=data[i];if(!(c>=32&&c<=126||c>=161)||c===32&&(i===0||i===k-1||data[i-1]===32))refuse('png-chunk-invalid');}
   // Exactly one complete zlib stream consuming every byte, text within 64 KiB and without NUL.
   const z=data.subarray(k+2);let out;try{out=inflateSync(z,{info:true,maxOutputLength:65536});}catch{refuse('png-chunk-invalid');}
   if(out.engine.bytesWritten!==z.length||out.buffer.includes(0))refuse('png-chunk-invalid');
  }
  else refuse('png-chunk-unsupported');
  if(type!=='IDAT'&&idat.length)idatDone=true;
 }
 if(!iend)refuse('png-missing-iend');
 if(!idat.length)refuse('png-truncated-idat');
 if(ihdr.color===3&&!plte)refuse('png-chunk-invalid');
 return {...ihdr,palette:plte,idat};
}
function unfilter(filter,cur,prev,bpp){
 const n=cur.length;
 if(filter===0)return;
 if(filter===1){for(let i=bpp;i<n;i++)cur[i]+=cur[i-bpp];return;}
 if(filter===2){for(let i=0;i<n;i++)cur[i]+=prev[i];return;}
 if(filter===3){for(let i=0;i<n;i++)cur[i]+=((i>=bpp?cur[i-bpp]:0)+prev[i])>>1;return;}
 if(filter===4){for(let i=0;i<n;i++){const a=i>=bpp?cur[i-bpp]:0,b=prev[i],c=i>=bpp?prev[i-bpp]:0,p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);cur[i]+=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}return;}
 refuse('png-filter-invalid');
}
// Row-streaming: the zlib stream is inflated incrementally and only two rows are ever held; the pixels are hashed row by row.
async function decodePng(bytes,limits,clock){
 const s=pngStructure(bytes,limits,clock),rowBytes=s.width*s.channels,hash=createHash('sha256');
 let prev=new Uint8Array(rowBytes),cur=new Uint8Array(rowBytes),filter=-1,fill=0,rows=0,failure=null;
 const inflate=createInflate({chunkSize:65536});
 const done=new Promise((resolve,reject)=>{
  inflate.on('data',chunk=>{
   if(failure)return;
   try{
    for(let i=0;i<chunk.length;){
     if(rows>=s.height)refuse('png-trailing-data');
     if(filter<0){filter=chunk[i++];continue;}
     const take=Math.min(rowBytes-fill,chunk.length-i);cur.set(chunk.subarray(i,i+take),fill);fill+=take;i+=take;
     if(fill===rowBytes){unfilter(filter,cur,prev,s.channels);if(s.color===3)for(let x=0;x<rowBytes;x++)if(cur[x]>=s.palette)refuse('png-palette-index');hash.update(cur);[prev,cur]=[cur,prev];filter=-1;fill=0;rows++;}
    }
    if(clock()>limits.decodeMs)refuse('decode-deadline',{final:false});
   }catch(error){failure=error;inflate.destroy();reject(error);}
  });
  // `failure` holds the typed refusal itself, so every exit path (including a writer woken from 'drain') throws the same refusal.
  inflate.on('error',error=>{if(!failure){failure=new VisualDecodeRefusal(/unexpected end/i.test(error.message)?'png-truncated-idat':'png-zlib-invalid');reject(failure);}});
  inflate.on('end',()=>resolve());
 });
 // `settled` handles done from the start (no unhandled rejection) and ends any drain wait once a refusal destroys the inflater.
 const settled=done.then(()=>{},()=>{});let written=0;
 for(const data of s.idat){
  if(failure)break;if(clock()>limits.decodeMs){failure=new VisualDecodeRefusal('decode-deadline',{final:false});inflate.destroy();break;}
  written+=data.length;if(!inflate.write(data))await Promise.race([new Promise(r=>inflate.once('drain',r)),settled]);
 }
 if(failure)throw failure;
 inflate.end();
 await done;
 if(rows!==s.height||filter>=0||fill)refuse('png-truncated-idat');
 if(inflate.bytesWritten!==written)refuse('png-trailing-data');
 return {format:'image/png',width:s.width,height:s.height,pixelsSha256:hash.digest('hex'),decoder:PNG_DECODER};
}
// Walks every JPEG segment and entropy-coded scan to EOI, so the pinned decoder can never read past the end of the bytes.
const SOF=new Set([0xc0,0xc1,0xc2]),SOF_UNSUPPORTED=new Set([0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
function jpegStructure(bytes,limits){
 let pos=2,frame=null,scans=0;const covered=new Set(),dcAl=new Map(),acAl=new Map(),qt=new Set(),dcT=new Set(),acT=new Set(),acRuns=[];
 for(;;){
  if(pos+2>bytes.length)refuse('jpeg-truncated');
  if(bytes[pos]!==0xff)refuse('jpeg-structure');
  while(bytes[pos+1]===0xff&&pos+2<bytes.length)pos++;
  const marker=bytes[pos+1];pos+=2;
  if(marker===0xd9){if(pos!==bytes.length)refuse('jpeg-trailing-data');break;}
  if(marker===0x00||marker===0x01||marker===0xd8||(marker>=0xd0&&marker<=0xd7))refuse('jpeg-structure');
  if(pos+2>bytes.length)refuse('jpeg-truncated');
  const length=u16(bytes,pos);if(length<2||pos+length>bytes.length)refuse('jpeg-truncated');
  if(SOF_UNSUPPORTED.has(marker))refuse('jpeg-format-unsupported');
  if(!SOF.has(marker)&&marker!==0xdb&&marker!==0xc4&&marker!==0xda)refuse('jpeg-marker-unsupported');
  // DQT (B.2.4.1): Pq 0, Tq 0-3, 64 entries of 1-255, exact length. Only before the first scan: jpeg-js binds quantization tables
  // after parsing, so a later redefinition would not be applied in stream order.
  if(marker===0xdb){if(scans)refuse('jpeg-table-invalid');for(let q=pos+2;q<pos+length;q+=65){const pq=bytes[q]>>4,tq=bytes[q]&15;if(pq!==0||tq>3||q+65>pos+length)refuse('jpeg-table-invalid');for(let i=1;i<=64;i++)if(!bytes[q+i])refuse('jpeg-table-invalid');qt.add(tq);}}
  // DHT (B.2.4.2, Annex C): Tc 0-1, Th 0-3 (0-1 for SOF0, re-checked at SOF), a valid prefix code (no over-subscription and no
  // all-ones code), distinct symbols, DC categories 0-11 and AC RRRRSSSS with SSSS 1-10 or EOB/ZRL (EOBn only when progressive,
  // re-checked at SOF), exact length. Redefinition is applied in stream order by the decoder, so it stays legal.
  if(marker===0xc4){for(let q=pos+2;q<pos+length;){if(q+17>pos+length)refuse('jpeg-table-invalid');const tc=bytes[q]>>4,th=bytes[q]&15;let n=0,avail=1;
   for(let i=1;i<=16;i++){n+=bytes[q+i];avail=avail*2-bytes[q+i];if(avail<0)refuse('jpeg-table-invalid');}
   if(tc>1||th>3||frame?.sof===0xc0&&th>1||n<1||avail<1||q+17+n>pos+length)refuse('jpeg-table-invalid');
   const values=bytes.subarray(q+17,q+17+n);if(new Set(values).size!==n)refuse('jpeg-table-invalid');
   for(const v of values){if(tc===0?v>11:(v&15)>10)refuse('jpeg-table-invalid');if(tc===1&&(v&15)===0&&v!==0&&v!==0xf0)acRuns.push(v);}
   if(frame&&frame.sof!==0xc2&&acRuns.length)refuse('jpeg-table-invalid');
   (tc?acT:dcT).add(th);q+=17+n;}}
  if(SOF.has(marker)){
   if(frame||length<8)refuse('jpeg-structure');
   frame={sof:marker,precision:bytes[pos+2],height:u16(bytes,pos+3),width:u16(bytes,pos+5),components:bytes[pos+7],ids:[]};
   if(frame.precision!==8||(frame.components!==1&&frame.components!==3))refuse('jpeg-format-unsupported');
   if(length!==8+3*frame.components)refuse('jpeg-structure');
   frame.hv=new Map();frame.tq=new Map();
   for(let i=0;i<frame.components;i++){const id=bytes[pos+8+3*i],h=bytes[pos+9+3*i]>>4,v=bytes[pos+9+3*i]&15,tq=bytes[pos+10+3*i];if(frame.ids.includes(id))refuse('jpeg-structure');if(h<1||h>4||v<1||v>4)refuse('jpeg-sampling-invalid');if(tq>3)refuse('jpeg-table-invalid');frame.ids.push(id);frame.hv.set(id,h*v);frame.tq.set(id,tq);}
   if(!frame.width||!frame.height)refuse('jpeg-header-invalid');
   if(frame.width>limits.maxDimension||frame.height>limits.maxDimension)refuse('dimension-cap');
   if(frame.width*frame.height>limits.maxPixels)refuse('pixel-cap');
   if(frame.width*frame.height>limits.maxJpegPixels)refuse('decode-not-streamable');
   // Tables defined before the frame are re-checked now that the frame type is known.
   if(marker===0xc0&&[...dcT,...acT].some(th=>th>1))refuse('jpeg-table-invalid');
   if(marker!==0xc2&&acRuns.length)refuse('jpeg-table-invalid');
  }
  // SOS: 1-4 components, Ls = 6 + 2*Ns, each selector a distinct frame component, spectral and approximation fields in range.
  if(marker===0xda){
   if(!frame)refuse('jpeg-structure');
   const ns=bytes[pos+2];if(ns<1||ns>4||length!==6+2*ns)refuse('jpeg-scan-invalid');
   // Selectors: frame components in frame order, distinct; in a sequential frame each component appears in exactly one scan.
   const seen=new Set();let last=-1;for(let i=0;i<ns;i++){const id=bytes[pos+3+2*i],at=frame.ids.indexOf(id);if(at<=last||seen.has(id)||frame.sof!==0xc2&&covered.has(id))refuse('jpeg-scan-invalid');last=at;seen.add(id);}
   for(const id of seen)covered.add(id);
   const ss=bytes[pos+3+2*ns],se=bytes[pos+4+2*ns],ah=bytes[pos+5+2*ns]>>4,al=bytes[pos+5+2*ns]&15;
   if(ns>1&&[...seen].reduce((n,id)=>n+frame.hv.get(id),0)>10)refuse('jpeg-sampling-invalid');
   // Every table this scan uses is defined before it: quantization for each component, DC for a first DC scan, AC for an AC scan.
   for(let i=0;i<ns;i++){const id=bytes[pos+3+2*i],td=bytes[pos+4+2*i]>>4,ta=bytes[pos+4+2*i]&15;if(td>3||ta>3||!qt.has(frame.tq.get(id))||ss===0&&ah===0&&!dcT.has(td)||se>0&&!acT.has(ta)||frame.sof===0xc0&&(td>1||ta>1))refuse('jpeg-table-invalid');}
   if(frame.sof===0xc2?(se>63||ss>se||(ss===0&&se!==0)||(ss>0&&ns!==1)||ah>13||al>13):(ss!==0||se!==63||ah||al))refuse('jpeg-scan-invalid');
   if(++scans>limits.maxJpegScans)refuse('jpeg-scan-cap');
   // Progressive successive approximation (T.81 G.1.1.1): per component, DC and each AC coefficient start with Ah=0 exactly once;
   // a refinement needs Ah equal to the band's prior Al and Al = Ah-1; AC scans need that component's DC first scan.
   if(frame.sof===0xc2)for(const id of seen){
    if(ss===0){const prev=dcAl.get(id);if(ah===0?prev!==undefined:prev!==ah||al!==ah-1)refuse('jpeg-scan-order');dcAl.set(id,al);}
    else{if(!dcAl.has(id))refuse('jpeg-scan-order');let band=acAl.get(id);if(!band)acAl.set(id,band=new Int8Array(64).fill(-1));for(let k=ss;k<=se;k++){if(ah===0?band[k]!==-1:band[k]!==ah||al!==ah-1)refuse('jpeg-scan-order');band[k]=al;}}
   }
  }
  pos+=length;
  if(marker===0xda){
   for(;;){
    if(pos+1>=bytes.length)refuse('jpeg-truncated');
    if(bytes[pos]===0xff){const next=bytes[pos+1];if(next===0x00){pos+=2;continue;}if(next>=0xd0&&next<=0xd7)refuse('jpeg-marker-unsupported');if(next===0xff){pos++;continue;}break;}
    pos++;
   }
  }
 }
 if(!frame||!scans)refuse('jpeg-structure');
 if(frame.ids.some(id=>!covered.has(id)))refuse('jpeg-scan-invalid');
 if(frame.sof===0xc2&&frame.ids.some(id=>!dcAl.has(id)))refuse('jpeg-scan-order');
 return frame;
}
function decodeJpegFull(bytes,limits,clock){
 const frame=jpegStructure(bytes,limits);let image;
 try{image=decodeJpeg(bytes,{useTArray:true,formatAsRGBA:false,tolerantDecoding:false,maxResolutionInMP:limits.maxJpegPixels/1e6,maxMemoryUsageInMB:limits.maxJpegMemoryMB});}
 catch{refuse('jpeg-decode-error');}
 // jpeg-js decodes synchronously and cannot be pre-empted: maxJpegScans bounds the work, and the deadline is checked on return.
 if(clock()>limits.decodeMs)refuse('decode-deadline',{final:false});
 if(image.width!==frame.width||image.height!==frame.height||image.data.length!==frame.width*frame.height*3)refuse('dimension-mismatch');
 return {format:'image/jpeg',width:image.width,height:image.height,pixelsSha256:createHash('sha256').update(image.data).digest('hex'),decoder:JPEG_DECODER};
}
// Full decode of one retained original. `mime` is the observed response MIME; the raster signature must agree with it.
export async function decodeVisual(bytes,{mime,limits,clock}){
 if(!(bytes instanceof Uint8Array)||!bytes.length)refuse('empty-original');
 if(bytes.length>limits.maxBytes)refuse('byte-cap');
 const sniffed=sniffRaster(bytes);if(!sniffed||sniffed!==mime||!limits.formats.includes(mime))refuse('mime-signature-mismatch');
 const start=Date.now(),elapsed=clock??(()=>Date.now()-start);
 const result=mime==='image/png'?await decodePng(bytes,limits,elapsed):decodeJpegFull(bytes,limits,elapsed);
 if(!Number.isFinite(result.width)||!Number.isFinite(result.height)||result.width<1||result.height<1)refuse('dimension-invalid');
 return result;
}
