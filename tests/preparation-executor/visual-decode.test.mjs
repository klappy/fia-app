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
 for(const filters of [[0],[1],[2],[3],[4],[0,1,2,3,4]]){const {bytes,pixels}=png({filters,extra:[chunk('pHYs',Buffer.from([0,0,11,19,0,0,11,19,1]))]});const r=await decode(bytes,'image/png');assert.equal(r.pixelsSha256,sha(pixels),String(filters));}
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
 ['unknown critical chunk',()=>png({extra:[chunk('ABCD',Buffer.alloc(1))]}).bytes,'image/png','png-chunk-unsupported'],
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
 // Repeating a refinement scan is now refused by the successive-approximation order before the cap is reached.
 await refused(decode(many,'image/jpeg'),'jpeg-scan-order');
 // The cap itself: the valid script under a recipe one scan short of it.
 await refused(decode(b,'image/jpeg',{maxJpegScans:sos.length-1}),'jpeg-scan-cap');assert.equal((await decode(b,'image/jpeg')).width,40);
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
// Codex findings on PR285 b06b031, each reproduced here before the fix.
test('4408596878: a stalled readback (R2 get or arrayBuffer) is a bounded, non-final interrupted, never a hang',async()=>{
 const bytes=file('rgb-31x17.png'),original={sha256:sha(bytes),bytes:bytes.length,contentType:'image/png',sourceKey:'k'},never=()=>new Promise(()=>{});
 for(const bucket of [{get:never},{get:async()=>({size:bytes.length,arrayBuffer:never})}]){
  const r=await settlesWithin(decodeRetained(bucket,original,{readbackMs:50}),2000);
  assert.equal(r.state,'unavailable');assert.equal(r.reason,'interrupted');assert.equal(r.subReason,'readback-deadline');assert.equal(r.final,false);assert.equal(r.width,null);
 }
});
test('4408596892: a PNG of a million zero-length IDATs is refused by the recipe chunk cap, quickly',async()=>{
 const empty=chunk('IDAT',Buffer.alloc(0)),n=1000000,parts=new Array(n).fill(empty),{bytes}=png({extra:[]});
 const head=bytes.subarray(0,33),rest=bytes.subarray(33),many=Buffer.concat([head,...parts,rest]);assert.ok(many.length<=limits.maxBytes,String(many.length));
 const t=Date.now();await refused(settlesWithin(decode(many,'image/png'),5000),'png-chunk-cap');assert.ok(Date.now()-t<3000,`${Date.now()-t} ms`);
 assert.ok(Number.isSafeInteger(VISUAL_ORIGINAL_RECIPE.limits.maxPngChunks)&&VISUAL_ORIGINAL_RECIPE.limits.maxPngChunks<n);
});
test('4408596872: a second PLTE, or PLTE in colour type 0 or 4, is refused png-plte-invalid',async()=>{
 const w=4,h=2,px=Buffer.from([0,1,2,3,0,1,2,3]),plte=chunk('PLTE',Buffer.alloc(12));
 const two=Buffer.concat([SIG,header(w,h,{color:3}),plte,plte,chunk('IDAT',deflateSync(filterRows(px,w,h,1,[0]))),chunk('IEND',Buffer.alloc(0))]);
 await refused(decode(two,'image/png'),'png-plte-invalid');
 for(const [color,ch] of [[0,1],[4,2]]){const p=png({w,h,ch,color,extra:[plte]}).bytes;await refused(decode(p,'image/png'),'png-plte-invalid');}
 const ok=Buffer.concat([SIG,header(w,h,{color:3}),plte,chunk('IDAT',deflateSync(filterRows(px,w,h,1,[0]))),chunk('IEND',Buffer.alloc(0))]);assert.equal((await decode(ok,'image/png')).width,4);
 assert.equal((await decode(png({extra:[plte]}).bytes,'image/png')).width,9,'a suggested PLTE in truecolour stays legal');
});
// Progressive fixture scan script (ImageMagick): DC first Al1; AC firsts; AC refinements; DC refinement Ah1 Al0.
function progressive(mutate){const b=Buffer.from(file('progressive-40x30.jpg')),sos=[];for(let i=2;i<b.length-1;i++)if(b[i]===0xff&&b[i+1]===0xda)sos.push(i);
 const scans=sos.map(at=>{const ns=b[at+4];return {ns,comps:[...Array(ns)].map((_,i)=>b[at+5+2*i]),ss:b[at+5+2*ns],se:b[at+6+2*ns],ah:b[at+7+2*ns]>>4,al:b[at+7+2*ns]&15,set:(ah,al)=>{b[at+7+2*ns]=(ah<<4)|al;}};});mutate(scans);return b;}
