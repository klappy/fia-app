import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { auditCorpus, auditPack, displayedScreens, exactResources, mediaDeclaration, readableText, localPayloadBindings } from '../../scripts/summit-coverage-audit.mjs';

test('exact resources never expands passage-wide available allowlist', () => {
  assert.deepEqual(exactResources({assetId:'focal',relatedAssetIds:['linked','focal'],availableAssetIds:['unrelated']}), ['focal','linked']);
});
test('together screen includes intro and displayed item relationships; separate items stay independent', () => {
  const pack={activities:[{id:'intro',relatedAssetIds:['map']},{id:'item',assetId:'image'},{id:'other',assetId:'term'}],
    listContracts:[{introId:'intro',itemIds:['item'],layout:'together'}]};
  assert.deepEqual(displayedScreens(pack), [{id:'intro',activityIds:['intro','item'],resources:['map','image']},
    {id:'other',activityIds:['other'],resources:['term']}]);
  pack.listContracts[0].layout='separate';
  assert.equal(displayedScreens(pack).length,3);
});
test('Scripture verses count as readable without top-level text', () => {
  assert.equal(readableText({verses:[{text:'Readable Scripture'}]}),true);
  assert.equal(readableText({text:' ',verses:[{text:''}]}),false);
});
test('catalog URLs, packaged flags, zero hashes and wrong revision cannot qualify delivery', () => {
  const descriptor={id:'eng.MRK-test',revision:'revision'};
  const asset={src:'/image.jpg',packaged:true,sourceEvidence:{url:'https://publisher/image.jpg',derivatives:[{sourceSha256:'0'.repeat(64),status:'pending-transcode'}]}};
  const entry={path:asset.src,source:{sha256:'a'.repeat(64),bytes:10},delivery:{sha256:'b'.repeat(64),bytes:8,mime:'image/webp',url:'https://delivery/image'}};
  assert.equal(mediaDeclaration(asset,descriptor).declaredDeliveryBound,false);
  assert.equal(mediaDeclaration(asset,descriptor).zeroHash,true);
  assert.equal(mediaDeclaration(asset,descriptor).pending,true);
  assert.equal(mediaDeclaration(asset,descriptor,[{packId:descriptor.id,presentationRevision:'stale',entries:[entry]}]).declaredDeliveryBound,false);
  const delivery={packId:descriptor.id,presentationRevision:descriptor.revision,entries:[entry]};
  assert.equal(mediaDeclaration(asset,descriptor,[delivery]).declaredDeliveryBound,true);
  entry.delivery.sha256='0'.repeat(64);
  assert.equal(mediaDeclaration(asset,descriptor,[delivery]).declaredDeliveryBound,false);
});
test('no catalog resource is distinct from a broken authored reference', () => {
  const result=auditPack({assets:{},activities:[{id:'one',relatedAssetIds:['missing']}],listContracts:[]},{id:'pack',revision:'rev'});
  assert.equal(result.resources.image.catalogued,0);
  assert.deepEqual(result.unknownReferences,[{screen:'one',asset:'missing'}]);
});
test('all published segmentation remains auditable without claiming missing content passes acceptance', () => {
  const root=fileURLToPath(new URL('../..',import.meta.url));
  const audit=auditCorpus(root);
  assert.equal(audit.totalPacks,330);
  assert.equal(audit.totalActivities,29097);
  assert.deepEqual(Object.fromEntries(Object.entries(audit.groups).map(([key,g])=>[key,g.packs])),
    {'eng.MRK':68,'eng.LUK':97,'spa.MRK':68,'spa.LUK':97});
  assert.equal(audit.packs.reduce((n,p)=>n+p.unknownReferences.length,0),0);
  for(const pack of audit.packs) assert.ok(pack.activities>0,pack.id);
  // Source inventories and packaged counters are deliberately independent dimensions.
  assert.equal(audit.groups['eng.MRK'].sourceMetadataPacks,68);
  assert.equal(audit.groups['eng.MRK'].admittedPreparationActivities,8);
  assert.equal(audit.groups['eng.MRK'].guideNarrationPackagedMetadata,111);
  for(const group of Object.values(audit.groups)) assert.equal(group.resources.scripture.readableInline,group.resources.scripture.catalogued);
});

test('reviewed compressed logical bytes are not mistaken for original or delivered derivative bytes', () => {
  const bytes=Buffer.from('reviewed compressed video');
  const logicalSource={sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
  const entry={logicalSource,source:{sha256:'a'.repeat(64),bytes:1000},delivery:{sha256:'b'.repeat(64),bytes:500}};
  assert.deepEqual(localPayloadBindings(bytes,[entry]),{source:false,logical:true,derivative:false});
  entry.variants={small:{delivery:logicalSource}};
  assert.deepEqual(localPayloadBindings(bytes,[entry]),{source:false,logical:true,derivative:true});
});
