import test from 'node:test';import assert from 'node:assert/strict';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
import {validateBaseManifest,buildBoundManifest,publicationGeneration,jsonDescriptor,validDescriptor,PUBLICATION_PIN_SCHEMA} from '../../server/fia/publication/publication-generation.mjs';
import {createExecutableWorkerOperations} from '../../server/fia/preparation/executable-presentation-runtime.mjs';
import {createExecutableOperations as previousOperations} from './fixtures/executable-operations-previous.mjs';

// F7a1 (OFFLINE-EXECUTION "Publication generations"): pure base-manifest validation, the bound manifest and
// the generation preimage, plus the Worker side of the deploy overlap for expectedPublicationGeneration.
const h=c=>c.repeat(64),packId='eng.MRK-1-14-20',baseRevision=h('b'),executionRevision=h('e'),mediaAssetsSha256=h('c');
const enc=v=>new TextEncoder().encode(JSON.stringify(v));
const base=(extra={})=>({schema:1,packId,presentationRevision:baseRevision,deliveryRevision:h('d'),revision:'d3336deace64',files:[{path:'/index.html',bytes:10,sha256:h('1'),group:'core'},{path:`/content/delivery/${packId}/${h('d')}.json`,bytes:10,sha256:h('3'),group:'core'},{path:'/audio/bsb/mrk-1.opus',bytes:641001,sha256:h('2'),group:'audio'}],...extra});

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
 const {deliveryRevision,...noDelivery}={...base(),files:base().files.filter(f=>!f.path.startsWith('/content/delivery/'))};const without=await buildBoundManifest(noDelivery,{packId,executionRevision,baseRevision,mediaAssetsSha256});
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
 assert.throws(()=>nativeAudioFiles([audio('a',path),audio('b',path,h('a'),5)]),/bound-manifest-conflict/);
 // Review N3: only the approved route, with the media segment equal to the sha and the extension matching the MIME.
 for(const [url,sha,mime] of [[path,h('b'),'audio/ogg'],[path,h('a'),'audio/mpeg'],[`/v1/approved-audio/${h('1')}/${h('a')}.wav`,h('a'),'audio/wav'],[`/audio/scripture/mrk-1.ogg`,h('a'),'audio/ogg']])assert.throws(()=>nativeAudioFiles([audio('a',url,sha,641001,mime)]),/bound-audio-delivery-invalid/,url+' '+mime);
 assert.equal(nativeAudioFiles([audio('a',`/v1/approved-audio/${h('1')}/${h('a')}.mp3`,h('a'),10,'audio/mpeg')])[0].mime,'audio/mpeg');
 for(const url of ['https://example.invalid/a.ogg','//host/a.ogg','/a.ogg?x=1','/v1/../a.ogg','/a#b'])assert.throws(()=>nativeAudioFiles([audio('a',url)]),/bound-audio-delivery-invalid/,url);
 assert.throws(()=>nativeAudioFiles([audio('a',path,h('a'),1,'video/mp4')]),/bound-audio-delivery-invalid/);
 const built=await buildBoundManifest(base(),{packId,executionRevision,baseRevision,mediaAssetsSha256},nativeAudioFiles([audio('a',path)]));
 assert.deepEqual(built.manifest.files,[...base().files,{path,group:'audio',sha256:h('a'),bytes:641001,mime:'audio/ogg'}]);
 await assert.rejects(buildBoundManifest(base(),{packId,executionRevision,baseRevision,mediaAssetsSha256},[{path:'/index.html',group:'audio',sha256:h('3'),bytes:10,mime:'audio/ogg'}]),/bound-manifest-conflict/,'a base path is never replaced');
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

// Review N5 (OFFLINE L97) and the real-base test: two actually built offline manifests from this tree,
// eng.MRK-1-14-20 (with a delivery sidecar and its BSB entry) and eng.MRK-1-21-28 (without one).
test('real bases: deliveryRevision presence and value are mirrored exactly; forged additions and omissions fail',async()=>{
 const {readFileSync}=await import('node:fs');const real=id=>JSON.parse(readFileSync(`tests/worker-serving/fixtures/offline/${id}.json`,'utf8'));
 for(const id of ['eng.MRK-1-14-20','eng.MRK-1-21-28']){
  const m=real(id),bytes=new TextEncoder().encode(JSON.stringify(m)),validated=validateBaseManifest(bytes,{packId:id,baseRevision:m.presentationRevision});
  const bound=await buildBoundManifest(validated,{packId:id,executionRevision,baseRevision:m.presentationRevision,mediaAssetsSha256});
  assert.equal(Object.hasOwn(bound.manifest,'deliveryRevision'),Object.hasOwn(m,'deliveryRevision'),id);assert.equal(bound.manifest.deliveryRevision,m.deliveryRevision,id);assert.deepEqual(bound.manifest.files,m.files,id);
  if(Object.hasOwn(m,'deliveryRevision')){
   assert.ok(m.files.some(f=>f.group==='audio'&&f.deliveryRevision===m.deliveryRevision),'the real base carries its BSB entry bound to the sidecar');
   const {deliveryRevision,...omitted}=m;assert.throws(()=>validateBaseManifest(new TextEncoder().encode(JSON.stringify(omitted)),{packId:id,baseRevision:m.presentationRevision}),/base-manifest-invalid/,'an omission with dependent files fails');
   for(const forged of [null,'0'.repeat(64),'x'])assert.throws(()=>validateBaseManifest(new TextEncoder().encode(JSON.stringify({...m,deliveryRevision:forged})),{packId:id,baseRevision:m.presentationRevision}),/base-manifest-invalid/,String(forged));
  }else{
   assert.throws(()=>validateBaseManifest(new TextEncoder().encode(JSON.stringify({...m,deliveryRevision:'0'.repeat(64)})),{packId:id,baseRevision:m.presentationRevision}),/base-manifest-invalid/,'a forged addition without a sidecar fails');
   assert.throws(()=>validateBaseManifest(new TextEncoder().encode(JSON.stringify({...m,files:[...m.files,{path:'/x.ogg',bytes:1,sha256:h('1'),group:'audio',deliveryURL:'https://transcode.klappy.dev/x'}]})),{packId:id,baseRevision:m.presentationRevision}),/base-manifest-invalid/,'a dependent file without a revision fails');
  }
  assert.throws(()=>validateBaseManifest(bytes,{packId:id,baseRevision:h('9')}),/base-manifest-invalid/,'a base manifest from another base revision');
 }
});

