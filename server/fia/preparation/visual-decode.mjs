import {createInflate} from 'node:zlib';
import {createHash} from 'node:crypto';
import decodeJpeg from 'jpeg-js/lib/decoder.js';
// Full decode proof for visual-original (F6, T5 YES with conditions at cookbook d922aa5). It runs on read-back bytes only and
// returns evidence, never pixels: dimensions and a SHA256 of the decoded samples. Every refusal is a VisualDecodeRefusal whose
// subReason is a recipe sub-reason; header inspection alone never returns a result.
export const PNG_DECODER=Object.freeze({name:'fia-png-row-stream',version:'1',inflate:'node:zlib',pixels:'unfiltered-scanlines'});
// Pinned exactly in package.json; sha256 of node_modules/jpeg-js/lib/decoder.js, the only file bundled (tests check it).
export const JPEG_DECODER=Object.freeze({name:'jpeg-js',version:'0.4.4',entry:'jpeg-js/lib/decoder.js',sha256:'a3f175fd6f62d142aad94d3bd90f3a30be4e076baf9b6a6fa31c8e84d9d4aa9f',pixels:'rgb8'});
export class VisualDecodeRefusal extends Error{constructor(subReason,{final=true}={}){super(subReason);this.subReason=subReason;this.final=final;}}
const refuse=(r,o)=>{throw new VisualDecodeRefusal(r,o);};
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
function pngStructure(bytes,limits){
 let pos=8,ihdr=null,plte=0,idat=[],idatDone=false,iend=false,first=true;
 while(pos<bytes.length){
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
  }else if(type==='PLTE'){if(idat.length||!length||length%3||length>768)refuse('png-chunk-invalid');plte=length/3;}
  else if(type==='IDAT'){if(idatDone)refuse('png-chunk-order');idat.push(data);}
  else if(type==='IEND'){if(length)refuse('png-chunk-invalid');iend=true;if(pos!==bytes.length)refuse('png-trailing-data');break;}
  else if(type.charCodeAt(0)<97)refuse('png-unknown-critical-chunk');
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
 const s=pngStructure(bytes,limits),rowBytes=s.width*s.channels,hash=createHash('sha256');
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
  inflate.on('error',error=>{if(!failure){failure=error;reject(new VisualDecodeRefusal(/unexpected end/i.test(error.message)?'png-truncated-idat':'png-zlib-invalid'));}});
  inflate.on('end',()=>resolve());
 });
 let written=0;
 for(const data of s.idat){if(failure)break;written+=data.length;if(!inflate.write(data))await new Promise(r=>inflate.once('drain',r));}
 if(!failure)inflate.end();
 await done;
 if(rows!==s.height||filter>=0||fill)refuse('png-truncated-idat');
 if(inflate.bytesWritten!==written)refuse('png-trailing-data');
 return {format:'image/png',width:s.width,height:s.height,pixelsSha256:hash.digest('hex'),decoder:PNG_DECODER};
}
// Walks every JPEG segment and entropy-coded scan to EOI, so the pinned decoder can never read past the end of the bytes.
const SOF=new Set([0xc0,0xc1,0xc2]),SOF_UNSUPPORTED=new Set([0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
function jpegStructure(bytes,limits){
 let pos=2,frame=null,scans=0;
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
  if(SOF.has(marker)){
   if(frame||length<8)refuse('jpeg-structure');
   frame={sof:marker,precision:bytes[pos+2],height:u16(bytes,pos+3),width:u16(bytes,pos+5),components:bytes[pos+7]};
   if(frame.precision!==8||(frame.components!==1&&frame.components!==3))refuse('jpeg-format-unsupported');
   if(!frame.width||!frame.height)refuse('jpeg-header-invalid');
   if(frame.width>limits.maxDimension||frame.height>limits.maxDimension)refuse('dimension-cap');
   if(frame.width*frame.height>limits.maxPixels)refuse('pixel-cap');
   if(frame.width*frame.height>limits.maxJpegPixels)refuse('decode-not-streamable');
  }
  pos+=length;
  if(marker===0xda){
   if(!frame)refuse('jpeg-structure');scans++;
   for(;;){
    if(pos+1>=bytes.length)refuse('jpeg-truncated');
    if(bytes[pos]===0xff){const next=bytes[pos+1];if(next===0x00||(next>=0xd0&&next<=0xd7)){pos+=2;continue;}if(next===0xff){pos++;continue;}break;}
    pos++;
   }
  }
 }
 if(!frame||!scans)refuse('jpeg-structure');
 return frame;
}
function decodeJpegFull(bytes,limits){
 const frame=jpegStructure(bytes,limits);let image;
 try{image=decodeJpeg(bytes,{useTArray:true,formatAsRGBA:false,tolerantDecoding:false,maxResolutionInMP:limits.maxJpegPixels/1e6,maxMemoryUsageInMB:limits.maxJpegMemoryMB});}
 catch{refuse('jpeg-decode-error');}
 if(image.width!==frame.width||image.height!==frame.height||image.data.length!==frame.width*frame.height*3)refuse('dimension-mismatch');
 return {format:'image/jpeg',width:image.width,height:image.height,pixelsSha256:createHash('sha256').update(image.data).digest('hex'),decoder:JPEG_DECODER};
}
// Full decode of one retained original. `mime` is the observed response MIME; the raster signature must agree with it.
export async function decodeVisual(bytes,{mime,limits,clock}){
 if(!(bytes instanceof Uint8Array)||!bytes.length)refuse('empty-original');
 if(bytes.length>limits.maxBytes)refuse('byte-cap');
 const sniffed=sniffRaster(bytes);if(!sniffed||sniffed!==mime||!limits.formats.includes(mime))refuse('mime-signature-mismatch');
 const start=Date.now(),elapsed=clock??(()=>Date.now()-start);
 const result=mime==='image/png'?await decodePng(bytes,limits,elapsed):decodeJpegFull(bytes,limits);
 if(!Number.isFinite(result.width)||!Number.isFinite(result.height)||result.width<1||result.height<1)refuse('dimension-invalid');
 return result;
}
