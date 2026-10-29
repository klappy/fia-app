import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {deflateSync,crc32} from 'node:zlib';import {createHash} from 'node:crypto';
import {decodeVisual,sniffRaster,VisualDecodeRefusal,JPEG_DECODER,PNG_DECODER} from '../../server/fia/preparation/visual-decode.mjs';
import {decodeRetained,VISUAL_ORIGINAL_RECIPE} from '../../server/fia/preparation/visual-original.mjs';
// Fixtures in fixtures/visual were made by ImageMagick from deterministic PPM sources, independently of these decoders.
const file=name=>new Uint8Array(readFileSync(new URL(`./fixtures/visual/${name}`,import.meta.url)));
const sha=x=>createHash('sha256').update(x).digest('hex');
const limits={...VISUAL_ORIGINAL_RECIPE.limits,formats:VISUAL_ORIGINAL_RECIPE.formats};
const decode=(bytes,mime,extra={})=>decodeVisual(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),{mime,limits:{...limits,...extra}});
async function refused(promise,subReason){await assert.rejects(promise,e=>{assert.ok(e instanceof VisualDecodeRefusal,String(e));assert.equal(e.subReason,subReason);return true;});}
// A PNG builder for crafted cases: explicit filter per row, IDAT split into parts, CRCs computed (or broken on request).
const SIG=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
function chunk(type,data){const body=Buffer.concat([Buffer.from(type,'ascii'),data]),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);body.copy(out,4);out.writeUInt32BE(crc32(body)>>>0,8+data.length);return out;}
function header(w,h,{color=2,depth=8,interlace=0}={}){const b=Buffer.alloc(13);b.writeUInt32BE(w,0);b.writeUInt32BE(h,4);b[8]=depth;b[9]=color;b[12]=interlace;return chunk('IHDR',b);}
function raw(w,h,ch){const px=Buffer.alloc(w*h*ch);for(let i=0;i<px.length;i++)px[i]=(i*37+(i>>5)*11)&255;return px;}
function filterRows(px,w,h,ch,filters){
 const rb=w*ch,out=[];
 for(let y=0;y<h;y++){const f=filters[y%filters.length],cur=px.subarray(y*rb,(y+1)*rb),prev=y?px.subarray((y-1)*rb,y*rb):Buffer.alloc(rb),row=Buffer.alloc(rb+1);row[0]=f;
  for(let i=0;i<rb;i++){const a=i>=ch?cur[i-ch]:0,b=prev[i],c=i>=ch?prev[i-ch]:0;let pred=0;if(f===1)pred=a;else if(f===2)pred=b;else if(f===3)pred=(a+b)>>1;else if(f===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);pred=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}row[i+1]=(cur[i]-pred)&255;}
  out.push(row);}
 return Buffer.concat(out);
}
function png({w=9,h=7,ch=3,color=2,filters=[0,1,2,3,4],parts=3,stream,tail=[chunk('IEND',Buffer.alloc(0))],extra=[]}={}){
 const px=raw(w,h,ch),z=stream??deflateSync(filterRows(px,w,h,ch,filters)),size=Math.ceil(z.length/parts),idat=[];
 for(let n=0;n<z.length;n+=size)idat.push(chunk('IDAT',z.subarray(n,n+size)));
 return {bytes:Buffer.concat([SIG,header(w,h,{color}),...extra,...idat,...tail]),pixels:px};
}

