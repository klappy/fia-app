import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {verifyVideoReplacement} from '../../scripts/video-publication.mjs';import {validateDelivery,readVerifiedMedia} from '../../apps/web/src/lib/media-delivery.js';
const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(id='a13'){
 const evidence=new Map();const put=x=>{const b=Buffer.from(JSON.stringify(x)),h=sha(b);evidence.set(h,b);return h;};
 const input=Buffer.from('higher resolution fixture '+id),old=Buffer.from('old fixture '+id),output=Buffer.from('qualified fixture '+id),path='/assets/'+id+'.mp4',url='https://publisher.example/'+id+'.mp4',packId='eng.MRK-1-1-13',revision='a'.repeat(64);
 const metadata={repository:'publisher/repo',revision:'b'.repeat(40),path:'eng/'+id+'.json',contentId:id,assetVersion:'1.0.4',collectionVersion:'1.1.2'};
 metadata.sha256=put([{content_id:id,version:'1.0.4',content:`<a href='${url}'>video</a>`}]);
 const rights={metadataPath:'metadata.json',holder:'Publisher',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/'};rights.metadataSha256=put({resource_metadata:{version:'1.1.2',license_info:{copyright:{holder:{name:rights.holder}},licenses:[{eng:{url:rights.licenseUrl}}]}}});
 const published={url,sha256:sha(input),bytes:input.length,width:1280,height:720,duration:12};
 const review={recipeRevision:'recipe',evidenceUrl:'https://review.example/source'};review.evidenceSha256=put({status:'accepted',assetId:id,published,metadataSha256:metadata.sha256,rightsSha256:rights.metadataSha256});
 const row={id:'mapping-'+id,packId,presentationRevision:revision,assetId:id,path,bundled:{sha256:sha(old),bytes:old.length},published,metadata,rights,review};
 const delivery={kind:'video',mime:'video/mp4',format:'mp4',preset:'fia',q:'medium',status:'transformed',duration:12,width:960,height:540,videoCodec:'h264',audioCodec:'aac',encoderRevision:'e'.repeat(64),recipeRevision:'recipe',serverContractSha256:'c'.repeat(64),cacheKey:'video-v1/'+'f'.repeat(64)+'.mp4',url:`https://transcode.klappy.dev/video/preset=fia,q=medium,f=mp4/${url}`,sha256:sha(output),bytes:output.length};
 delivery.qualification={evidenceUrl:'https://review.example/output',evidenceSha256:put({status:'accepted',sourceSha256:published.sha256,sourceBytes:published.bytes,sourceUrl:url,delivery:{...delivery},allocationProof:{status:'accepted',maxApplicationPayloadBytes:output.length*3}})};
 const entry={path,logicalSource:{assetId:id,sha256:sha(old),bytes:old.length,ledgerEntryId:row.id},source:{url,sha256:published.sha256,bytes:input.length,provenance:{metadata,rights,review}},delivery,timing:{status:'not-applicable'}};
 const ledger={schema:1,entries:[row]},ledgerHash=put(ledger),sidecar={schema:2,packId,presentationRevision:revision,recipeRevision:'recipe',sourceLedger:{url:`/content/video-sources/${ledgerHash}.json`,sha256:ledgerHash,bytes:evidence.get(ledgerHash).length},entries:[entry]};
 const args={entry,ledger,pack:{assets:{[id]:{id,kind:'video',src:path}}},descriptor:{id:packId,revision},file:{path,sha256:sha(old),bytes:old.length},readEvidence:h=>evidence.get(h)};
 return {args,sidecar,output,evidence};
}
for(const id of ['a13','a184','a10'])test('same source-replacement validator binds three distinct identities: '+id,()=>{const f=fixture(id);validateDelivery(f.sidecar,{packId:f.sidecar.packId,presentationRevision:f.sidecar.presentationRevision});const proof=verifyVideoReplacement(f.args);assert.notEqual(proof.logicalSourceSha256,f.args.entry.source.sha256);assert.equal(proof.sourceBytes,f.args.entry.source.bytes);});
test('forged bundled/source/provenance/qualification and unknown mapping fail closed',()=>{
 for(const alter of [f=>f.args.entry.logicalSource.sha256='f'.repeat(64),f=>f.args.entry.source.sha256='f'.repeat(64),f=>f.args.entry.source.provenance.metadata={},f=>f.args.entry.delivery.bytes++,f=>f.args.entry.logicalSource.ledgerEntryId='unknown',f=>f.args.ledger.entries[0].metadata.assetVersion='1.1.2']){const f=fixture();alter(f);assert.throws(()=>verifyVideoReplacement(f.args));}
});
test('schema rejects legacy video, oversized output and URL options inconsistent with metadata',()=>{for(const alter of [f=>f.sidecar.schema=1,f=>f.args.entry.delivery.bytes=16777217,f=>f.args.entry.delivery.url=f.args.entry.delivery.url.replace('q=medium','q=high')]){const f=fixture();alter(f);assert.throws(()=>validateDelivery(f.sidecar,{packId:f.sidecar.packId,presentationRevision:f.sidecar.presentationRevision}));}});
test('video reader checks actual bytes and stops overrun before producing output',async()=>{const f=fixture(),file={group:'video',...f.args.entry.delivery};assert.deepEqual(Buffer.from(await readVerifiedMedia(new Response(f.output,{headers:{'Content-Type':'video/mp4'}}),file)),f.output);await assert.rejects(readVerifiedMedia(new Response(Buffer.concat([f.output,Buffer.from('x')]),{headers:{'Content-Type':'video/mp4'}}),file),/exceeded/);await assert.rejects(readVerifiedMedia(new Response('x'),{...file,bytes:16777217}),/limit/);});
test('actual finalizer publishes all three fixture replacements with distinct identities and keeps legacy raw inventory',async()=>{
 const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,cpSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFileSync}=await import('node:child_process');
 const root=mkdtempSync(join(tmpdir(),'fia-video-finalizer-'));const write=(path,bytes)=>{const full=join(root,path);mkdirSync(join(full,'..'),{recursive:true});writeFileSync(full,bytes);};
 try{
  const fixtures=['a13','a184','a10'].map(fixture),ledger={schema:1,entries:fixtures.flatMap(f=>f.args.ledger.entries)},ledgerBytes=Buffer.from(JSON.stringify(ledger)),ledgerHash=sha(ledgerBytes);
  const descriptor={id:'eng.MRK-1-1-13',revision:'a'.repeat(64),presentation:{url:'/content/packs/fixture.json'}},pack={assets:Object.assign({},...fixtures.map(f=>f.args.pack.assets)),activities:[]};
  const sidecar={...fixtures[0].sidecar,sourceLedger:{url:`/content/video-sources/${ledgerHash}.json`,sha256:ledgerHash,bytes:ledgerBytes.length},entries:fixtures.map(f=>f.args.entry)},sidecarBytes=Buffer.from(JSON.stringify(sidecar));
  write('dist/index.html','app');write('dist/content/registry.json',JSON.stringify({packs:[descriptor]}));write('dist'+descriptor.presentation.url,JSON.stringify(pack));write('dist'+sidecar.sourceLedger.url,ledgerBytes);write(`dist/content/delivery/${descriptor.id}/${sha(sidecarBytes)}.json`,sidecarBytes);
  for(const f of fixtures){write('dist'+f.args.entry.path,Buffer.from('old fixture '+f.args.entry.logicalSource.assetId));for(const [h,b]of f.evidence)write(`dist/content/video-evidence/${h}.json`,b);}
  write('apps/web/public/sw.js',readFileSync(new URL('../../apps/web/public/sw.js',import.meta.url)));cpSync(new URL('../../apps/web/docs',import.meta.url),join(root,'apps/web/docs'),{recursive:true});
  execFileSync(process.execPath,[new URL('../../scripts/finalize-build.mjs',import.meta.url).pathname],{cwd:root,stdio:'pipe'});
  const manifest=JSON.parse(readFileSync(join(root,`dist/offline/${descriptor.id}.json`))),legacy=JSON.parse(readFileSync(join(root,'dist/offline-manifest.json')));
  for(const f of fixtures){const current=manifest.files.find(x=>x.path===f.args.entry.path),old=legacy.files.find(x=>x.path===f.args.entry.path);assert.equal(current.sha256,f.args.entry.delivery.sha256);assert.equal(current.logicalSourceSha256,old.sha256);assert.equal(current.sourceSha256,f.args.entry.source.sha256);assert.notEqual(current.sha256,old.sha256);assert.equal(current.sourceBytes,f.args.entry.source.bytes);}
 }finally{rmSync(root,{recursive:true,force:true});}
});
