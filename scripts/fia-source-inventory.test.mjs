import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {inventory} from './fia-source-inventory.mjs';
import {canonicalJSONString,sha256} from '../server/fia/preparation/contract.mjs';
const row=(book='MRK',language='eng',extra={})=>({packId:`${language}.${book}-fixture`,presentationRevision:'a'.repeat(64),book,language,edition:'fia-guide',publisherSourceId:'fixture',publisherPassage:'fixture',stepId:'S01',sourceURL:'https://s3.amazonaws.com/cbbt-er.public/pericopes/fixture.mp3',sourceMetadataSha256:'b'.repeat(64),guideContentSha256:'c'.repeat(64),sourceUnits:[{sourceUnitId:'S01-U001',sourceTextSha256:'d'.repeat(64)}],...extra});
async function input(rows){const bytes=new TextEncoder().encode(canonicalJSONString({schema:'fia-published-guide-sources@1',rows}));return {bytes,sha256:await sha256(bytes)};}
test('real CLI deterministic output, shared URL overlap and missing versus empty coverage',async()=>{
 const f=await input([row(),row('LUK'),row('MRK','spa')]),dir=await mkdtemp(join(tmpdir(),'fia-inventory-test-'));
 try{const path=join(dir,'input.json');await writeFile(path,f.bytes);const run=()=>execFileSync(process.execPath,['scripts/fia-source-inventory.mjs',path,f.sha256],{encoding:'utf8'});assert.equal(run(),run());const result=JSON.parse(run());assert.equal(result.sources.length,1);assert.equal(result.markLukeOverlap.length,1);assert.equal(result.coverage.find(r=>r.book==='LUK'&&r.language==='spa').inputStatus,'not-in-input');assert.equal(result.coverage[0].totalCorpusDenominator,null);assert.equal(result.sources[0].observedBytesSha256,null);assert.ok(!run().includes('https://'));assert.throws(()=>execFileSync(process.execPath,['scripts/fia-source-inventory.mjs',path,'f'.repeat(64)],{stdio:'pipe'}),/Command failed/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('input order and duplicate snapshots do not change result; conflicting joins fail',async()=>{const a=await input([row()]),b=await input([row('LUK')]);assert.deepEqual(await inventory([a,b,a]),await inventory([b,a]));const conflict=await input([row('MRK','eng',{sourceURL:'https://s3.amazonaws.com/cbbt-er.public/pericopes/other.mp3'})]);await assert.rejects(inventory([a,conflict]),/conflicting-selection/);});
test('reuses publisher validation and never invokes network or store',async()=>{const old=globalThis.fetch;globalThis.fetch=()=>{throw Error('network forbidden');};try{await inventory([await input([row()])]);await assert.rejects(inventory([await input([row('MRK','eng',{sourceURL:'https://example.com/untrusted.mp3'})])]),/publisher/);}finally{globalThis.fetch=old;}});

test('unknown nested unit metadata is excluded from output and relationship identity',async()=>{const clean=row(),extra=row();extra.sourceUnits[0].privateLocalPath='/private/example-not-real';const a=await input([clean]),b=await input([extra]),result=await inventory([a,b]);assert.equal(result.relationships.length,1);assert.ok(!JSON.stringify(result).includes('/private'));assert.equal(result.relationships[0].relationshipId,(await inventory([a])).relationships[0].relationshipId);assert.deepEqual(await inventory([a,b]),await inventory([b,a]));});
