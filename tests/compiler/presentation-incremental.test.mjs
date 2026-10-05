import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,readdirSync,unlinkSync,symlinkSync,cpSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {preparePresentation,presentationBuildKey,validateCacheDirectory} from '../../server/fia/compiler/presentation/incremental.mjs';
import {digest,compilePresentation,validatePresentationInput} from '../../server/fia/compiler/presentation/compile.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const source=join(root,'server/fia/compiler/presentation');
const json=path=>JSON.parse(readFileSync(path));
const bundled=JSON.parse(gunzipSync(readFileSync(join(source,'source-packs.json.gz'))));
const lists=json(join(source,'lists.json')),examples=json(join(source,'examples.json'));
const ids=['eng.MRK-1-14-20','spa.MRK-1-14-20'];
function inputs(id){return {input:structuredClone(bundled.packs[id]),options:{listEvidence:structuredClone(lists.packs.find(p=>p.packId===id)),exampleEvidence:structuredClone(examples.packs.find(p=>p.packId===id)),sourceFiles:bundled.inventory.filter(f=>f.path.startsWith(`data/packs/${id}/`)).sort((a,b)=>a.path<b.path?-1:1)}};}
function workspace(t){const dir=mkdtempSync(join(tmpdir(),'fia-e-reuse-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return {dir,output:join(dir,'output'),cache:join(dir,'cache')};}
function run(w,extra=[],ok=true){const result=spawnSync(process.execPath,[join(source,'build.mjs'),'--packs',ids.join(','),'--output',w.output,...extra],{encoding:'utf8'});if(ok){assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);}assert.notEqual(result.status,0);return result;}
function outputs(w){const registry=readFileSync(join(w.output,'registry.json'));return {registry:registry.toString(),packs:JSON.parse(registry).packs.map(p=>readFileSync(join(w.output,p.presentation.url.slice('/content/'.length))).toString())};}

test('actual two-pack CLI emits accepted byte-identical artifacts with disabled, cold and warm cache',t=>{
 const w=workspace(t),fresh=run(w),baseline=outputs(w);
 assert.deepEqual(fresh.receipt.map(x=>x.preparation.reason),['cache-disabled','cache-disabled']);
 const expected=json(join(root,'apps/web/public/content/registry.json'));
 expected.packs=expected.packs.filter(p=>ids.includes(p.id));
 assert.equal(baseline.registry,JSON.stringify(expected,null,2)+'\n');
 for(const pack of expected.packs){const bytes=readFileSync(join(w.output,pack.presentation.url.slice('/content/'.length)));assert.equal(digest(bytes),pack.presentation.sha256);assert.equal(bytes.length,pack.presentation.bytes);}
 const cold=run(w,['--cache',w.cache]);assert.ok(cold.receipt.every(x=>x.preparation.disposition==='built'));
 const warm=run(w,['--cache',w.cache]);assert.ok(warm.receipt.every(x=>x.preparation.disposition==='reused'));
 assert.deepEqual(outputs(w),baseline);assert.equal(readdirSync(w.cache).length,2);
 assert.deepEqual(readdirSync(w.output).sort(),['packs','registry.json']);
 assert.ok(!baseline.registry.includes('buildKey')&&!baseline.registry.includes('preparationRecipe'));
});

test('actual CLI misses corrupt, partial, missing, wrong-pack, stale and forged self-consistent entries',t=>{
 const w=workspace(t);run(w,['--cache',w.cache]);const baseline=outputs(w),path=join(w.cache,ids[0]+'.json');
 const original=readFileSync(path,'utf8');
 const cases=[
  ['cache-malformed',()=>writeFileSync(path,'{"schema":')],
  ['cache-missing',()=>unlinkSync(path)],
  ['cache-wrong-pack',()=>writeFileSync(path,JSON.stringify({...JSON.parse(original),packId:ids[1]}))],
  ['cache-stale-key',()=>writeFileSync(path,JSON.stringify({...JSON.parse(original),buildKey:'0'.repeat(64)}))],
  ['cache-corrupt',()=>{const e=JSON.parse(original),bytes=Buffer.from(e.data,'base64');bytes[20]^=1;e.data=bytes.toString('base64');writeFileSync(path,JSON.stringify(e));}],
  ['cache-unaccepted-output',()=>{const e=JSON.parse(original),bytes=Buffer.from('{"forged":true}');Object.assign(e,{data:bytes.toString('base64'),bytes:bytes.length,outputSha:digest(bytes)});writeFileSync(path,JSON.stringify(e));}],
 ];
 for(const [reason,damage] of cases){damage();const result=run(w,['--cache',w.cache]);assert.equal(result.receipt[0].preparation.reason,reason);assert.equal(result.receipt[1].preparation.disposition,'reused');assert.deepEqual(outputs(w),baseline);}
});

test('authority runs before cache use: source, rights, semantic purpose/layout and inventory changes refuse',t=>{
 const w=workspace(t),data=inputs(ids[0]),settings={cacheDirectory:w.cache,outputDirectory:w.output};
 preparePresentation(data.input,data.options,settings);
 for(const mutate of [x=>{x.input.guide.steps[0].units[0].text+='changed';},x=>{x.input.rights.extra='changed';},x=>{x.options.listEvidence.groups[0].purpose='unapproved';},x=>{x.options.listEvidence.groups[0].layout='unapproved';},x=>{x.options.sourceFiles[0].bytes++;},x=>{x.options.exampleEvidence.units.reverse();}]){
  const altered=structuredClone(data);mutate(altered);assert.throws(()=>preparePresentation(altered.input,altered.options,settings));
 }
 assert.equal(preparePresentation(data.input,data.options,settings).receipt.disposition,'reused');
 const accessor=structuredClone(data.input);Object.defineProperty(accessor,'manifest',{get(){throw Error('getter executed');},enumerable:true});
 assert.throws(()=>preparePresentation(accessor,data.options,settings),/non-json-input/);
 const wrong=structuredClone(data.input);wrong.manifest.packId='unknown';assert.throws(()=>preparePresentation(wrong,data.options,settings),/unknown source identity/);
 const narration=structuredClone(data.input);narration.narration.entries.push({});assert.throws(()=>validatePresentationInput(narration,data.options),/pinned source identity/);
});

test('dependency keys are pack-scoped and include source, semantic and implementation identities',()=>{
 const a=inputs(ids[0]),b=inputs(ids[1]),ka=presentationBuildKey(a.input,a.options),kb=presentationBuildKey(b.input,b.options);
 for(const mutate of [x=>{x.input.rights.extra='change';},x=>{x.options.listEvidence.groups[0].purpose='change';},x=>{x.options.sourceFiles[0].sha256='0'.repeat(64);}]){const changed=structuredClone(a);mutate(changed);assert.notEqual(presentationBuildKey(changed.input,changed.options),ka);assert.equal(presentationBuildKey(b.input,b.options),kb);}
 for(const key of ['compilerSha','implementationSha','buildSha','recipe'])assert.notEqual(presentationBuildKey(a.input,a.options,{[key]:'0'.repeat(64)}),ka);
 assert.throws(()=>presentationBuildKey({...a.input,bad:undefined},a.options),/non-json-input/);
});

test('cache placement including a symlink cannot leak into public or selected output',t=>{
 const w=workspace(t);mkdirSync(w.output);symlinkSync(w.output,join(w.dir,'linked-output'));
 assert.throws(()=>validateCacheDirectory(join(w.output,'cache'),w.output),/cache-inside-public-output/);
 assert.throws(()=>validateCacheDirectory(join(w.dir,'linked-output','cache'),w.output),/cache-inside-public-output/);
 assert.throws(()=>validateCacheDirectory(join(root,'apps/web/public/cache'),w.output),/cache-inside-public-output/);
 assert.equal(validateCacheDirectory(w.cache,w.output),join(realpathSync(w.dir),'cache'));
 run(w,['--cache',join(w.output,'cache')],false);
 const unknown=spawnSync(process.execPath,[join(source,'build.mjs'),'--packs','eng.MRK-unknown','--output',w.output],{encoding:'utf8'});assert.notEqual(unknown.status,0);assert.match(unknown.stderr,/invalid-pack-selection/);
});

test('missing or changed external anchor disables reuse instead of trusting cache self-hashes',async t=>{
 const w=workspace(t),copy=join(w.dir,'isolated/server/fia/compiler/presentation');mkdirSync(copy,{recursive:true});
 cpSync(source,copy,{recursive:true});
 const module=await import(pathToFileURL(join(copy,'incremental.mjs')));
 const data=inputs(ids[0]),settings={cacheDirectory:w.cache,outputDirectory:w.output};
 assert.equal(module.preparePresentation(data.input,data.options,settings).receipt.reason,'acceptance-anchor-unavailable');
 const destination=join(w.dir,'isolated/apps/web/public/content');mkdirSync(destination,{recursive:true});
 writeFileSync(join(destination,'registry.json'),'{}');
 assert.equal(module.preparePresentation(data.input,data.options,settings).receipt.reason,'acceptance-anchor-mismatch');
 assert.ok(!readdirSync(w.dir).includes('cache'));
});

test('factored validator preserves bounded real compiler bytes and excludes approved passthrough from cache',()=>{
 for(const id of ids){const {input,options}=inputs(id);const result=compilePresentation(input,options);const expected=json(join(root,'apps/web/public/content/registry.json')).packs.find(p=>p.id===id);assert.equal(digest(Buffer.from(JSON.stringify(result.pack,null,2)+'\n')),expected.presentation.sha256);}
 const data=inputs('eng.MRK-1-1-13');assert.throws(()=>preparePresentation(data.input,data.options),/passthrough-not-cacheable/);
});
