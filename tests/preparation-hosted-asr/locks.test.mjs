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
