import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreparationOutcomes} from '../../server/fia/preparation/source-join-decisions.mjs';

// Review 5702095473 N1: the per-pack turn has one overall deadline. A stalled turn releases the pack at the deadline, its outcome is
// dropped (never committed), and while it still runs a later turn of that pack holds no outcome (base plus demand). Pure Node.
const later=ms=>new Promise(r=>setTimeout(()=>r('timed-out'),ms));
const gate=()=>{let open;const p=new Promise(r=>open=r);return {p,open};};

test('a stalled turn does not block the next turn past the deadline, and neither settles the pack',async()=>{
 const o=createPreparationOutcomes({turnDeadlineMs:100}),stall=gate(),seen={};
 const B=o.run('p',async()=>{o.hold('p',{state:'retained'});o.joined('p',{state:'ready'});await stall.p;return seen.B=o.current('p');});
 const A=o.run('p',async()=>{o.hold('p',{state:'retained'});return seen.A=o.current('p');});
 assert.notEqual(await Promise.race([A,later(2000)]),'timed-out','A ran once the deadline released B\'s turn');
 assert.equal(seen.A,null,'A holds no outcome while B still runs');
 stall.open();await B;
 assert.equal(seen.B,null,'B\'s outcome was dropped at the deadline; its late publish commits nothing');
 const C=await o.run('p',async()=>{o.hold('p',{state:'unavailable',reason:'interrupted'});return o.current('p');});
 assert.deepEqual(C,{state:'unavailable',reason:'interrupted'},'once B has finished, turns hold their own outcome again');
});

test('a turn within the deadline keeps its own outcome; a failed turn releases the pack; packs do not wait on each other',async()=>{
 const o=createPreparationOutcomes({turnDeadlineMs:1000}),slow=gate();
 const other=o.run('q',async()=>{await slow.p;return 'q';});
 const own=await o.run('p',async()=>{o.hold('p',{state:'retained'});await later(20);return o.current('p');});
 assert.deepEqual(own,{state:'retained'});
 await assert.rejects(o.run('p',async()=>{throw Error('resolve-failed');}),/resolve-failed/);
 assert.equal(await Promise.race([o.run('p',async()=>o.current('p')),later(500)]),null,'the next turn starts at once with an empty outcome');
 slow.open();assert.equal(await other,'q');
 assert.throws(()=>createPreparationOutcomes({turnDeadlineMs:0}),/preparation-turn-deadline/);
});
