import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync,statSync} from 'node:fs';import {createHash} from 'node:crypto';import {createStamp} from '../../scripts/version-stamp.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
test('stamp rejects absent source identity and honors trusted build precedence',()=>{const a='a'.repeat(40),b='b'.repeat(40);const s=createStamp({WORKERS_CI_COMMIT_SHA:a,GITHUB_SHA:b,WORKERS_CI_BRANCH:'production'});assert.equal(s.commit,a);assert.equal(s.branch,'production');assert.equal(s.built_at,s.builtAt);assert.equal(s.attestation,'unavailable');assert.throws(()=>createStamp({GITHUB_SHA:'unknown'}));});
test('public artifact contains only reviewed runtime closure and truthful generated identities',()=>{
 const root=new URL('../../dist/',import.meta.url),allow=JSON.parse(readFileSync(new URL('./runtime-allowlist.json',import.meta.url)));
 const files=readdirSync(root,{recursive:true}).filter(x=>statSync(new URL(x,root)).isFile());const exact=new Map(allow.files.map(x=>[x.path,x.sha256]));
 for(const file of files){
  const bytes=readFileSync(new URL(file,root));
  if(exact.has(file))assert.equal(hash(bytes),exact.get(file),file);
  else assert.match(file,/^(index\.html|version\.json|sw\.js|offline-manifest\.json|assets\/index-[\w-]+\.(js|css)|docs\/(V3-BLUEPRINT|TEST-GUIDE|CONTENT-RECEIPT)\.(md|html))$/,file);
  if(/\.(html|md|json|js|css)$/.test(file))assert.doesNotMatch(bytes.toString('utf8'),/\/Users\/|chatgpt\.site|BEGIN (?:RSA |EC )?PRIVATE KEY|\bsk-[A-Za-z0-9]{20}/,file);
 }
 for(const file of exact.keys())assert.ok(files.includes(file),file);
 const manifest=JSON.parse(readFileSync(new URL('offline-manifest.json',root)));assert.equal(manifest.packId,'fia-mark-authentic');assert.equal(manifest.files.some(f=>f.path==='/version.json'),false,'live version must never enter offline manifest');assert.ok(files.includes('version.json'),'live identity remains published');
 for(const f of manifest.files){const b=readFileSync(new URL(f.path.slice(1),root));assert.equal(b.length,f.bytes);assert.equal(hash(b),f.sha256);}
 assert.equal(manifest.revision,hash(JSON.stringify(manifest.files)).slice(0,12));
 assert.match(readFileSync(new URL('sw.js',root),'utf8'),new RegExp(`const VERSION='${manifest.revision}'`));
 assert.match(readFileSync(new URL('_headers',root),'utf8'),/\/version\.json\s+Cache-Control: no-store/);
 for(const doc of ['V3-BLUEPRINT','TEST-GUIDE','CONTENT-RECEIPT'])assert.ok(readFileSync(new URL(`docs/${doc}.html`,root),'utf8').includes('<!doctype html>'));
});
test('approved source modules and entry remain byte-identical to pinned prototype',()=>{
 const expected=JSON.parse(readFileSync(new URL('./approved-source.json',import.meta.url)));
 assert.equal(expected.files.length,34);
 for(const f of expected.files)assert.equal(hash(readFileSync(new URL('../../'+f.path,import.meta.url))),f.sha256,f.path);
});