test('decoder identity is pinned: jpeg-js 0.4.4 exactly, with the bundled decoder file hash recorded in the recipe',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url))),lock=JSON.parse(readFileSync(new URL('../../package-lock.json',import.meta.url)));
 assert.equal(pkg.dependencies['jpeg-js'],'0.4.4');assert.equal(lock.packages['node_modules/jpeg-js'].version,'0.4.4');assert.equal(lock.packages[''].dependencies['jpeg-js'],'0.4.4');
 assert.equal(sha(readFileSync(new URL('../../node_modules/jpeg-js/lib/decoder.js',import.meta.url))),JPEG_DECODER.sha256);
 assert.equal(VISUAL_ORIGINAL_RECIPE.schema,'fia-visual-original-recipe@2');assert.deepEqual(VISUAL_ORIGINAL_RECIPE.decoder,{'image/png':PNG_DECODER,'image/jpeg':JPEG_DECODER});
 assert.equal(VISUAL_ORIGINAL_RECIPE.limits.maxPixels,17000000);assert.equal(VISUAL_ORIGINAL_RECIPE.limits.maxJpegPixels,2000000);assert.ok(VISUAL_ORIGINAL_RECIPE.limits.maxBytes>=7889557);
});
test('PNG fixture decodes to its dimensions, and its pixel hash equals the independent raw source',async()=>{
 const r=await decode(file('rgb-31x17.png'),'image/png');assert.equal(r.width,31);assert.equal(r.height,17);
 assert.equal(r.pixelsSha256,'041456b9f6c0652743da98646829f600693df83412c38f148cd7c9fa7f829ff7');assert.equal('pixels' in r||'data' in r,false,'pixels never leave the decoder');
});
test('every PNG filter type, a split IDAT and an ancillary chunk decode back to the exact samples',async()=>{
 for(const filters of [[0],[1],[2],[3],[4],[0,1,2,3,4]]){const {bytes,pixels}=png({filters,extra:[chunk('tEXt',Buffer.from('k\0v'))]});const r=await decode(bytes,'image/png');assert.equal(r.pixelsSha256,sha(pixels),String(filters));}
 const rgba=png({w:5,h:4,ch:4,color:6});const r=await decode(rgba.bytes,'image/png');assert.equal(r.width,5);assert.equal(r.pixelsSha256,sha(rgba.pixels));
});
test('8-bit palette PNG decodes; a 4-bit palette is an unsupported subset, never decoded',async()=>{
 const r=await decode(file('palette-20x9.png'),'image/png');assert.equal(r.width,20);assert.equal(r.height,9);
 await refused(decode(file('palette4bit-20x9.png'),'image/png'),'png-format-unsupported');
});
test('JPEG fixtures decode through EOI to their dimensions: baseline, progressive and greyscale',async()=>{
 for(const [name,w,h] of [['baseline-37x23.jpg',37,23],['progressive-40x30.jpg',40,30],['gray-12x10.jpg',12,10]]){const r=await decode(file(name),'image/jpeg');assert.equal(r.width,w,name);assert.equal(r.height,h,name);assert.match(r.pixelsSha256,/^[a-f0-9]{64}$/);assert.deepEqual(r.decoder,JPEG_DECODER);}
});
const good=()=>Buffer.from(png().bytes);
for(const [name,make,mime,subReason] of [
 ['corrupt CRC',()=>{const b=good();b[50]^=0xff;return b;},'image/png','png-crc-mismatch'],
 ['truncated IDAT (zlib stream cut, CRCs valid)',()=>png({stream:deflateSync(filterRows(raw(9,7,3),9,7,3,[0])).subarray(0,20),parts:1}).bytes,'image/png','png-truncated-idat'],
 ['IDAT short of the last row',()=>png({stream:deflateSync(filterRows(raw(9,7,3),9,7,3,[0]).subarray(0,6*28)),parts:1}).bytes,'image/png','png-truncated-idat'],
 ['IDAT with rows past the header height',()=>png({stream:deflateSync(Buffer.concat([filterRows(raw(9,7,3),9,7,3,[0]),Buffer.alloc(28)])),parts:1}).bytes,'image/png','png-trailing-data'],
 ['compressed data after the zlib end',()=>png({stream:Buffer.concat([deflateSync(filterRows(raw(9,7,3),9,7,3,[0])),Buffer.from([1,2,3,4])]),parts:1}).bytes,'image/png','png-trailing-data'],
 ['missing IEND',()=>png({tail:[]}).bytes,'image/png','png-missing-iend'],
 ['file cut mid-chunk',()=>good().subarray(0,60),'image/png','png-truncated-chunk'],
 ['bytes after IEND',()=>Buffer.concat([good(),Buffer.from([0])]),'image/png','png-trailing-data'],
 ['header only (IHDR then IEND, no IDAT)',()=>Buffer.concat([SIG,header(9,7),chunk('IEND',Buffer.alloc(0))]),'image/png','png-truncated-idat'],
 ['invalid filter byte',()=>png({filters:[5]}).bytes,'image/png','png-filter-invalid'],
 ['interlaced PNG fixture',()=>file('interlaced-16x16.png'),'image/png','decode-not-streamable'],
 ['oversize pixels (5000x4000 = 20 MP)',()=>Buffer.concat([SIG,header(5000,4000),chunk('IDAT',deflateSync(Buffer.alloc(1))),chunk('IEND',Buffer.alloc(0))]),'image/png','pixel-cap'],
 ['oversize dimension (9000 wide)',()=>Buffer.concat([SIG,header(9000,1),chunk('IDAT',deflateSync(Buffer.alloc(1))),chunk('IEND',Buffer.alloc(0))]),'image/png','dimension-cap'],
 ['unknown critical chunk',()=>png({extra:[chunk('ABCD',Buffer.alloc(1))]}).bytes,'image/png','png-unknown-critical-chunk'],
 ['MIME mismatch (PNG bytes observed as image/jpeg)',()=>good(),'image/jpeg','mime-signature-mismatch'],
 ['MIME mismatch (JPEG bytes observed as image/png)',()=>file('baseline-37x23.jpg'),'image/png','mime-signature-mismatch'],
 ['unlisted MIME',()=>good(),'image/webp','mime-signature-mismatch'],
 ['empty original',()=>new Uint8Array(0),'image/png','empty-original'],
 ['truncated JPEG',()=>{const b=file('baseline-37x23.jpg');return b.subarray(0,b.length-100);},'image/jpeg','jpeg-truncated'],
 ['JPEG missing EOI',()=>{const b=file('baseline-37x23.jpg');return b.subarray(0,b.length-2);},'image/jpeg','jpeg-truncated'],
 ['JPEG scan cut short with EOI re-appended',()=>{const b=file('baseline-37x23.jpg');return Buffer.concat([b.subarray(0,b.length-200),Buffer.from([0xff,0xd9])]);},'image/jpeg','jpeg-decode-error'],
 ['JPEG with bytes after EOI',()=>Buffer.concat([file('baseline-37x23.jpg'),Buffer.from([0])]),'image/jpeg','jpeg-trailing-data'],
 ['JPEG header only (SOF, no scan)',()=>{const b=Buffer.from(file('baseline-37x23.jpg'));const sos=b.indexOf(Buffer.from([0xff,0xda]));return Buffer.concat([b.subarray(0,sos),Buffer.from([0xff,0xd9])]);},'image/jpeg','jpeg-structure'],
 ['JPEG over 2 MP fixture (1500x1400)',()=>file('over-2mp-1500x1400.jpg'),'image/jpeg','decode-not-streamable'],
])test(`fails closed: ${name} -> ${subReason}`,()=>refused(decode(make(),mime),subReason));
test('palette indices outside PLTE are refused',async()=>{
 const w=4,h=2,px=Buffer.from([0,1,2,3,0,1,2,9]),plte=chunk('PLTE',Buffer.alloc(12));
 const bytes=Buffer.concat([SIG,header(w,h,{color:3}),plte,chunk('IDAT',deflateSync(filterRows(px,w,h,1,[0]))),chunk('IEND',Buffer.alloc(0))]);
 await refused(decode(bytes,'image/png'),'png-palette-index');
});
test('a missed decode deadline is not final (interrupted), unlike every other refusal',async()=>{
 let t=0;await assert.rejects(decodeVisual(new Uint8Array(png().bytes),{mime:'image/png',limits,clock:()=>(t+=limits.decodeMs+1)}),e=>e.subReason==='decode-deadline'&&e.final===false);
});
test('signature sniffing names only supported rasters',()=>{assert.equal(sniffRaster(file('rgb-31x17.png')),'image/png');assert.equal(sniffRaster(file('baseline-37x23.jpg')),'image/jpeg');assert.equal(sniffRaster(new Uint8Array([0x47,0x49,0x46,0x38])),null);});
test('decodeRetained decodes only read-back bytes that match the receipt: size, hash, nonzero identity',async()=>{
 const bytes=file('rgb-31x17.png'),original={sha256:sha(bytes),bytes:bytes.length,contentType:'image/png',sourceKey:'k'};
 const bucket=store=>({get:async k=>k==='k'&&store?{size:store.length,arrayBuffer:async()=>store.buffer.slice(store.byteOffset,store.byteOffset+store.length)}:null});
 const ok=await decodeRetained(bucket(bytes),original);assert.equal(ok.state,'ready');assert.equal(ok.width,31);assert.equal(ok.originalSha256,original.sha256);assert.equal(ok.mime,'image/png');
 const flipped=Uint8Array.from(bytes);flipped[40]^=1;await assert.rejects(decodeRetained(bucket(flipped),original),/visual-retained-hash/);
 await assert.rejects(decodeRetained(bucket(bytes.subarray(1)),original),/visual-retained-size/);
 await assert.rejects(decodeRetained(bucket(null),original),/visual-retained-size/);
 await assert.rejects(decodeRetained(bucket(bytes),{...original,sha256:'0'.repeat(64)}),/visual-retained-identity/);
 await assert.rejects(decodeRetained(bucket(bytes),{...original,bytes:0}),/visual-retained-identity/);
 const wrongMime=await decodeRetained(bucket(bytes),{...original,contentType:'image/jpeg'});assert.equal(wrongMime.state,'unavailable');assert.equal(wrongMime.reason,'visual-unsupported');assert.equal(wrongMime.subReason,'mime-signature-mismatch');assert.equal(wrongMime.final,true);assert.equal(wrongMime.width,null);
});
// Review fixes on PR285 d459be9: a refusal mid-inflate must settle promptly (no 'drain' wait on a destroyed inflater), with no
// unhandled rejection; SOS must be valid and cover every frame component; progressive scans are capped; JPEG honours the deadline.
async function settlesWithin(promise,ms){let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`did not settle within ${ms} ms`)),ms);});try{return await Promise.race([promise,timeout]);}finally{clearTimeout(timer);}}
async function noUnhandled(fn){const seen=[],on=r=>seen.push(r);process.on('unhandledRejection',on);try{await fn();await new Promise(r=>setTimeout(r,50));}finally{process.off('unhandledRejection',on);}assert.deepEqual(seen.map(String),[],'no unhandled rejection');}
test('probe: a 1024x1024 stored IDAT declared as 1024x10 is refused png-trailing-data promptly, with no unhandled rejection',()=>noUnhandled(async()=>{
 const rows=filterRows(raw(1024,1024,3),1024,1024,3,[0]),bytes=Buffer.concat([SIG,header(1024,10),chunk('IDAT',deflateSync(rows,{level:0})),chunk('IEND',Buffer.alloc(0))]);
 const t=Date.now();await refused(settlesWithin(decode(bytes,'image/png'),5000),'png-trailing-data');assert.ok(Date.now()-t<5000);
}));
test('probe: corrupt zlib data inside a 4 MiB IDAT is a typed refusal promptly, with no unhandled rejection',()=>noUnhandled(async()=>{
 const w=1024,h=1366,px=Buffer.alloc(w*h*3);for(let i=0;i<px.length;i+=32)createHash('sha256').update(String(i)).digest().copy(px,i);
 const z=Buffer.from(deflateSync(filterRows(px,w,h,3,[0]),{level:1}));assert.ok(z.length>4*1024*1024,String(z.length));
 for(let i=z.length>>1;i<(z.length>>1)+4096;i++)z[i]^=0x5a;
 const bytes=Buffer.concat([SIG,header(w,h),chunk('IDAT',z),chunk('IEND',Buffer.alloc(0))]);
 await assert.rejects(settlesWithin(decode(bytes,'image/png'),5000),e=>e instanceof VisualDecodeRefusal&&e.final===true&&/^png-/.test(e.subReason));
}));
test('a PNG deadline overrun between IDAT writes is interrupted, not final, and settles',()=>noUnhandled(async()=>{
 let t=0;const {bytes}=png({w:64,h:64,parts:8});
 await assert.rejects(settlesWithin(decodeVisual(new Uint8Array(bytes),{mime:'image/png',limits,clock:()=>(t+=limits.decodeMs/4)}),5000),e=>e.subReason==='decode-deadline'&&e.final===false);
}));
// SOS surgery on the real baseline fixture: replace the scan header, keep the entropy-coded data.
function withScanHeader(build){const b=Buffer.from(file('baseline-37x23.jpg')),at=b.indexOf(Buffer.from([0xff,0xda])),ls=b.readUInt16BE(at+2),ns=b[at+4];
 const comps=[...Array(ns)].map((_,i)=>[b[at+5+2*i],b[at+6+2*i]]),tail=b.subarray(at+2+ls),head=build(comps,b.subarray(at+5+2*ns,at+8+2*ns));
 const seg=Buffer.alloc(4+head.length);seg[0]=0xff;seg[1]=0xda;seg.writeUInt16BE(2+head.length,2);head.copy(seg,4);return Buffer.concat([b.subarray(0,at),seg,tail]);}