// Review N1 (OFFLINE L43): a row published by the previous builder still verifies under the current one.
test('a row published by fia-bound-manifest@1 still verifies under @2; @2 adds the bound audio file',async()=>{
 const {BOUND_MANIFEST_BUILDERS,CURRENT_BOUND_MANIFEST_BUILDER,boundManifestFor}=await import('../../server/fia/publication/publication-generation.mjs');
 assert.equal(CURRENT_BOUND_MANIFEST_BUILDER,'fia-bound-manifest@2');assert.deepEqual(Object.keys(BOUND_MANIFEST_BUILDERS),['fia-bound-manifest@1','fia-bound-manifest@2']);
 const path=`/v1/approved-audio/${h('1')}/${h('a')}.ogg`,boundArtifacts=[{id:'a',bytes:enc({schema:'fia-bound-narration-audio@1',id:'a',delivery:{url:path,sha256:h('a'),bytes:9,mime:'audio/ogg'},playbackRange:null})}];
 const identity={packId,executionRevision,baseRevision,mediaAssetsSha256};
 const bytes=enc(base()),ctx={packId,baseRevision};
 const v1=await boundManifestFor('fia-bound-manifest@1',bytes,ctx,identity,{boundArtifacts}),v2=await boundManifestFor('fia-bound-manifest@2',bytes,ctx,identity,{boundArtifacts});
 const {base:_b,...v1built}=v1;assert.deepEqual(v1built,await buildBoundManifest(base(),identity),'@1 ignores bound audio, exactly as the F7a1 deploy built it');
 assert.deepEqual(v2.manifest.files.at(-1),{path,group:'audio',sha256:h('a'),bytes:9,mime:'audio/ogg'});assert.notEqual(v1.descriptor.sha256,v2.descriptor.sha256);
});

// Review N-a: fia-bound-manifest@1 is pinned by golden bytes, so no later edit to shared code changes it.
// Review N-b: each version validates with its own frozen rules; a base the F7a1 deploy accepted (a delivery
// revision with no listed sidecar, which @2's parity rule refuses) still validates under @1.
test('fia-bound-manifest@1 output is pinned by golden bytes, and its own base validation is frozen',async()=>{
 const {boundManifestFor}=await import('../../server/fia/publication/publication-generation.mjs');
 const golden={schema:1,packId,presentationRevision:baseRevision,deliveryRevision:h('d'),revision:'golden',files:[{path:'/index.html',bytes:10,sha256:h('1'),group:'core'}]};
 const bytes=enc(golden),ctx={packId,baseRevision},identity={packId,executionRevision,baseRevision,mediaAssetsSha256};
 const v1=await boundManifestFor('fia-bound-manifest@1',bytes,ctx,identity);
 assert.equal(v1.descriptor.sha256,'7a08a98479c2e48d25aed33acb489c4170f46781003b812e33854bb0a4329201','golden @1 bytes: equal to what the F7a1 deploy (a220379) builds for these inputs');
 await assert.rejects(boundManifestFor('fia-bound-manifest@2',bytes,ctx,identity),/base-manifest-invalid/,'@2 parity refuses what @1 accepted');
 await assert.rejects(boundManifestFor('fia-bound-manifest@9',bytes,ctx,identity),/bound-manifest-builder-unknown/);
});

// Review N-c: a storage fault on the pre-work generation read is typed and non-final, never a 500.
test('a storage fault on the pre-work currentGeneration read answers typed interrupted',async()=>{
 const {createExecutableOperations}=await import('../../server/fia/publication/executable-operations.mjs');
 const storage={transaction:async fn=>fn({get:async()=>undefined,put:async()=>{}})},calls=[];
 const ops=createExecutableOperations({reads:{readPack:async()=>null},service:{request:async()=>{calls.push('request');return {status:'preparing',jobId:h('f')};}},publication:{currentGeneration:async()=>{throw new TypeError('storage gone');}},storage});
 const r=await ops.preparePresentation({packId,baseRevision,sourceRevision:'f8776d92b090b5af5b17b17dc1137f25fb059ed0',capability:'executable-presentation',expectedPublicationGeneration:h('6')});
 assert.deepEqual(r,{schema:'fia-presentation-preparation@1',status:'unavailable',jobId:null,reason:'interrupted',record:null});assert.deepEqual(calls,[]);
});
