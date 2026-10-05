import test from 'node:test';
import assert from 'node:assert/strict';
import {runBoundedProcess} from '../../server/fia/preparation/hosted-asr/watchdog.mjs';
test('absolute deadline terminates actual TERM-resistant child',async()=>{const run=runBoundedProcess({command:process.execPath,args:['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],deadline:Date.now()+200,graceMs:50});const result=await run.completion;assert.equal(result.reason,'absolute-deadline');assert.equal(result.signal,'SIGKILL');assert.equal(result.stopVerified,true);});
test('output flood is bounded by actual process stop',async()=>{const run=runBoundedProcess({command:process.execPath,args:['-e',"setInterval(()=>process.stdout.write('x'.repeat(10000)),1)"],deadline:Date.now()+3000,maxOutputBytes:1000});assert.equal((await run.completion).reason,'output-limit');});