test('JPEG scan with Ns=0 is refused, never a uniform-grey ready',async()=>{
 await refused(decode(withScanHeader((c,rest)=>Buffer.concat([Buffer.from([0]),rest])),'image/jpeg'),'jpeg-scan-invalid');
});
test('JPEG scans that leave a frame component undecoded are refused',async()=>{
 await refused(decode(withScanHeader((c,rest)=>Buffer.concat([Buffer.from([1,...c[0]]),rest])),'image/jpeg'),'jpeg-scan-invalid');
});
test('JPEG scan selectors must be distinct frame components, with Ls = 6 + 2*Ns',async()=>{
 await refused(decode(withScanHeader((c,rest)=>Buffer.concat([Buffer.from([3,9,c[1][1],...c[1],...c[2]]),rest])),'image/jpeg'),'jpeg-scan-invalid');
 await refused(decode(withScanHeader((c,rest)=>Buffer.concat([Buffer.from([3,...c[0],...c[0],...c[2]]),rest])),'image/jpeg'),'jpeg-scan-invalid');
 await refused(decode(withScanHeader((c,rest)=>Buffer.concat([Buffer.from([3,...c[0],...c[1],...c[2]]),rest,Buffer.from([0])])),'image/jpeg'),'jpeg-scan-invalid');
 await refused(decode(withScanHeader((c,rest)=>Buffer.concat([Buffer.from([5,...c[0],...c[1],...c[2],...c[0],...c[1]]),rest])),'image/jpeg'),'jpeg-scan-invalid');
});
test('baseline JPEG scans must carry Ss=0, Se=63, Ah=Al=0',async()=>{
 await refused(decode(withScanHeader((c,rest)=>Buffer.concat([Buffer.from([3,...c[0],...c[1],...c[2]]),Buffer.from([0,62,0])])),'image/jpeg'),'jpeg-scan-invalid');
});
test('progressive JPEG scans are capped by the recipe (maxJpegScans 32) before decoding',async()=>{
 const b=Buffer.from(file('progressive-40x30.jpg')),sos=[];for(let i=2;i<b.length-1;i++)if(b[i]===0xff&&b[i+1]===0xda)sos.push(i);
 assert.ok(sos.length>1&&sos.length<=VISUAL_ORIGINAL_RECIPE.limits.maxJpegScans);
 const last=b.subarray(sos[sos.length-1],b.length-2),many=Buffer.concat([b.subarray(0,b.length-2),...Array(VISUAL_ORIGINAL_RECIPE.limits.maxJpegScans+1-sos.length).fill(last),Buffer.from([0xff,0xd9])]);
 await refused(decode(many,'image/jpeg'),'jpeg-scan-cap');
 assert.equal(VISUAL_ORIGINAL_RECIPE.limits.maxJpegScans,32);
});
test('the recipe decode deadline applies to JPEG too, as interrupted (not final)',async()=>{
 let t=0;await assert.rejects(decodeVisual(file('baseline-37x23.jpg'),{mime:'image/jpeg',limits,clock:()=>(t+=limits.decodeMs+1)}),e=>e.subReason==='decode-deadline'&&e.final===false);
});
// Re-review of 873cbd2: a zlib stream error that arrives while the writer waits on 'drain' must still surface as the typed
// refusal, never the raw zlib Error, so the verdict is final and kept.
function noisyZ(w,h,level=1){const px=Buffer.alloc(w*h*3);for(let i=0;i<px.length;i+=32)createHash('sha256').update('z'+i).digest().copy(px,i);return Buffer.from(deflateSync(filterRows(px,w,h,3,[0]),{level}));}
function badZlibPng({w,h,parts,corrupt}){const z=noisyZ(w,h);corrupt(z);const size=Math.ceil(z.length/parts),idat=[];for(let n=0;n<z.length;n+=size)idat.push(chunk('IDAT',z.subarray(n,n+size)));return Buffer.concat([SIG,header(w,h),...idat,chunk('IEND',Buffer.alloc(0))]);}
const badHeader=z=>{z[0]=0x78;z[1]=0x00;};// FCHECK fails: "incorrect header check"
const badBlock=z=>{z[2]|=0x06;};// BTYPE 11: "invalid block type"
for(const [name,args] of [
 ['a large single IDAT with a bad zlib header',{w:1024,h:1024,parts:1,corrupt:badHeader}],
 ['8 IDATs of about 128 KiB+ with an invalid block type',{w:1024,h:1024,parts:8,corrupt:badBlock}],
 ['a 128x128 single IDAT with a bad zlib header',{w:128,h:128,parts:1,corrupt:badHeader}],
 ['a small IDAT with an invalid block type',{w:9,h:7,parts:1,corrupt:badBlock}],
])test(`zlib corruption is typed png-zlib-invalid (final), never a raw Error: ${name}`,()=>noUnhandled(async()=>{
 const bytes=badZlibPng(args);if(args.w===1024)assert.ok(bytes.length>1024*1024,String(bytes.length));
 await assert.rejects(settlesWithin(decode(bytes,'image/png'),5000),e=>{assert.ok(e instanceof VisualDecodeRefusal,`raw ${e}`);assert.equal(e.subReason,'png-zlib-invalid');assert.equal(e.final,true);return true;});
}));
