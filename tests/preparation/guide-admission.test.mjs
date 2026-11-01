import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveSelection,eligibleRows} from '../../server/fia/preparation/service.mjs';

const read=async path=>JSON.parse(await readFile(new URL('../../'+path,import.meta.url)));
const catalog=await read('server/fia/preparation/catalog.json');
const sources=await read('server/fia/preparation/guide-sources.json');
const bindings=await read('server/fia/compiler/presentation/source-bindings.json');
// The lazy original path refuses larger sources (original.mjs, source-store.mjs, guide-dispatch.mjs).
const LAZY_SOURCE_LIMIT=2*1024*1024;

test('every admitted guide row is an exact listing of its declared publisher source',()=>{
 for(const row of eligibleRows(catalog)){
  const s=row.selection,step=s.resource.replace(/^guide:/,'');
  const source=sources.rows.find(r=>r.packId===s.packId&&r.presentationRevision===s.presentationRevision&&r.language===s.language&&r.edition===s.edition&&r.stepId===step);
  assert.ok(source,s.resource);
  assert.equal(row.source.url,source.sourceURL,s.resource);
  assert.deepEqual(row.activities.map(({sourceUnitId,sourceTextSha256})=>({sourceUnitId,sourceTextSha256})),source.sourceUnits,s.resource);
  assert.ok(row.activities.every(a=>a.activityId===a.sourceUnitId),s.resource);
  assert.equal(row.scriptSha256,bindings[s.packId].guide,s.resource);
  assert.equal(row.unitsSha256,bindings[s.packId]['guide-units'],s.resource);
  const [,p,section,version]=/\/pericopes\/[a-z]{3}\/[a-z]{3}\/(p\d+)\/(s\d+)\/(v[\d.]+)\/vbr0\.mp3$/.exec(row.source.url);
  assert.equal(row.identity.sourceVersion,`publisher-${p}-${section}-${version}`,s.resource);
  for(const key of ['packId','presentationRevision','language','edition'])assert.equal(row.identity[key],s[key],s.resource);
  assert.equal(row.identity.recipeRevision,'fia-lazy-original-audio@1',s.resource);
  assert.ok(Number.isSafeInteger(row.source.bytes)&&row.source.bytes>0&&row.source.bytes<=LAZY_SOURCE_LIMIT,s.resource);
  assert.ok(row.accepted||row.blockedReason==='recording-timing-review-required',s.resource);
 }
});

test('Mark 1:14-20 guide S06 activities resolve to an admitted original preparation',async()=>{
 const pack=await read('apps/web/public/content/packs/eng.MRK-1-14-20/92ad518474f159f6567124052ae12d180a482c949509da0b725593442e62f746.json');
 const request=a=>({packId:'eng.MRK-1-14-20',presentationRevision:'92ad518474f159f6567124052ae12d180a482c949509da0b725593442e62f746',language:'eng',edition:'fia-guide',quality:'original',activityId:a.id,sourceUnitId:a.sourceUnitId,sourceTextSha256:a.sourceSha256});
 const s06=pack.activities.filter(a=>a.sourceUnitId?.startsWith('S06-'));
 assert.equal(s06.length,7);
 for(const activity of s06)assert.equal(resolveSelection(request(activity),catalog)?.selection.resource,'guide:S06',activity.id);
 const s01=pack.activities.filter(a=>a.sourceUnitId?.startsWith('S01-')&&a.kind==='guide');
 for(const activity of s01)assert.equal(resolveSelection(request(activity),catalog)?.selection.resource,'guide:S01',activity.id);
});
