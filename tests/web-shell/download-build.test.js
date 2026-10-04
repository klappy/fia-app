import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

test('finalizer keeps deployment controls in output but excludes them from all137 downloadable manifests',()=>{
 const dir=mkdtempSync(join(tmpdir(),'fia-download-build-'));
 try{
  const put=(path,text)=>{mkdirSync(join(dir,path,'..'),{recursive:true});writeFileSync(join(dir,path),text);};
  for(const name of ['V3-BLUEPRINT','TEST-GUIDE','CONTENT-RECEIPT'])put(`apps/web/docs/${name}.md`,'# Fixture');
  put('apps/web/public/sw.js',"const VERSION='__BUILD_ID__';");
  put('dist/_headers','/*\n  X-Test: retained');put('dist/_redirects','/* /index.html 200');put('dist/index.html','<html>app</html>');put('dist/audio/test.mp3','audio');
  const packs=[];
  for(const language of ['eng','spa'])for(let n=1;n<=68;n++){
   const id=`${language}.MRK-1-${n}`,url=`/content/packs/${id}/revision.json`;
   put('dist'+url,JSON.stringify({assets:{},activities:[{audioSrc:'/audio/test.mp3'}]}));packs.push({id,revision:'a'.repeat(64),presentation:{url}});
  }
  put('dist/content/registry.json',JSON.stringify({packs}));
  execFileSync(process.execPath,[resolve('scripts/finalize-build.mjs')],{cwd:dir});
  const paths=['dist/offline-manifest.json',...packs.map(p=>`dist/offline/${p.id}.json`)];assert.equal(paths.length,137);
  for(const path of paths){
   const manifest=JSON.parse(readFileSync(join(dir,path),'utf8'));
   assert.ok(manifest.files.some(f=>f.path==='/index.html'));
   assert.ok(manifest.files.some(f=>f.path==='/audio/test.mp3'));
   for(const f of manifest.files){assert.ok(!['/_headers','/_redirects'].includes(f.path));const bytes=readFileSync(join(dir,'dist'+f.path));assert.equal(bytes.length,f.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);}
  }
  assert.equal(readFileSync(join(dir,'dist/_headers'),'utf8'),'/*\n  X-Test: retained');assert.equal(readFileSync(join(dir,'dist/_redirects'),'utf8'),'/* /index.html 200');
  const hash=x=>createHash('sha256').update(x).digest('hex');
  const sidecar={schema:1,packId:packs[0].id,presentationRevision:'a'.repeat(64),recipeRevision:'accepted',entries:[{path:'/audio/test.mp3',source:{url:'https://fia.test/audio/test.mp3',sha256:hash('audio'),bytes:5,provenance:{}},delivery:{url:'https://transcode.klappy.dev/audio/preset=voice,q=medium,f=opus/https://fia.test/audio/test.mp3',sha256:hash('ogg'),bytes:3,mime:'audio/ogg',kind:'audio',format:'opus',preset:'voice',q:'medium',status:'transformed'},timing:{status:'not-applicable'}}]};
  const body=JSON.stringify(sidecar),sidecarPath=`dist/content/delivery/${packs[0].id}/${hash(body)}.json`;put(sidecarPath,body);
  execFileSync(process.execPath,[resolve('scripts/finalize-build.mjs')],{cwd:dir});
  const updated=JSON.parse(readFileSync(join(dir,`dist/offline/${packs[0].id}.json`)));
  const audio=updated.files.find(f=>f.path==='/audio/test.mp3');assert.equal(audio.bytes,3);assert.equal(audio.sha256,hash('ogg'));assert.equal(audio.sourceSha256,hash('audio'));assert.equal(updated.deliveryRevision,hash(body));
  const index=JSON.parse(readFileSync(join(dir,'dist/content/delivery/index.json')));assert.equal(index.packs[0].delivery.sha256,hash(body));assert.equal(index.packs[0].delivery.bytes,Buffer.byteLength(body));
  assert.ok(updated.files.some(f=>f.path==='/content/delivery/index.json'));assert.ok(updated.files.some(f=>f.path===sidecarPath.slice(4)));
  let currentPath=sidecarPath;
  for(const [mutate,expected] of [
   [s=>s.entries[0].source.sha256='f'.repeat(64),/Delivery source mismatch/],
   [s=>{const e=s.entries[0];e.source.url='https://fia.test/wrong.mp3';e.delivery.url='https://transcode.klappy.dev/audio/preset=voice,q=medium,f=opus/'+e.source.url;},/Delivery source URL mismatch/],
   [s=>{const d=s.entries[0].delivery;Object.assign(d,{kind:'image',mime:'image/webp',format:'webp',width:2,height:2,url:'https://transcode.klappy.dev/image/q=medium,f=webp/'+s.entries[0].source.url});delete d.preset;},/Delivery media kind mismatch/]
  ]){rmSync(join(dir,currentPath));const altered=JSON.parse(body);mutate(altered);const raw=JSON.stringify(altered);currentPath=`dist/content/delivery/${packs[0].id}/${hash(raw)}.json`;put(currentPath,raw);assert.throws(()=>execFileSync(process.execPath,[resolve('scripts/finalize-build.mjs')],{cwd:dir,stdio:'pipe'}),expected);}
  rmSync(join(dir,currentPath));put(sidecarPath,body);
  put('dist'+packs[0].presentation.url,JSON.stringify({assets:{scripture:{alignment:{audioSha256:hash('audio'),duration:1,verses:[]}}},activities:[{audioSrc:'/audio/test.mp3'}]}));
  assert.throws(()=>execFileSync(process.execPath,[resolve('scripts/finalize-build.mjs')],{cwd:dir,stdio:'pipe'}),/Unverified Scripture alignment/);

 }finally{rmSync(dir,{recursive:true,force:true});}
});
