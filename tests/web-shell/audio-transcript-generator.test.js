import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('transcript generation rejects bad decodes and routes Spanish through the language helper',()=>{
 const result=spawnSync('python3',['-m','unittest','discover','-s','scripts/audio-transcripts','-p','test_*.py'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
