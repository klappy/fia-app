import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyBuildParameters,normalizeGenerated} from './parameterized-closure.js';
test('parameterized closure rejects wrong identity, duplicate stamp, and unrelated HTML mutation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'fia-closure-')),root=pathToFileURL(dir+'/'),source=new URL('../../dist/',import.meta.url);
 try{
  mkdirSync(join(dir,'offline'));
  for(const path of ['version.json','index.html','sw.js','offline/eng.MRK-1-1-13.json'])writeFileSync(new URL(path,root),readFileSync(new URL(path,source)));
  const version=JSON.parse(readFileSync(new URL('version.json',root))).version;
  const original=readFileSync(new URL('index.html',root),'utf8');
  const good=verifyBuildParameters(root,version);
  writeFileSync(new URL('index.html',root),original.replace(/alpha\.4\+[a-f0-9]{7}/,'alpha.4+fffffff'));
  assert.throws(()=>verifyBuildParameters(root,version));
  writeFileSync(new URL('index.html',root),original+original.match(/<meta name="fia-release"[^>]*>/)[0]);
  assert.throws(()=>verifyBuildParameters(root,version));
  writeFileSync(new URL('index.html',root),original.replace('<title>','<title>tampered '));
  const changed=verifyBuildParameters(root,version);
  const hash=value=>createHash('sha256').update(value).digest('hex');
  assert.notEqual(hash(normalizeGenerated('index.html',Buffer.from(original),good)),hash(normalizeGenerated('index.html',readFileSync(new URL('index.html',root)),changed)));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