test('4408596885: progressive successive approximation is enforced per component and band',async()=>{
 assert.equal((await decode(progressive(()=>{}),'image/jpeg')).width,40,'the valid script still decodes');
 const ref=s=>s.findIndex(x=>x.ah>0),dc=s=>s.findIndex(x=>x.ss===0&&x.ah===0);
 // A refinement whose Al is not Ah-1.
 await refused(decode(progressive(s=>{const r=s[ref(s)];r.set(r.ah,r.ah+1);}),'image/jpeg'),'jpeg-scan-order');
 // A refinement whose Ah does not match the prior scan's Al for that band.
 await refused(decode(progressive(s=>{const r=s[ref(s)];r.set(r.ah+1,r.ah);}),'image/jpeg'),'jpeg-scan-order');
 // A DC first scan marked as a refinement (Ah>0 with no prior DC scan).
 await refused(decode(progressive(s=>{const d=s[dc(s)];d.set(d.al+1,d.al);}),'image/jpeg'),'jpeg-scan-order');
});
// Codex round 3 on PR285 0097b60: the supported subset is an explicit allowlist in the recipe (PNG chunks, JPEG markers and SOF
// component fields); everything outside it is a typed refusal. Each finding is reproduced here first.
test('4408649034: tRNS is outside the PNG chunk allowlist (RGBA with tRNS, RGB with a 1-byte tRNS)',async()=>{
 const rgba=png({w:5,h:4,ch:4,color:6,extra:[chunk('tRNS',Buffer.alloc(6))]}).bytes,rgb=png({extra:[chunk('tRNS',Buffer.alloc(1))]}).bytes;
 await refused(decode(rgba,'image/png'),'png-chunk-unsupported');await refused(decode(rgb,'image/png'),'png-chunk-unsupported');
});
function sof(name,mutate){const b=Buffer.from(file(name)),at=b.indexOf(Buffer.from([0xff,0xc0]))>=0?b.indexOf(Buffer.from([0xff,0xc0])):b.indexOf(Buffer.from([0xff,0xc2]));mutate(b,at+4);return b;}
test('4408649041: SOF sampling factors outside 1-4 are refused jpeg-sampling-invalid',async()=>{
 for(const hv of [0x55,0x15,0x51,0xf1,0x05])await refused(decode(sof('gray-12x10.jpg',(b,p)=>{b[p+7]=hv;}),'image/jpeg'),'jpeg-sampling-invalid');
});
const pHYs=(unit=1)=>chunk('pHYs',Buffer.from([0,0,11,19,0,0,11,19,unit])),zTXt=(key='Comment',method=0,text='map')=>chunk('zTXt',Buffer.concat([Buffer.from(key,'latin1'),Buffer.from([0,method]),deflateSync(Buffer.from(text))]));
test('PNG allowlist: the recipe names it; pHYs and zTXt (what c4 carries) pass; every other ancillary chunk is png-chunk-unsupported',async()=>{
 assert.deepEqual(VISUAL_ORIGINAL_RECIPE.allowlist['image/png'].critical,['IHDR','PLTE','IDAT','IEND']);assert.deepEqual(Object.keys(VISUAL_ORIGINAL_RECIPE.allowlist['image/png'].ancillary),['pHYs','zTXt']);
 const {bytes,pixels}=png({extra:[pHYs()]}),withText=Buffer.concat([bytes.subarray(0,bytes.length-12),zTXt(),bytes.subarray(bytes.length-12)]);
 assert.equal((await decode(withText,'image/png')).pixelsSha256,sha(pixels));
 for(const type of ['tRNS','gAMA','cHRM','sRGB','iCCP','tEXt','iTXt','bKGD','tIME','sBIT','hIST','sPLT','eXIf','acTL'])await refused(decode(png({extra:[chunk(type,Buffer.alloc(4))]}).bytes,'image/png'),'png-chunk-unsupported');
});
test('pHYs and zTXt are validated: count, position, length, unit, keyword, method and content',async()=>{
 const {bytes}=png(),tailAt=bytes.length-12,afterIdat=c=>Buffer.concat([bytes.subarray(0,tailAt),c,bytes.subarray(tailAt)]);
 for(const bad of [png({extra:[pHYs(),pHYs()]}).bytes,afterIdat(pHYs()),png({extra:[chunk('pHYs',Buffer.alloc(8))]}).bytes,png({extra:[pHYs(2)]}).bytes,
  afterIdat(zTXt('Comment',1)),afterIdat(zTXt('')),afterIdat(zTXt(' lead')),afterIdat(zTXt('a  b')),afterIdat(zTXt('k'.repeat(80))),afterIdat(chunk('zTXt',Buffer.from('Comment\0\0garbage'))),afterIdat(zTXt('Comment',0,'x'.repeat(70000)))])
  await refused(decode(bad,'image/png'),'png-chunk-invalid');
});
// JPEG surgery helpers on the stripped baseline fixture (markers DQT, SOF0, DHT, SOS, EOI only).
const seg=(m,body)=>{const s=Buffer.alloc(4+body.length);s[0]=0xff;s[1]=m;s.writeUInt16BE(2+body.length,2);body.copy(s,4);return s;};
const afterSoi=extra=>{const b=Buffer.from(file('baseline-37x23.jpg'));return Buffer.concat([b.subarray(0,2),extra,b.subarray(2)]);};
test('JPEG marker allowlist: APPn, COM and DRI are jpeg-marker-unsupported; the recipe names the allowlist',async()=>{
 assert.deepEqual(VISUAL_ORIGINAL_RECIPE.allowlist['image/jpeg'].markers,['SOI','DQT','DHT','SOF0','SOF1','SOF2','SOS','EOI']);
 for(const m of [0xe0,0xe1,0xe2,0xee,0xfe,0xdd])await refused(decode(afterSoi(seg(m,Buffer.from(m===0xdd?[0,4]:[1,2,3,4]))),'image/jpeg'),'jpeg-marker-unsupported');
});
test('JPEG tables: undefined quantization or Huffman tables, bad DQT precision and overlong DHT are jpeg-table-invalid',async()=>{
 await refused(decode(sof('baseline-37x23.jpg',(b,p)=>{b[p+8]=3;}),'image/jpeg'),'jpeg-table-invalid');
 await refused(decode(sof('baseline-37x23.jpg',(b,p)=>{b[p+8]=7;}),'image/jpeg'),'jpeg-table-invalid');
 const b=Buffer.from(file('baseline-37x23.jpg')),q=b.indexOf(Buffer.from([0xff,0xdb]));const pq=Buffer.from(b);pq[q+4]|=0x10;await refused(decode(pq,'image/jpeg'),'jpeg-table-invalid');
 const h=b.indexOf(Buffer.from([0xff,0xc4])),bad=Buffer.from(b);bad[h+5]=0xff;await refused(decode(bad,'image/jpeg'),'jpeg-table-invalid');
 await refused(decode(withScanHeader((c,rest)=>Buffer.concat([Buffer.from([3,c[0][0],0x22,...c[1],...c[2]]),rest])),'image/jpeg'),'jpeg-table-invalid');
});
test('an interleaved scan over 10 blocks per MCU is jpeg-sampling-invalid',async()=>{
 await refused(decode(sof('baseline-37x23.jpg',(b,p)=>{b[p+7]=0x44;}),'image/jpeg'),'jpeg-sampling-invalid');
});
// Codex round 4 on PR285 7d40ed3 and the one-time spec audit (T.81 Annex B; ISO/IEC 15948) of every field the allowlist accepts.
function segs(b){const out=[];let p=2;for(;;){const m=b[p+1];if(m===0xd9)break;const len=b.readUInt16BE(p+2);out.push({m,at:p,len});p+=2+len;if(m===0xda){while(!(b[p]===0xff&&b[p+1]!==0&&!(b[p+1]>=0xd0&&b[p+1]<=0xd7)))p++;out[out.length-1].end=p;}}return out;}
const jpg=name=>Buffer.from(file(name)),insertAt=(b,at,extra)=>Buffer.concat([b.subarray(0,at),extra,b.subarray(at)]);
const dht=(tc,th,counts,values)=>seg(0xc4,Buffer.from([(tc<<4)|th,...Array.from({length:16},(_,i)=>counts[i]||0),...values]));
const beforeSof=(name,extra)=>{const b=jpg(name),s=segs(b).find(x=>x.m===0xc0||x.m===0xc2);return insertAt(b,s.at,extra);};
test('4408717313: a DQT entry of 0 is refused (Qk is 1-255)',async()=>{
 const b=jpg('baseline-37x23.jpg'),q=segs(b).find(x=>x.m===0xdb);b[q.at+5]=0;await refused(decode(b,'image/jpeg'),'jpeg-table-invalid');
});
test('4408717322: a DHT before SOF0 with table id 2 or 3 is refused once the frame is known',async()=>{
 for(const th of [2,3])await refused(decode(beforeSof('baseline-37x23.jpg',dht(0,th,[0,1],[0])),'image/jpeg'),'jpeg-table-invalid');
 assert.equal((await decode(beforeSof('progressive-40x30.jpg',dht(0,2,[0,1],[0])),'image/jpeg')).width,40,'ids 2-3 stay legal for SOF2');
});
test('4408717328: SOS td and ta are each 0-3 even when the scan does not use that table',async()=>{
 const b=jpg('progressive-40x30.jpg'),ss=segs(b).filter(x=>x.m===0xda);
 const dcRef=ss.find(s=>b[s.at+5+2*b[s.at+4]]===0&&(b[s.at+7+2*b[s.at+4]]>>4)>0),ac=ss.find(s=>b[s.at+5+2*b[s.at+4]]>0);
 const c1=Buffer.from(b);c1[dcRef.at+6]=0x40|(c1[dcRef.at+6]&15);await refused(decode(c1,'image/jpeg'),'jpeg-table-invalid');
 const c2=Buffer.from(b);c2[ac.at+6]=0x70|(c2[ac.at+6]&15);await refused(decode(c2,'image/jpeg'),'jpeg-table-invalid');
 const c3=Buffer.from(b);c3[dcRef.at+6]=(c3[dcRef.at+6]&0xf0)|5;await refused(decode(c3,'image/jpeg'),'jpeg-table-invalid');
});
test('4408717330: in a sequential frame a component in a later scan again is refused',async()=>{
 const b=jpg('gray-12x10.jpg'),s=segs(b).find(x=>x.m===0xda),twice=insertAt(b,s.end,b.subarray(s.at,s.end));
 await refused(decode(twice,'image/jpeg'),'jpeg-scan-invalid');
});
test('4408717333: zTXt must be exactly one complete zlib stream (no trailing bytes, no second stream)',async()=>{
 const {bytes}=png(),tail=bytes.length-12,z=deflateSync(Buffer.from('map')),body=extra=>chunk('zTXt',Buffer.concat([Buffer.from('Comment\0\0','latin1'),z,extra]));
 for(const extra of [Buffer.from([0]),Buffer.from([1,2,3]),z])await refused(decode(Buffer.concat([bytes.subarray(0,tail),body(extra),bytes.subarray(tail)]),'image/png'),'png-chunk-invalid');
});
test('audit: DQT/DHT after the first scan are not redefinitions the decoder applies in order, so DQT after SOS is refused',async()=>{
 const b=jpg('progressive-40x30.jpg'),ss=segs(b).filter(x=>x.m===0xda),q=segs(b).find(x=>x.m===0xdb);
 await refused(decode(insertAt(b,ss[1].at,b.subarray(q.at,q.at+2+q.len)),'image/jpeg'),'jpeg-table-invalid');
});
test('audit: Huffman tables must form a valid prefix code (no over-subscription, no all-ones code), with legal, distinct symbols',async()=>{
 for(const [label,seg] of [['over-subscribed',dht(0,0,[3],[0,1,2])],['all-ones code',dht(0,0,[2],[0,1])],['DC symbol over 11',dht(0,0,[1],[12])],
  ['AC size over 10',dht(1,0,[1],[0x0b])],['duplicate symbol',dht(0,0,[0,2],[1,1])],['AC run with size 0 in a sequential frame',dht(1,0,[1],[0x30])]])
  await refused(decode(beforeSof('baseline-37x23.jpg',seg),'image/jpeg'),'jpeg-table-invalid');
 assert.equal((await decode(beforeSof('progressive-40x30.jpg',dht(1,2,[1],[0x30])),'image/jpeg')).width,40,'EOBn (RRRR0000) is legal in a progressive AC table');
});
test('audit: scan components follow frame order',async()=>{
 await refused(decode(withScanHeader((c,rest)=>Buffer.concat([Buffer.from([3,...c[1],...c[0],...c[2]]),rest])),'image/jpeg'),'jpeg-scan-invalid');
});
test('audit: pHYs pixels-per-unit stay within 2^31-1, and zTXt text has no NUL',async()=>{
 await refused(decode(png({extra:[chunk('pHYs',Buffer.from([0x80,0,0,0,0,0,11,19,1]))]}).bytes,'image/png'),'png-chunk-invalid');
 const {bytes}=png(),tail=bytes.length-12;await refused(decode(Buffer.concat([bytes.subarray(0,tail),zTXt('Comment',0,'a\0b'),bytes.subarray(tail)]),'image/png'),'png-chunk-invalid');
});
