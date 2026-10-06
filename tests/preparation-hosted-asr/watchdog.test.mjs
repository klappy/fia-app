import test from 'node:test';
import assert from 'node:assert/strict';
import {runBoundedProcess} from '../../server/fia/preparation/hosted-asr/watchdog.mjs';
test('absolute deadline terminates actual TERM-resistant child',async()=>{const run=runBoundedProcess({command:process.execPath,args:['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],deadline:Date.now()+200,graceMs:50});const result=await run.completion;assert.equal(result.reason,'absolute-deadline');assert.equal(result.signal,'SIGKILL');assert.equal(result.stopVerified,true);});
test('output flood is bounded by actual process stop',async()=>{const run=runBoundedProcess({command:process.execPath,args:['-e',"setInterval(()=>process.stdout.write('x'.repeat(10000)),1)"],deadline:Date.now()+3000,maxOutputBytes:1000});assert.equal((await run.completion).reason,'output-limit');});
test('leader exit cannot cancel killing a detached-stdio descendant in same group',async t=>{
 const code=`const {spawn}=require('node:child_process');spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});setInterval(()=>{},1000);`;
 const run=runBoundedProcess({command:process.execPath,args:['-e',code],deadline:Date.now()+300,graceMs:50});
 t.after(()=>{try{process.kill(-run.pid,'SIGKILL');}catch{}});
 const result=await run.completion;assert.equal(result.reason,'absolute-deadline');assert.equal(result.stopVerified,true);
 assert.throws(()=>process.kill(-run.pid,0),error=>error.code==='ESRCH');
});
test('invalid output bounds cannot disable watchdog',()=>{for(const limit of [0,-1,Infinity,NaN,1.5])assert.throws(()=>runBoundedProcess({command:process.execPath,deadline:Date.now()+1000,maxOutputBytes:limit}));});
