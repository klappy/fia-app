import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import {createHash} from 'node:crypto';import {createStamp} from '../../scripts/version-stamp.js';
test('stamp rejects absent source identity and honors trusted build precedence',()=>{const a='a'.repeat(40),b='b'.repeat(40);const s=createStamp({WORKERS_CI_COMMIT_SHA:a,GITHUB_SHA:b,WORKERS_CI_BRANCH:'production'});assert.equal(s.commit,a);assert.equal(s.branch,'production');assert.equal(s.built_at,s.builtAt);assert.equal(s.attestation,'unavailable');assert.throws(()=>createStamp({GITHUB_SHA:'unknown'}));});
test('public artifact is bounded and exact accepted bundle survives import',()=>{
 const root=new URL('../../dist/',import.meta.url),files=readdirSync(root,{recursive:true}).filter(x=>!['assets','content','build-status'].includes(x));
 for(const file of files)assert.match(file,/^(index\.html|version\.json|_headers|sw\.js|assets\/index-[\w-]+\.(js|css)|content\/bundle\.json|build-status\/(index\.html|observations\.json))$/);
 const bundle=readFileSync(new URL('content/bundle.json',root));assert.equal(createHash('sha256').update(bundle).digest('hex'),'faa53e9e954dcf0f0661e3551f6fb96a9f4f2f532fff2d90ab128b4eab5d8843');
 assert.match(readFileSync(new URL('_headers',root),'utf8'),/\/version\.json\s+Cache-Control: no-store/);
 for(const file of files){const text=readFileSync(new URL(file,root),'utf8');assert.doesNotMatch(text,/\/Users\/|chatgpt\.site|fia-app-cookbook|BEGIN PRIVATE KEY/);}
});
