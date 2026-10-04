import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync,statSync} from 'node:fs';import {createHash} from 'node:crypto';import {createStamp} from '../../scripts/version-stamp.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
const closure=JSON.parse(readFileSync(new URL('./generalized-release-closure.json',import.meta.url)));
test('stamp rejects absent source identity and honors trusted build precedence',()=>{const a='a'.repeat(40),b='b'.repeat(40);const s=createStamp({WORKERS_CI_COMMIT_SHA:a,GITHUB_SHA:b,WORKERS_CI_BRANCH:'production'});assert.equal(s.commit,a);assert.equal(s.branch,'production');assert.equal(s.built_at,s.builtAt);assert.equal(s.attestation,'unavailable');assert.throws(()=>createStamp({GITHUB_SHA:'unknown'}));});
test('public artifact contains exactly reviewed runtime and generated closure',()=>{
 const root=new URL('../../dist/',import.meta.url),allow=JSON.parse(readFileSync(new URL('./runtime-allowlist.json',import.meta.url)));
 const files=readdirSync(root,{recursive:true}).filter(x=>statSync(new URL(x,root)).isFile());const exact=new Map([...allow.files,...closure.generatedFiles].map(x=>[x.path,x.sha256]));
 for(const file of files){const bytes=readFileSync(new URL(file,root));if(file==='version.json'){const s=JSON.parse(bytes);assert.match(s.commit,/^[a-f0-9]{40}$/);assert.equal(s.version,closure.version);}else{assert.ok(exact.has(file),`Unreviewed output ${file}`);assert.equal(hash(bytes),exact.get(file),file);}
 if(/\.(html|md|json|js|css)$/.test(file))assert.doesNotMatch(bytes.toString('utf8'),/\/Users\/|chatgpt\.site|BEGIN (?:RSA |EC )?PRIVATE KEY|\bsk-[A-Za-z0-9]{20}/,file);}
 for(const file of exact.keys())assert.ok(files.includes(file),file);
 assert.ok(files.includes('version.json'));assert.match(readFileSync(new URL('_headers',root),'utf8'),/\/version\.json\s+Cache-Control: no-store/);
 const registry=JSON.parse(readFileSync(new URL('content/registry.json',root)));assert.equal(registry.packs.length,136);assert.equal(registry.packs.filter(p=>p.language==='eng').length,68);assert.equal(registry.packs.filter(p=>p.language==='spa').length,68);assert.equal(new Set(registry.packs.map(p=>p.id)).size,136);
 for(const d of registry.packs){const bytes=readFileSync(new URL(d.presentation.url.slice(1),root));assert.equal(bytes.length,d.presentation.bytes);assert.equal(hash(bytes),d.revision);assert.equal(d.presentation.sha256,d.revision);
 const m=JSON.parse(readFileSync(new URL(`offline/${d.id}.json`,root)));assert.equal(m.packId,d.id);assert.equal(m.presentationRevision,d.revision);assert.equal(m.revision,hash(JSON.stringify(m.files)).slice(0,12));assert.deepEqual(m.files.filter(f=>f.path.startsWith('/content/packs/')).map(f=>f.path),[d.presentation.url]);
 for(const f of m.files){assert.notEqual(f.path,'/version.json');const b=readFileSync(new URL(f.path.slice(1),root));assert.equal(b.length,f.bytes);assert.equal(hash(b),f.sha256);if(f.group==='core'&&!f.path.startsWith('/assets/fia-'))assert.doesNotMatch(f.path,/\.(mp3|m4a|wav|ogg|mp4|webm|jpe?g|png|webp)$/);}
 }
 const approved=registry.packs.find(p=>p.id==='eng.MRK-1-1-13');assert.equal(approved.revision,'ccd72f23c23f932651b500b730b285f32fabd37e50037b5af91d8881f1403975');assert.equal(approved.presentation.bytes,454295);assert.equal(approved.defaultScriptureId,'scripture-BereanStandardBible');
 const sw=readFileSync(new URL('sw.js',root),'utf8');assert.match(sw,/const VERSION='[a-f0-9]{12}'/);assert.ok(!sw.includes('__BUILD_ID__'));
 const legacy=JSON.parse(readFileSync(new URL('offline-manifest.json',root)));assert.equal(legacy.packId,'fia-mark-authentic');assert.equal(legacy.revision,hash(JSON.stringify(legacy.files)).slice(0,12));for(const f of legacy.files){assert.notEqual(f.path,'/version.json');const b=readFileSync(new URL(f.path.slice(1),root));assert.equal(b.length,f.bytes);assert.equal(hash(b),f.sha256);}
});
test('original source approval stays immutable; changed modules require separate exact review closure',()=>{
 const path=new URL('./approved-source.json',import.meta.url),raw=readFileSync(path),expected=JSON.parse(raw);assert.equal(hash(raw),closure.originalApprovedManifestSha256);assert.equal(expected.files.length,34);
 const changed=new Map(closure.changedSources.map(f=>[f.path,f]));for(const f of expected.files){const c=changed.get(f.path);if(c)assert.equal(c.originalSha256,f.sha256);assert.equal(hash(readFileSync(new URL('../../'+f.path,import.meta.url))),c?.sha256||f.sha256,f.path);}
 for(const f of closure.changedSources)assert.equal(hash(readFileSync(new URL('../../'+f.path,import.meta.url))),f.sha256,f.path);
});
