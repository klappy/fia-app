import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compilePresentation,describe,digest,SOURCE,RECIPE} from './compile.mjs';
const root=resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const input=process.argv[2]?resolve(process.argv[2]):null;
const bundled=JSON.parse(gunzipSync(readFileSync(new URL('./source-packs.json.gz',import.meta.url))));
const output=resolve(process.argv[3]||join(root,'apps/web/public/content'));
const sample=process.argv.includes('--sample');
const list=json(new URL('./lists.json',import.meta.url)),examples=json(new URL('./examples.json',import.meta.url));
const ids=(input?readdirSync(join(input,'data/packs')):Object.keys(bundled.packs)).filter(id=>/^(eng|spa)\.MRK-/.test(id)).sort((a,b)=>a.localeCompare(b,'en',{numeric:true})).filter(id=>!sample||/MRK-1-(1-13|14-20)$/.test(id));
const registry={schemaVersion:1,sourceRevision:SOURCE,recipeRevision:RECIPE,packs:[]},receipt=[];
for(const id of ids){
 const dir=input?join(input,'data/packs',id):null,files=['manifest','guide','guide-units','scripture','resources','rights','narration'];
 const sourceFiles=input?files.map(name=>{const bytes=readFileSync(join(dir,name+'.json'));return {path:`data/packs/${id}/${name}.json`,bytes:bytes.length,sha256:digest(bytes)};}):bundled.inventory.filter(f=>f.path.startsWith(`data/packs/${id}/`));
 sourceFiles.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 if(input)for(const f of sourceFiles){const trusted=bundled.inventory.find(e=>e.path===f.path);if(!trusted||trusted.sha256!==f.sha256||trusted.bytes!==f.bytes)throw Error('pinned file identity mismatch');}
 const data=input?Object.fromEntries(files.map(name=>[name,json(join(dir,name+'.json'))])):bundled.packs[id];
 let bytes,result;
 if(id==='eng.MRK-1-1-13'){
  bytes=readFileSync(join(root,'server/fia/publication/approved-presentation.json'));
  if(bytes.length!==454295||digest(bytes)!=='ccd72f23c23f932651b500b730b285f32fabd37e50037b5af91d8881f1403975')throw Error('approved identity mismatch');
  const pack=JSON.parse(bytes),entries=json(join(root,'apps/web/public/content/source/audio-manifest.json')).entries;
  for(const e of entries){const media=readFileSync(join(root,'apps/web/public',e.path));if(digest(media)!==e.sha256||media.length!==e.bytes)throw Error('approved media hash mismatch');}
  const cap=count=>({status:count?'packaged':'unavailable',count});
  const resources=Object.values(pack.assets);
  result={defaultScriptureId:'scripture-BereanStandardBible',capabilities:{text:{available:true},guideNarration:cap(new Set(pack.activities.filter(a=>a.kind!=='scripture'&&a.audioSrc).map(a=>a.audioSrc)).size),scriptureAudio:cap(new Set(pack.activities.filter(a=>a.kind==='scripture'&&a.audioSrc).map(a=>a.audioSrc)).size),resourceAudio:cap(resources.filter(a=>a.kind!=='scripture'&&(a.audioSrc||a.descriptionAudio)).length),generatedAudio:cap(entries.filter(e=>e.recordingSource==='generated').length),images:cap(resources.filter(a=>['image','map'].includes(a.kind)&&a.src).length),video:cap(resources.filter(a=>a.kind==='video'&&a.src).length)},diagnostics:[{code:'approved-presentation-lineage',sourceRevision:pack.source.commit,rawInventoryRevision:SOURCE}]};
 }else{
  result=compilePresentation(data,{listEvidence:list.packs.find(p=>p.packId===id),exampleEvidence:examples.packs.find(p=>p.packId===id),sourceFiles});
  bytes=Buffer.from(JSON.stringify(result.pack,null,2)+'\n');
 }
 const descriptor=describe(data.manifest,bytes,result);const dest=join(output,'packs',id);mkdirSync(dest,{recursive:true});writeFileSync(join(dest,descriptor.revision+'.json'),bytes);registry.packs.push(descriptor);
 receipt.push({id,sha256:descriptor.revision,bytes:bytes.length,sourceUnits:data.guide.steps.flatMap(s=>s.units).length,activities:JSON.parse(bytes).activities.length,diagnostics:result.diagnostics.length});
}
mkdirSync(output,{recursive:true});writeFileSync(join(output,'registry.json'),JSON.stringify(registry,null,2)+'\n');
console.log(JSON.stringify({sample,packs:registry.packs.length,receipt},null,2));
