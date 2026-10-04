import test from 'node:test';import assert from 'node:assert/strict';
import {stableScreenshot} from '../../e2e/stable-screenshot.js';
test('requires consecutive identical captures, including after an unstable frame',async()=>{const frames=['a','b','b'];let index=0;const result=await stableScreenshot(async()=>Buffer.from(frames[index++]));assert.equal(result.attempts,3);assert.equal(result.image.toString(),'b');});
test('alternating captures exhaust the bound rather than accepting a repeated nonconsecutive frame',async()=>{let calls=0;await assert.rejects(stableScreenshot(async()=>Buffer.from(String(calls++%2)),{limit:4}),/did not settle within 4/);assert.equal(calls,4);});
