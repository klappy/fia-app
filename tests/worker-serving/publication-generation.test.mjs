import test from 'node:test';import assert from 'node:assert/strict';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
import {validateBaseManifest,buildBoundManifest,publicationGeneration,jsonDescriptor,validDescriptor,PUBLICATION_PIN_SCHEMA} from '../../server/fia/publication/publication-generation.mjs';
import {createExecutableWorkerOperations} from '../../server/fia/preparation/executable-presentation-runtime.mjs';
import {createExecutableOperations as previousOperations} from './fixtures/executable-operations-previous.mjs';

// F7a1 (OFFLINE-EXECUTION "Publication generations"): pure base-manifest validation, the bound manifest and
// the generation preimage, plus the Worker side of the deploy overlap for expectedPublicationGeneration.
const h=c=>c.repeat(64),packId='eng.MRK-1-14-20',baseRevision=h('b'),executionRevision=h('e'),mediaAssetsSha256=h('c');
const enc=v=>new TextEncoder().encode(JSON.stringify(v));
const base=(extra={})=>({schema:1,packId,presentationRevision:baseRevision,deliveryRevision:h('d'),revision:'d3336deace64',files:[{path:'/index.html',bytes:10,sha256:h('1'),group:'core'},{path:'/audio/bsb/mrk-1.opus',bytes:641001,sha256:h('2'),group:'audio'}],...extra});

test('the retained base manifest must be this pack, this base revision, numeric schema 1 and well-formed',()=>{
 assert.equal(validateBaseManifest(enc(base()),{packId,baseRevision}).packId,packId);
 for(const bad of [{schema:'1'},{packId:'spa.MRK-1-14-20'},{presentationRevision:h('c')},{deliveryRevision:null},{deliveryRevision:'x'},{files:[]},{files:[{path:'x',bytes:1,sha256:h('1'),group:'core'}]},{files:[{path:'/a',bytes:1,sha256:h('1'),group:'core'},{path:'/a',bytes:1,sha256:h('1'),group:'core'}]},{revision:''}])assert.throws(()=>validateBaseManifest(enc(base(bad)),{packId,baseRevision}),/base-manifest-invalid/,JSON.stringify(bad));
 assert.throws(()=>validateBaseManifest(new Uint8Array([0xff]),{packId,baseRevision}),/base-manifest-invalid/);
});

test('the bound manifest mirrors the base and its deliveryRevision presence exactly, and is deterministic',async()=>{
 const withDelivery=await buildBoundManifest(base(),{packId,executionRevision,baseRevision,mediaAssetsSha256});
 assert.deepEqual(Object.keys(withDelivery.manifest).sort(),['deliveryRevision','executionRevision','files','id','mediaAssetsSha256','mediaIdentity','packId','presentationRevision','revision','schema']);
 assert.equal(withDelivery.manifest.deliveryRevision,h('d'));assert.deepEqual(withDelivery.manifest.mediaIdentity,{packId,revision:baseRevision});assert.deepEqual(withDelivery.manifest.files,base().files);
 const {id,revision,...content}=withDelivery.manifest;assert.equal(revision,await sha256(new TextEncoder().encode(canonicalJSONString(content))));assert.equal(id,`bound-offline:${revision}`);
 assert.deepEqual(withDelivery.descriptor,{id,sha256:await sha256(withDelivery.bytes),bytes:withDelivery.bytes.length,mime:'application/json'});assert.ok(validDescriptor(withDelivery.descriptor));
 const {deliveryRevision,...noDelivery}=base();const without=await buildBoundManifest(noDelivery,{packId,executionRevision,baseRevision,mediaAssetsSha256});
 assert.equal(Object.hasOwn(without.manifest,'deliveryRevision'),false,'absent in the base, absent here');
 assert.deepEqual(await buildBoundManifest(base(),{packId,executionRevision,baseRevision,mediaAssetsSha256}),withDelivery);
 await assert.rejects(buildBoundManifest(base(),{packId:'spa.MRK-1-14-20',executionRevision,baseRevision,mediaAssetsSha256}),/bound-manifest-identity/);
});

