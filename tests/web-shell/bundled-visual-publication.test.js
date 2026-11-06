import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {serveBundledVisual,BUNDLED_VISUAL_REVIEW_SHA256} from '../../server/fia/preparation/bundled-visual-publication.mjs';
const root=new URL('../../apps/web/public/',import.meta.url),read=p=>readFileSync(new URL(p.replace(/^\//,''),root));
const review=JSON.parse(readFileSync(new URL('../../server/fia/preparation/bundled-visual-review.json',import.meta.url)));
const origin='https://dev.fiaguide.app';
function setup({corrupt=false,mismatch=false,stale=false}={}){let reads=0;const env={FIA_API_ORIGIN:origin,FIA_ORIGINALS:new Proxy({},{get(){throw Error('R2 forbidden');}}),ASSETS:{async fetch(request){reads++;assert.equal(new URL(request.url).origin,origin);assert.ok(new URL(request.url).pathname.startsWith('/assets/mark-1-1-13/'));let bytes=read(new URL(request.url).pathname);if(corrupt)bytes=Buffer.from(bytes).fill(0);return new Response(bytes,{headers:{'Content-Type':request.url.endsWith('.png')?'image/png':'image/jpeg','Content-Length':String(bytes.length)}});}}};return {env,reads:()=>reads,options:{currentRevision:id=>stale?'0'.repeat(64):review.rows.find(r=>r.packId===id)?.revision,currentPresentation:async id=>{const rows=review.rows.filter(r=>r.packId===id);return {revision:rows[0]?.revision,assets:Object.fromEntries(rows.map(r=>[r.assetId,mismatch?{...r.asset,title:'wrong'}:r.asset]))};}}};}
const url=(row,suffix='manifest')=>`${origin}/v1/bundled-visuals/${row.packId}/${row.revision}/${suffix}`;
test('reviewed table is exact independently supplied pin and all46 authored bindings serve manifests',async()=>{
 assert.equal(createHash('sha256').update(readFileSync(new URL('../../server/fia/preparation/bundled-visual-review.json',import.meta.url))).digest('hex'),BUNDLED_VISUAL_REVIEW_SHA256);
 const s=setup();let count=0;for(const packId of new Set(review.rows.map(r=>r.packId))){const row=review.rows.find(r=>r.packId===packId),response=await serveBundledVisual(new Request(url(row)),s.env,s.options);assert.equal(response.status,200);const manifest=await response.json();count+=manifest.files.length;assert.equal(manifest.custody,'bundled-static');for(const f of manifest.files){assert.equal(f.visualPublication.reviewSha256,BUNDLED_VISUAL_REVIEW_SHA256);assert.equal(f.visualPublication.schema,'fia-bundled-visual@1');assert.equal(f.visualPublication.custody,'bundled-static');assert.equal(f.visualPublication.assetSha256.length,64);assert.ok(f.deliveryURL.includes('/'+BUNDLED_VISUAL_REVIEW_SHA256+'/'));if(packId==='eng.MRK-1-1-13'){assert.equal(f.visualPublication.sourceEvidenceSha256,null);assert.equal(f.visualPublication.bindingKind,'approved-default');assert.equal(f.visualPublication.approvedPublicationSha256,manifest.presentationRevision);}else{assert.equal(f.visualPublication.sourceEvidenceSha256.length,64);assert.equal(f.visualPublication.bindingKind,'canonical-source');assert.equal(f.visualPublication.approvedPublicationSha256,null);}}}
 assert.equal(count,46);
});
test('actual local bytes and HEAD are served without publisher/R2 access',async()=>{
 const row=review.rows.find(r=>r.packId==='eng.MRK-1-1-13'&&r.assetId==='c202'),s=setup(),target=url(row,`${BUNDLED_VISUAL_REVIEW_SHA256}/${row.assetId}/${row.sha256}`);
 const response=await serveBundledVisual(new Request(target),s.env,s.options);assert.equal(response.status,200);assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),row.sha256);
 const head=await serveBundledVisual(new Request(target,{method:'HEAD'}),s.env,s.options);assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(head.headers.get('Content-Length'),String(row.bytes));
});
test('stale revision, authored mismatch and unqualified binding never read static bytes',async()=>{
 const row=review.rows[0];for(const settings of [{stale:true},{mismatch:true}]){const s=setup(settings);assert.equal((await serveBundledVisual(new Request(url(row)),s.env,s.options)).status,409);assert.equal(s.reads(),0);}
 const s=setup();assert.equal((await serveBundledVisual(new Request(url(row,BUNDLED_VISUAL_REVIEW_SHA256+'/a999/'+'a'.repeat(64))),s.env,s.options)).status,404);assert.equal(s.reads(),0);
});
test('corrupt static bytes fail; foreign origin, query, Range and write methods refuse',async()=>{
 const row=review.rows[0],s=setup({corrupt:true});assert.equal((await serveBundledVisual(new Request(url(row)),s.env,s.options)).status,503);
 for(const [request,status] of [[new Request(url(row),{headers:{Origin:'https://evil.example'}}),403],[new Request(url(row)+'?src=https://evil.example'),400],[new Request(url(row),{headers:{Range:'bytes=0-10'}}),416],[new Request(url(row),{method:'POST'}),405]]){const f=setup();assert.equal((await serveBundledVisual(request,f.env,f.options)).status,status);assert.equal(f.reads(),0);}
});
