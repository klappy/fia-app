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
 }finally{rmSync(dir,{recursive:true,force:true});}
});