test('the generation hashes the closed canonical preimage; any changed descriptor or source revision moves it',async()=>{
 const baseBytes=enc(base()),baseDigest=await sha256(baseBytes),baseManifest=jsonDescriptor(`base-offline:${baseDigest}`,baseBytes,baseDigest);
 const bound=await buildBoundManifest(base(),{packId,executionRevision,baseRevision,mediaAssetsSha256}),artifacts=[{id:'source-narration:S01-U001',sha256:h('a'),bytes:300,mime:'application/json'}];
 const args={packId,executionRevision,baseRevision,sourceRevision:'f8776d92b090b5af5b17b17dc1137f25fb059ed0',baseManifest,mediaManifest:bound.descriptor,artifacts};
 const {preimage,generation}=await publicationGeneration(args);
 assert.deepEqual(Object.keys(preimage).sort(),['artifacts','baseManifest','baseRevision','executionRevision','mediaManifest','packId','schema','sourceRevision']);assert.equal(preimage.schema,'fia-executable-publication-generation@1');
 assert.equal(generation,await sha256(new TextEncoder().encode(canonicalJSONString(preimage))));
 // Two builds with byte-different shells: same presentation, different base manifest, different generation.
 const shellB=enc(base({files:[{path:'/index.html',bytes:11,sha256:h('9'),group:'core'},base().files[1]]})),shellDigest=await sha256(shellB);
 const other=await publicationGeneration({...args,baseManifest:jsonDescriptor(`base-offline:${shellDigest}`,shellB,shellDigest)});assert.notEqual(other.generation,generation);
 assert.notEqual((await publicationGeneration({...args,sourceRevision:'0'.repeat(40)})).generation,generation);
 assert.notEqual((await publicationGeneration({...args,artifacts:[]})).generation,generation);
 await assert.rejects(publicationGeneration({...args,baseManifest:{...baseManifest,id:'base-offline:'+h('0')}}),/generation-preimage-invalid/);
 assert.equal(PUBLICATION_PIN_SCHEMA,'fia-executable-publication-pin@1');
});

// J0 widened (PLAN §3 versions overlap): a page holding a demand with expectedPublicationGeneration may meet
// a FiaPreparationJobs object still on the previous build, whose operations refuse the unknown key. The
// Worker retries once without it, so the demand is still answered (never a 400 or 500).
test('frozen previous object: a demand carrying expectedPublicationGeneration is answered by the previous build',async()=>{
 const seen=[];const storage={transaction:async fn=>fn({get:async()=>undefined,put:async()=>{}})};
 const previous=previousOperations({reads:{readPack:async()=>({status:'unavailable'})},service:{request:async args=>{seen.push(Object.keys(args).sort().join());return {status:'preparing',jobId:h('f')};}},publication:null,storage});
 const stub={fetch:async request=>{const operation=new URL(request.url).pathname.split('/').pop();return Response.json(await previous[operation](await request.json()));}};
 const ops=createExecutableWorkerOperations({env:{FIA_PREPARATION_JOBS:{idFromName:()=>'root',get:()=>stub},FIA_ORIGINALS:{}},fallback:null});
 const demand={packId,baseRevision,sourceRevision:'f8776d92b090b5af5b17b17dc1137f25fb059ed0',capability:'executable-presentation'};
 for(const expectedPublicationGeneration of [null,h('9')]){const r=await ops.preparePresentation({...demand,expectedPublicationGeneration});assert.equal(r.status,'preparing');}
 assert.deepEqual(seen,['baseRevision,capability,packId,sourceRevision','baseRevision,capability,packId,sourceRevision']);
 assert.deepEqual(await ops.preparePresentation({...demand,expectedPublicationGeneration:'bad'}),{status:'refused',code:'invalid-request'},'retried, and the previous build refuses its own malformed input');
});

// PR295 review B1 (OFFLINE L39 "compare it with the current pointer before work"): a supplied, stale
// expectation is refused typed before the presentation service starts or joins any durable work.
test('a stale expectedPublicationGeneration is refused before any service work, even while the job is not ready',async()=>{
 const {createExecutableOperations}=await import('../../server/fia/publication/executable-operations.mjs');
 const calls=[];const storage={transaction:async fn=>fn({get:async()=>undefined,put:async()=>{}})};
 const service={request:async()=>{calls.push('request');return {status:'preparing',jobId:h('f')};}};
 const publication={currentGeneration:async()=>h('6'),publish:async()=>{calls.push('publish');return {status:'ready'};}};
 const ops=createExecutableOperations({reads:{readPack:async()=>null},service,publication,storage});
 const demand={packId,baseRevision,sourceRevision:'f8776d92b090b5af5b17b17dc1137f25fb059ed0',capability:'executable-presentation'};
 for(const expectedPublicationGeneration of [h('7'),null])assert.deepEqual(await ops.preparePresentation({...demand,expectedPublicationGeneration}),{schema:'fia-presentation-preparation@1',status:'blocked',jobId:null,reason:'publication-generation-stale',record:null});
 assert.deepEqual(calls,[],'no durable work starts or is joined');
 assert.equal((await ops.preparePresentation({...demand,expectedPublicationGeneration:h('6')})).status,'preparing');assert.deepEqual(calls,['request'],'a current expectation proceeds');
 assert.equal((await ops.preparePresentation(demand)).status,'preparing','a legacy demand without the field is unchanged');
});
