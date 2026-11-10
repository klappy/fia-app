import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildCandidate} from './build.mjs';
test('source-bound complete list maps pass existing guards without range extension', () => {
  const x = buildCandidate();
  for (const row of x.rows.filter(r => r.id !== 'S03-U024')) {
    assert.equal(row.proposedPassesRuntimeGuard, true, row.id);
    assert.deepEqual(row.tokenMismatches, []);
    assert.equal(row.proposedAfter.startMs, row.before.startMs);
    assert.equal(row.proposedAfter.endMs, row.before.endMs);
  }
  const john=x.rows.find(r=>r.id==='S03-U010');
  assert.equal(john.proposedAfter.words[0].rawWordIndex,245);
  assert.equal(john.proposedAfter.words[0].startMs,94340);
});
test('whole U024 alternate remains rejected; no fabricated durations or admission', () => {
  const x=buildCandidate(), row=x.rows.find(r=>r.id==='S03-U024');
  assert.equal(row.proposedPassesRuntimeGuard,false);
  assert.deepEqual(row.zeroDurationRawIndices,[801]);
  assert.equal(row.proposedAfter.words[0].rawWordIndex,781);
  assert.deepEqual([row.proposedAfter.words[0].startMs,row.proposedAfter.words[0].endMs],[287980,289080]);
  assert.equal(x.summary.admitted,0);
  assert.match(x.clockQualification,/BLOCKED/);
  assert.equal(row.boundaryReview.verdict,'hold-unsafe-edge');
});
