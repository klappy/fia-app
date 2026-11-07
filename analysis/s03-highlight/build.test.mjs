import test from 'node:test';import assert from 'node:assert/strict';
import {buildS03Proposal,loadInputs} from './build.mjs';
import {activityWords} from '../../apps/web/src/lib/transcript.js';
test('three complete source-bound rows repair structural rejection without changing ranges or other rows',()=>{
 const input=loadInputs(),p=buildS03Proposal(input);assert.equal(p.status,'UNAPPROVED-LOCAL-PROPOSAL');assert.deepEqual(p.rows.map(r=>r.id),['S03-U009','S03-U010','S03-U015']);assert.equal(p.counts.beforeStaticAlignedRows,5);assert.equal(p.counts.proposalStaticAlignedRows,8);assert.equal(p.counts.recordingAdmissions,0);
 for(const [id,a] of Object.entries(input.before.activities)){if(p.rows.some(r=>r.id===id)){assert.equal(p.sidecar.activities[id].startMs,a.startMs);assert.equal(p.sidecar.activities[id].endMs,a.endMs);}else assert.deepEqual(p.sidecar.activities[id],a);}
 assert.deepEqual(p.sidecar.words,input.before.words);assert.equal(activityWords(p.sidecar.activities['S03-U024']),null);
});
test('source, display, clock and raw timestamp corruption fail closed',()=>{
 for(const change of [i=>i.raw.recordingSha256='a'.repeat(64),i=>i.raw.clockDomain='native-mp3',i=>i.clock.mapping.offsetSeconds=0.03,i=>i.clockAnalysis.delivery.sha256='a'.repeat(64),i=>i.raw.words[239].endSeconds=i.raw.words[239].startSeconds,i=>i.raw.words[245].text='Different',i=>i.pack.activities.find(a=>a.id==='S03-U009').sourceText+=' changed']){const input=loadInputs();change(input);assert.throws(()=>buildS03Proposal(input));}
});
test('every proposed interval is an unchanged complete raw-word estimate projected through the pinned mapping',()=>{
 const input=loadInputs(),p=buildS03Proposal(input);
 for(const row of p.rows)for(const d of row.deltas){const w=input.raw.words[d.sourceWordIndex];assert.equal(d.proposal.startMs,Math.round(w.startSeconds*1000));assert.equal(d.proposal.endMs,Math.round(w.endSeconds*1000));assert.equal(d.rawText,w.text);}
});
