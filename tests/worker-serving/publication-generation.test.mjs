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

// F7a2 (OFFLINE L51-L53): bound narration audio becomes native manifest files at its exact delivery path.
test('bound approved audio maps to one native audio file per path; conflicts and unsafe paths fail',async()=>{
 const {nativeAudioFiles}=await import('../../server/fia/publication/publication-generation.mjs');
 const audio=(id,url,sha=h('a'),bytes=641001,mime='audio/ogg')=>({id,bytes:enc({schema:'fia-bound-narration-audio@1',id,delivery:{url,sha256:sha,bytes,mime},playbackRange:{startSeconds:1,endSeconds:9}})});
 const demand={id:'source-narration:S01-U001',bytes:enc({schema:'fia-bound-narration-demand@1',id:'source-narration:S01-U001',identity:{}})};
 const path=`/v1/approved-audio/${h('1')}/${h('a')}.ogg`;
 assert.deepEqual(nativeAudioFiles([audio('approved-audio:1',path),audio('approved-audio:2',path),demand]),[{path,group:'audio',sha256:h('a'),bytes:641001,mime:'audio/ogg'}],'two ranges of one recording are one file; demands add nothing');
 assert.throws(()=>nativeAudioFiles([audio('a',path),audio('b',path,h('b'))]),/bound-manifest-conflict/);
 for(const url of ['https://example.invalid/a.ogg','//host/a.ogg','/a.ogg?x=1','/v1/../a.ogg','/a#b'])assert.throws(()=>nativeAudioFiles([audio('a',url)]),/bound-audio-delivery-invalid/,url);
 assert.throws(()=>nativeAudioFiles([audio('a',path,h('a'),1,'video/mp4')]),/bound-audio-delivery-invalid/);
 const built=await buildBoundManifest(base(),{packId,executionRevision,baseRevision,mediaAssetsSha256},nativeAudioFiles([audio('a',path)]));
 assert.deepEqual(built.manifest.files,[...base().files,{path,group:'audio',sha256:h('a'),bytes:641001,mime:'audio/ogg'}]);
 await assert.rejects(buildBoundManifest(base(),{packId,executionRevision,baseRevision,mediaAssetsSha256},[{path:'/index.html',group:'audio',sha256:h('3'),bytes:10,mime:'audio/ogg'}]),/bound-manifest-conflict/,'a base path is never replaced');
});
