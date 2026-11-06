import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {exportGuideSources} from '../../server/fia/compiler/presentation/export-guide-sources.mjs';
const sourceRevision='f8776d92b090b5af5b17b17dc1137f25fb059ed0';
function temporary(run){const outputRoot=mkdtempSync(join(tmpdir(),'fia-source-export-'));try{run(outputRoot);}finally{rmSync(outputRoot,{recursive:true,force:true});}}
test('canonical export includes every separately pinned Mark and Luke guide in both languages',()=>temporary(outputRoot=>{
 const descriptors=exportGuideSources({outputRoot,sourceRevision});
 const counts={};for(const descriptor of descriptors){const group=descriptor.packId.split('-')[0];counts[group]=(counts[group]||0)+1;const guide=JSON.parse(readFileSync(join(outputRoot,descriptor.staticPath)));assert.equal(guide.packId,descriptor.packId);assert.equal(guide.provenance.status,'source');assert.equal(descriptor.sourceRevision,sourceRevision);assert.equal(descriptor.bytes,Buffer.byteLength(JSON.stringify(guide)));}
 assert.deepEqual(counts,{'eng.MRK':68,'spa.MRK':68,'eng.LUK':97,'spa.LUK':97});
 assert.equal(new Set(descriptors.map(d=>d.packId)).size,330);
}));
test('corrupt second archive fails before writing even the valid first archive',()=>temporary(outputRoot=>{
 assert.throws(()=>exportGuideSources({outputRoot,sourceRevision,lukeArchiveBytes:Buffer.from('invalid')}),/canonical-source-archive-pin/);
 assert.equal(existsSync(join(outputRoot,'content')),false);
}));
test('Luke guide binding is required before any export is written',()=>temporary(outputRoot=>{
 const sourceBindings=JSON.parse(readFileSync(new URL('../../server/fia/compiler/presentation/source-bindings.json',import.meta.url)));
 delete sourceBindings['spa.LUK-24-36-53'];
 assert.throws(()=>exportGuideSources({outputRoot,sourceRevision,sourceBindings}),/canonical-source-guide-pin/);
 assert.equal(existsSync(join(outputRoot,'content')),false);
}));
test('export rejects another source revision without artifacts',()=>temporary(outputRoot=>{
 assert.throws(()=>exportGuideSources({outputRoot,sourceRevision:'0'.repeat(40)}),/canonical-source-revision/);
 assert.equal(existsSync(join(outputRoot,'content')),false);
}));
