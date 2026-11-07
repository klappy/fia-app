import test from 'node:test';
import assert from 'node:assert/strict';
import {bindVerifiedVisuals,visualSourcePath} from '../src/lib/verified-visuals.js';
import {canonicalPreparationJSON,preparationHash} from '../src/lib/prepared-audio.js';
const pack={id:'spa.LUK-1-1-4',revision:'a'.repeat(64)},rev='b'.repeat(64),asset={id:'c211',kind:'map',sourceEvidence:{id:'c211',url:'https://s3.amazonaws.com/cbbt-er.public/reviewed-source.png'}};
async function fixture(){const p={schema:'fia-verified-visual@1',packId:pack.id,presentationRevision:pack.revision,assetId:asset.id,kind:asset.kind,sourceEvidenceSha256:await preparationHash(canonicalPreparationJSON(asset.sourceEvidence)),recipeSha256:'c'.repeat(64),pixelsSha256:'d'.repeat(64),width:1,height:1};const f={visualPublication:p,path:`/packs/${pack.id}/visuals/c211.png`,group:'image',mime:'image/png',sha256:'e'.repeat(64),sourceSha256:'e'.repeat(64),bytes:10,sourceBytes:10,deliveryRevision:rev};f.deliveryURL=`/v1/verified-visuals/${pack.id}/${pack.revision}/${rev}/c211/${f.sha256}`;return f;}
test('verified current descriptor maps authored asset to logical path, never raw publisher URL',async()=>{
 const f=await fixture(),files=await bindVerifiedVisuals([f,f],pack,{c211:asset},rev);assert.equal(visualSourcePath('c211',asset,files),f.path);assert.equal(visualSourcePath('c211',asset,new Map()),undefined);
 assert.equal((await bindVerifiedVisuals([{path:'https://s3.amazonaws.com/raw'}],pack,{c211:asset},rev)).size,0);
});
test('wrong asset, source evidence, generation, zero hash, route or conflicting identity fail closed',async()=>{
 const f=await fixture();for(const patch of [{assetId:'other'},{kind:'image'},{packId:'eng.LUK-1-1-4'},{presentationRevision:'f'.repeat(64)},{sourceEvidenceSha256:'f'.repeat(64)}])await assert.rejects(bindVerifiedVisuals([{...f,visualPublication:{...f.visualPublication,...patch}}],pack,{c211:asset},rev));
 for(const patch of [{sha256:'0'.repeat(64)},{bytes:0},{deliveryRevision:'f'.repeat(64)},{deliveryURL:'https://s3.amazonaws.com/raw'},{path:'/arbitrary.png'}])await assert.rejects(bindVerifiedVisuals([{...f,...patch}],pack,{c211:asset},rev));
 await assert.rejects(bindVerifiedVisuals([f,{...f,visualPublication:{...f.visualPublication,width:2}}],pack,{c211:asset},rev));
});
test('prepared presentations keep their explicit canonical media identity',async()=>{
 const f=await fixture(),prepared={id:pack.id,revision:'f'.repeat(64),mediaIdentity:{packId:pack.id,revision:pack.revision}};assert.equal((await bindVerifiedVisuals([f],prepared,{c211:asset},rev)).size,1);
});
test('online and saved prepared descriptors share one binding despite planner annotation',async()=>{
 const online=await fixture(),saved={...online,selectedSize:'prepared'};
 for(const files of [[online,saved],[saved,online]]){
  const bound=await bindVerifiedVisuals(files,pack,{c211:asset},rev);
  assert.equal(bound.size,1);assert.equal(visualSourcePath('c211',asset,bound),online.path);
 }
});
test('planner annotation cannot conceal changed bytes, routes or publication proofs',async()=>{
 const online=await fixture(),saved={...online,selectedSize:'prepared'};
 for(const patch of [{sha256:'f'.repeat(64),sourceSha256:'f'.repeat(64)},{bytes:11,sourceBytes:11},{deliveryURL:online.deliveryURL+'x'},{visualPublication:{...online.visualPublication,pixelsSha256:'f'.repeat(64)}},{visualPublication:{...online.visualPublication,recipeSha256:'f'.repeat(64)}}])await assert.rejects(bindVerifiedVisuals([online,{...saved,...patch}],pack,{c211:asset},rev));
});
