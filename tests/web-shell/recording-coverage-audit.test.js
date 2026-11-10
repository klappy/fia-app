import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {selectedGuideUnits,auditRecordingCoverage} from '../../scripts/audit-recording-coverage.mjs';
test('admitted selected units require exact revision, language and text identity',()=>{
 const pack={id:'eng.MRK-1-14-20',revision:'revision',language:'eng'};
 const presentation={activities:[{id:'unit',sourceUnitId:'source',sourceSha256:'text'},{id:'expansion',fulfills:'source'}]};
 const row={packId:pack.id,presentationRevision:pack.revision,language:'eng',edition:'fia-guide',activities:[{activityId:'unit',sourceUnitId:'source',sourceTextSha256:'text'}]};
 assert.equal(selectedGuideUnits(presentation,pack,[row])[0].admitted,true);
 for(const modified of [{...row,presentationRevision:'stale'},{...row,language:'spa'},{...row,activities:[{...row.activities[0],sourceTextSha256:'wrong'}]}])
  assert.equal(selectedGuideUnits(presentation,pack,[modified])[0].admitted,false);
 assert.equal(selectedGuideUnits(presentation,pack,[row]).length,1);
});
test('all330 packs separate discovery, exact admissions and local bytes without production acceptance',()=>{
 const audit=auditRecordingCoverage(fileURLToPath(new URL('../..',import.meta.url)));
 assert.equal(audit.packs.length,330);
 assert.deepEqual(Object.fromEntries(Object.entries(audit.groups).map(([k,g])=>[k,g.packs])),{'eng.MRK':68,'eng.LUK':97,'spa.MRK':68,'spa.LUK':97});
 assert.equal(audit.groups['eng.MRK'].admittedSelectedGuideUnits,8);
 const admitted=audit.packs.find(p=>p.id==='eng.MRK-1-14-20');
 assert.equal(admitted.guide.admittedSelectedUnits,8);
 assert.equal(admitted.discovery.grantsProductionPlayback,false);
 assert.match(admitted.productionPlayback,/unverified/);
 const packaged=audit.packs.find(p=>p.id==='eng.MRK-1-1-13');
 assert.equal(packaged.guide.localNonemptyUnits,111);
 assert.equal(packaged.scripture.assets.filter(a=>a.localNonempty).length,3);
 for(const pack of audit.packs) assert.equal(pack.discovery.grantsProductionPlayback,false);
});
