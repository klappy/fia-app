import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const dependencies=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json'));
test('preparation runtime bundles before generated snapshot exists',async()=>{
 const {build}=dependencies('esbuild');
 const result=await build({entryPoints:[resolve('server/fia/preparation/worker.mjs')],bundle:true,platform:'browser',format:'esm',external:['node:*'],write:false,metafile:true,logLevel:'silent',plugins:[{name:'clean-checkout-no-generated-snapshot',setup(builder){builder.onResolve({filter:/generated\/snapshot\.json$/},()=>({errors:[{text:'Generated snapshot must be supplied only by the production composition root after build.'}]}));}}]});
 assert.ok(result.outputFiles[0].text.length>0);
 assert.equal(Object.keys(result.metafile.inputs).some(path=>path.endsWith('/generated/snapshot.json')),false);
});
