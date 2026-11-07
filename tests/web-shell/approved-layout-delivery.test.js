import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectApprovedDelivery,verifyApprovedDeliveryBody} from '../../e2e/approved-layout-delivery.mjs';
const revision='b749c9c8246fd178a6c70604ef1037a1bed0e2804ba618750a2aec1de4d9a10e';
const ledgerBytes=readFileSync(new URL(`../../apps/web/public/content/delivery/eng.MRK-1-1-13/${revision}.json`,import.meta.url));
const ledger=JSON.parse(ledgerBytes);
function fixture(id){const entry=ledger.entries.find(e=>e.path.includes('/'+id+'.'));const file={path:entry.path,defaultSize:entry.defaultSize,variants:Object.fromEntries(Object.entries(entry.variants).map(([size,v])=>[size,{sha256:v.delivery.sha256,bytes:v.delivery.bytes,mime:v.delivery.mime,deliveryURL:v.delivery.url}]))};return {manifest:{packId:ledger.packId,presentationRevision:ledger.presentationRevision,deliveryRevision:revision,files:[file]},ledgerBytes,logicalPath:entry.path};}
const pins={a112:['915c96c42de446ef5376db78b55949ac6ba0e407ecc4961671d940fad9e0bd04',124246],c197:['aa573008cb74e5fc274fcd566661e4442e4e9c47d65ddbd8ed8eb186a352cc72',316396],a203:['2411b167eff22c2c74f1fb0c857e49704f81f785e948eef25ea05e5194e480ed',76698]};
for(const [id,[sha256,bytes]]of Object.entries(pins))test(`actual ${id} default output is approved medium WebP and original source bytes are rejected`,()=>{const input=fixture(id),selected=selectApprovedDelivery(input);assert.equal(selected.size,'medium');assert.equal(selected.sha256,sha256);assert.equal(selected.bytes,bytes);assert.equal(selected.mime,'image/webp');const original=readFileSync(new URL('../../apps/web/public'+input.logicalPath,import.meta.url));assert.throws(()=>verifyApprovedDeliveryBody(original,id==='c197'?'image/png':'image/jpeg',selected),/approved variant/);});
test('missing, ambiguous, wrong presentation, unsupported size, corrupted pin and wrong output fail closed',()=>{
 const input=fixture('a112');assert.throws(()=>selectApprovedDelivery({...input,logicalPath:'/missing.jpg'}),/Missing or ambiguous/);
 const duplicate=structuredClone(input.manifest);duplicate.files.push(duplicate.files[0]);assert.throws(()=>selectApprovedDelivery({...input,manifest:duplicate}),/Missing or ambiguous/);
 assert.throws(()=>selectApprovedDelivery({...input,manifest:{...input.manifest,presentationRevision:'0'.repeat(64)}}),/presentation identity/);
 assert.throws(()=>selectApprovedDelivery({...input,size:'large'}),/variant unavailable/);
 assert.throws(()=>selectApprovedDelivery({...input,ledgerBytes:Buffer.concat([ledgerBytes,Buffer.from(' ')])}),/pin mismatch/);
 const wrong=structuredClone(input.manifest);wrong.files[0].variants.medium.sha256='0'.repeat(64);assert.throws(()=>selectApprovedDelivery({...input,manifest:wrong}),/output identity/);
});
