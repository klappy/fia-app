import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJSONString,sha256,validatePreparedAudio,readPreparedAudio} from '../../server/fia/preparation/contract.mjs';
const h='a'.repeat(64),b='b'.repeat(64);
async function fixture(){
 const result={schema:'fia-prepared-audio@1',packId:'eng.MRK-1-14-20',language:'eng',edition:'publisher-v2',presentationRevision:h,sourceVersion:'v2',recipeRevision:'accepted-recipe@1',configSha256:b,source:{url:'https://publisher.example/p2.mp3',sha256:h,bytes:100,duration:60},delivery:{url:'https://transcode.example/p2.mp3',sha256:b,bytes:80,duration:60.1,mime:'audio/mpeg',quality:'medium'},provenance:'official-recording',evidence:{acceptanceSha256:h,recordingLedgerSha256:b,timingSha256:h},activities:[{activityId:'S01-U001',sourceUnitId:'S01-U001',sourceTextSha256:h,playbackRange:{startSeconds:9.2,endSeconds:13.3}},{activityId:'S01-U002',sourceUnitId:'S01-U002',sourceTextSha256:b,playbackRange:{startSeconds:14.66,endSeconds:24.9}}]};
 const bytes=new TextEncoder().encode(JSON.stringify(result)),{schema,source,delivery,provenance,evidence,activities,...identity}=result;
 const expected={resultSha256:await sha256(bytes),acceptanceSha256:evidence.acceptanceSha256,identity,source,delivery,evidence:{recordingLedgerSha256:evidence.recordingLedgerSha256,timingSha256:evidence.timingSha256},activities:activities.map(({playbackRange,...item})=>item)};
 return {result,bytes,expected:structuredClone(expected)};
}
test('byte-bound trusted manifest result validates and is detached',async()=>{
 const {result,bytes,expected}=await fixture();assert.deepEqual(await readPreparedAudio(bytes,expected),result);
 const copy=validatePreparedAudio(result,expected);copy.activities[0].playbackRange.startSeconds=0;assert.equal(result.activities[0].playbackRange.startSeconds,9.2);
 const pending=readPreparedAudio(bytes,expected);expected.identity.packId='caller-mutated';bytes.fill(0);assert.equal((await pending).packId,result.packId);
});
test('wrong passage edition source version config and text refuse trusted binding',async()=>{
 const {result,expected}=await fixture();
 for(const mutate of [r=>r.packId='eng.MRK-1-1-13',r=>r.language='spa',r=>r.edition='other',r=>r.presentationRevision=b,r=>r.sourceVersion='v3',r=>r.recipeRevision='other',r=>r.configSha256=h,r=>r.source.url='https://elsewhere.example/file',r=>r.source.sha256=b,r=>r.delivery.sha256=h,r=>r.delivery.quality='small',r=>r.activities[0].sourceTextSha256=b,r=>r.activities.reverse(),r=>r.evidence.acceptanceSha256=b,r=>r.evidence.timingSha256=b]){const changed=structuredClone(result);mutate(changed);assert.throws(()=>validatePreparedAudio(changed,expected));}
});
test('invalid ranges duplicates and permissive status fail closed',async()=>{
 const {result,expected}=await fixture();
 for(const mutate of [r=>r.activities[0].playbackRange.startSeconds=-1,r=>r.activities[0].playbackRange.endSeconds=61,r=>r.activities[0].playbackRange.startSeconds=13.3,r=>r.activities[0].playbackRange.endSeconds=NaN,r=>r.activities[1].playbackRange.startSeconds=10,r=>r.activities[1].activityId='S01-U001',r=>r.activities[1].sourceUnitId='S01-U001',r=>r.activities.pop(),r=>r.status='accepted',r=>r.provenance='synthetic',r=>r.evidence.acceptanceSha256=null]){const changed=structuredClone(result);mutate(changed);assert.throws(()=>validatePreparedAudio(changed,expected));}
});
test('actual bytes hash, JSON, byte limit and HTTPS are required',async()=>{
 const {result,bytes,expected}=await fixture();const changed=bytes.slice();changed[3]^=1;await assert.rejects(readPreparedAudio(changed,expected),/bytes-mismatch/);
 const bad=new TextEncoder().encode('{');await assert.rejects(readPreparedAudio(bad,{...expected,resultSha256:await sha256(bad)}),/json/);
 await assert.rejects(readPreparedAudio(new Uint8Array(2*1024*1024+1),expected));
 for(const url of ['http://publisher.example/p2.mp3','https://user:pass@publisher.example/p2.mp3','https://publisher.example/p2.mp3#fragment']){const r=structuredClone(result),e=structuredClone(expected);r.source.url=e.source.url=url;assert.throws(()=>validatePreparedAudio(r,e),/url/);}
});
test('canonical encoding stable and unsupported input rejected without executing getters',async()=>{
 assert.equal(canonicalJSONString({z:[1,true,null],a:'é'}),' {"a":"é","z":[1,true,null]}'.trim());
 assert.equal(await sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 for(const value of [undefined,NaN,Infinity,new Date(),[,],{a:undefined},'\ud800',Object.defineProperty({},'x',{enumerable:true,get(){throw Error('getter executed');}})])assert.throws(()=>canonicalJSONString(value),/unsupported/);
 const cycle={};cycle.x=cycle;assert.throws(()=>canonicalJSONString(cycle));
});
