import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyFile,verifyBundle,proposedDevConfig} from '../../deploy/hosted-asr/verify.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'fia-lock-'));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(join(root,'artifact'),'retained');return {root,entry:{path:'artifact',bytes:8,sha256:sha('retained')}};}
test('hashes retained bytes and exact size',async t=>{const {root,entry}=await fixture(t);assert.deepEqual(await verifyFile(root,entry),entry);});
test('rejects changed bytes even with same length',async t=>{const {root,entry}=await fixture(t);await writeFile(join(root,'artifact'),'modified');await assert.rejects(verifyFile(root,entry),/hash-mismatch/);});
test('rejects changed file size',async t=>{const {root,entry}=await fixture(t);await writeFile(join(root,'artifact'),'short');await assert.rejects(verifyFile(root,entry),/size-mismatch/);});
test('rejects traversal absolute and malformed lock paths',async t=>{const {root,entry}=await fixture(t);for(const path of ['../artifact','/artifact','x/../artifact','./artifact','x\\artifact','x//artifact'])await assert.rejects(verifyFile(root,{...entry,path}),/invalid-file-lock/);});
test('rejects symlink artifacts',async t=>{const {root,entry}=await fixture(t);await symlink(join(root,'artifact'),join(root,'alias'));await assert.rejects(verifyFile(root,{...entry,path:'alias'}),/symlink/);});
test('rejects invalid sizes and digests before I/O',async()=>{for(const bytes of [0,-1,NaN,Infinity,1.5])await assert.rejects(verifyFile('/nonexistent',{path:'a',bytes,sha256:sha('a')}),/invalid-file-lock/);await assert.rejects(verifyFile('/nonexistent',{path:'a',bytes:1,sha256:'accepted'}),/invalid-file-lock/);});
test('incomplete real lock cannot verify or produce DEV config',async()=>{const lock=JSON.parse(await readFile(new URL('../../deploy/hosted-asr/lock.template.json',import.meta.url)));for(const call of [verifyBundle,proposedDevConfig])await assert.rejects(call({directory:'/nonexistent',lock}),/missing-immutable-image-digests/);});
test('tagged image and foreign platform cannot pass deployment prerequisite',async()=>{const lock={schema:'fia-hosted-asr-lock@1',platform:'linux/amd64',baseImage:'python:3.12',finalImage:'fia:latest'};await assert.rejects(verifyBundle({directory:'/nonexistent',lock}),/immutable-image/);await assert.rejects(verifyBundle({directory:'/nonexistent',lock:{...lock,platform:'darwin/arm64'}}),/invalid-runtime-lock/);});
test('offline runner rejects unapproved pilot identities without loading model',async()=>{
 const {spawnSync}=await import('node:child_process');
 const script="import importlib.util; s=importlib.util.spec_from_file_location('runner','deploy/hosted-asr/recognize.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); j={'sourcePath':'/input/source.mp3','sourceSha256':m.PROPOSAL['source']['sha256'],'sourceBytes':m.PROPOSAL['source']['bytes']}; m.validate_input(j); j['sourceBytes']=True\ntry: m.validate_input(j)\nexcept ValueError: pass\nelse: raise AssertionError('boolean accepted')\nj['sourceBytes']=m.PROPOSAL['source']['bytes']; j['sourcePath']='/arbitrary'\ntry: m.validate_input(j)\nexcept ValueError: pass\nelse: raise AssertionError('arbitrary path accepted')";
 const result=spawnSync('python3',['-B','-c',script],{cwd:new URL('../../',import.meta.url),encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
test('Dockerfile pins verified registry manifest and has offline nonroot setup',async()=>{
 const root=new URL('../../deploy/hosted-asr/',import.meta.url);const lock=JSON.parse(await readFile(new URL('base-image.lock.json',root)));const docker=await readFile(new URL('Dockerfile',root),'utf8');assert.match(lock.image,/@sha256:[a-f0-9]{64}$/);assert.ok(docker.includes('FROM '+lock.image));assert.ok(docker.includes('--no-index'));assert.ok(docker.includes('--require-hashes'));assert.ok(docker.includes('USER 65532:65532'));assert.ok(docker.includes('HF_HUB_OFFLINE=1'));
});
test('Python raw segment serializer interoperates with actual JS artifact validator without ASR',async()=>{
 const {spawnSync}=await import('node:child_process');const {validateRawRecognition}=await import('../../server/fia/preparation/hosted-asr/artifact.mjs');
 const code="import importlib.util,sys; s=importlib.util.spec_from_file_location('runner','deploy/hosted-asr/recognize.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); segment={'id':0,'seek':0,'start':0.1,'end':0.8,'text':' Hello','tokens':[12],'avg_logprob':-0.1,'compression_ratio':1.0,'no_speech_prob':0.01,'words':[{'word':' Hello','start':0.1,'end':0.8,'probability':0.9}],'temperature':0.0}; sys.stdout.buffer.write(m.encode_result([segment],16000,'a'*64,{'python':'fixture','packages':{}},{**m.json.loads(m.Path('deploy/hosted-asr/transcribe-defaults.json').read_text()),'language':'en','condition_on_previous_text':False,'word_timestamps':True}))";
 const result=spawnSync('python3',['-B','-c',code],{cwd:new URL('../../',import.meta.url)});assert.equal(result.status,0,result.stderr.toString());const raw=JSON.parse(result.stdout);const expected={sourceSha256:raw.source.sha256,sourceBytes:raw.source.bytes,...Object.fromEntries(['modelSha256','runtimeSha256','scriptSha256','configSha256'].map(k=>[k,raw[k]]))};
 assert.equal(await validateRawRecognition(result.stdout,expected),true);assert.equal(raw.segments[0].avg_logprob,-0.1);assert.equal(raw.segments[0].compression_ratio,1);assert.equal(raw.segments[0].no_speech_prob,0.01);assert.equal(raw.text,' Hello');
 const tampered=structuredClone(raw);delete tampered.segments[0].avg_logprob;await assert.rejects(validateRawRecognition(new TextEncoder().encode(JSON.stringify(tampered)),expected),/raw-shape/);
});
test('preserved upstream model card bytes match recorded provenance',async()=>{
 const root=new URL('../../deploy/hosted-asr/notices/',import.meta.url);const receipt=JSON.parse(await readFile(new URL('provenance.json',root)));const bytes=await readFile(new URL(receipt.path,root));assert.equal(bytes.length,receipt.bytes);assert.equal(sha(bytes),receipt.sha256);assert.ok(receipt.url.includes('/536b0662742c02347bc0e980a01041f333bce120/'));assert.match(bytes.toString(),/license: mit/);
});
