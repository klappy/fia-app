import test from 'node:test';import assert from 'node:assert/strict';
import {createWorker} from '../../server/faces/worker/adapter.mjs';
import {exportSnapshot} from '../../server/faces/worker/export-snapshot.mjs';
import {snapshotStorage} from '../../server/faces/worker/snapshot.mjs';
import {createHash} from 'node:crypto';
const origin='https://dev.fiaguide.app';
// Synthetic transport-only fixture. This never supplies production publication authority.
function fixture(){let calls=0;const face=(req,res)=>{calls++;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({method:req.method}));};return {worker:createWorker({origin,operations:{},serveRead:face,serveMcp:face}),calls:()=>calls};}
test('reserved routes enforce exact origin while static routes retain asset behavior',async()=>{
 const {worker,calls}=fixture();const env={ASSETS:{fetch:()=>new Response('unchanged-static')}};
 for(const headers of [{},{Origin:origin}])assert.equal((await worker.fetch(new Request(origin+'/v1/packs/x',{headers}),env)).status,200);
 for(const Origin of ['null','https://evil.test',origin+'/','http://dev.fiaguide.app'])assert.equal((await worker.fetch(new Request(origin+'/mcp',{headers:{Origin}}),env)).status,403);
 for(const base of ['http://dev.fiaguide.app','https://staging.fiaguide.app','https://dev.fiaguide.app:444'])assert.equal((await worker.fetch(new Request(base+'/v1'),env)).status,403);
 assert.equal((await worker.fetch(new Request(origin+'/mcp/nope'),env)).status,404);
 assert.equal(await(await worker.fetch(new Request(origin+'/activity/1'),env)).text(),'unchanged-static');assert.equal(calls(),2);
});
test('build export enforces approved byte identity and snapshot reads are immutable',()=>{
 const content='fixture JSON bytes',sha256=createHash('sha256').update(content).digest('hex'),descriptor={sha256,bytes:Buffer.byteLength(content),mime:'application/json',path:'/v1/artifacts/'+sha256};
 const record={status:'ready',packId:'fixture',revision:sha256,artifact:descriptor};
 const service={readPack:()=>record,readArtifact:()=>({status:'ready',artifact:descriptor,content})};
 const authority={publicationSourceCommit:'a'.repeat(40),publicationRecipeCommit:'b'.repeat(40),hostingRecipeCommit:'c'.repeat(40),artifacts:[{packId:'fixture',sha256,bytes:descriptor.bytes,envelopeSha256:createHash('sha256').update(JSON.stringify(record)).digest('hex'),current:true}]};
 const snapshot=exportSnapshot(service,authority),store=snapshotStorage(snapshot);
 store.readCatalog('fixture').packId='changed';assert.equal(store.readCatalog('fixture').packId,'fixture');assert.equal(store.readCatalog('fixture','missing').reason,'revision-not-found');
 assert.equal(store.findArtifact(sha256).content,content);assert.throws(()=>exportSnapshot({...service,readArtifact:()=>({status:'ready',artifact:descriptor,content:content+' '})},authority),/invalid-artifact/);
 assert.throws(()=>exportSnapshot({...service,readPack:()=>({...record,capability:'invented'})},authority),/unaccepted-record/);
 assert.throws(()=>exportSnapshot(service,{...authority,publicationSourceCommit:''}),/missing-authority/);
 assert.throws(()=>snapshotStorage({...snapshot,current:{fixture:'missing'}}),/invalid-current/);
});
