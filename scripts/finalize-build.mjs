import {readdirSync,readFileSync,writeFileSync,mkdirSync,copyFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {marked} from 'marked';
import {createHash} from 'node:crypto';
import {validateDelivery} from '../apps/web/src/lib/media-delivery.js';
mkdirSync('dist/docs',{recursive:true});
for(const file of ['V3-BLUEPRINT.md','TEST-GUIDE.md','CONTENT-RECEIPT.md']){
 const source=readFileSync(join('apps/web/docs',file),'utf8');copyFileSync(join('apps/web/docs',file),join('dist/docs',file));
 const title=source.split('\n')[0].replace(/^# /,'');
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>@font-face{font-family:NR;src:url('/fonts/noto-serif-latin-400-normal.woff2')}*{box-sizing:border-box}body{margin:0;background:#F7F8FB;color:#242C3A;font:16px/1.8 system-ui,sans-serif}main{max-width:870px;padding:48px 30px 100px;margin:auto}nav{display:flex;gap:25px;font-size:13px;margin-bottom:40px}a{color:#56753e;text-underline-offset:4px}h1,h2,h3{font-family:NR,Georgia,serif;font-weight:400;line-height:1.2}h1{font-size:42px;letter-spacing:-1px}h2{font-size:30px;margin-top:44px}h3{font-size:24px}p,li{color:#5A6472}table{width:100%;border-collapse:collapse;font-size:13px;display:block;overflow:auto}th,td{padding:12px;border:1px solid #dbe0d0;text-align:left;vertical-align:top}th{background:#e8eedb}pre{overflow:auto;background:#e9eedf;padding:20px;border-radius:12px}code{font-size:13px}hr{border:0;border-top:1px solid #dbe0d0}blockquote{border-left:3px solid #bbc9a3;padding-left:20px}@media(max-width:600px){main{padding:25px 20px 60px}h1{font-size:34px}nav{gap:15px;flex-wrap:wrap}table{font-size:11px}}@media print{nav{display:none}main{max-width:none;padding:0}body{background:white;font-size:11px}h1{font-size:28px}h2{font-size:21px}table{display:table}a{color:inherit}}</style></head><body><main><nav><a href="/">← Try the prototype</a><a href="/docs/V3-BLUEPRINT.html">Design blueprint</a><a href="/docs/TEST-GUIDE.html">Test guide</a></nav>${marked.parse(source)}</main></body></html>`;
 writeFileSync(join('dist/docs',file.replace('.md','.html')),html);
}
function walk(dir){return readdirSync(dir).flatMap(name=>{const path=join(dir,name);return statSync(path).isDirectory()?walk(path):[path];});}
const digest=path=>({path:'/'+path.slice(5),bytes:statSync(path).size,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),group:/\.(mp3|m4a|wav|ogg)$/.test(path)?'audio':/\.(mp4|webm)$/.test(path)?'video':/\.(jpe?g|png|webp)$/.test(path)&&!path.includes('/assets/fia-')?'image':'core'});
// Hosting consumes these deployment controls; public requests return SPA HTML, not these bytes.
const deploymentControls=new Set(['dist/_headers','dist/_redirects']);
const allFiles=walk('dist').filter(p=>!deploymentControls.has(p)&&!p.endsWith('/version.json')&&!p.endsWith('/sw.js')&&!p.endsWith('/offline-manifest.json')&&!p.includes('/offline/')&&!p.includes('/docs/')&&!p.includes('/content/'));
const mediaPath=path=>/\.(mp3|m4a|wav|ogg|mp4|webm|jpe?g|png|webp)$/.test(path)&&!path.includes('/assets/fia-');
const shell=allFiles.filter(path=>!mediaPath(path)).map(digest);
const buildId=createHash('sha256').update(JSON.stringify(shell)).digest('hex').slice(0,12);
const deliveryHelpers=readFileSync(new URL('../apps/web/src/lib/media-delivery.js',import.meta.url),'utf8').replace(/export (?=(?:async )?function)/g,'');
writeFileSync('dist/sw.js',deliveryHelpers+'\n'+readFileSync('apps/web/public/sw.js','utf8').replace('__BUILD_ID__',buildId));
const registryPath='dist/content/registry.json';
let registry;
try{registry=JSON.parse(readFileSync(registryPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(registry){
 const deliveryIndex={schema:1,packs:[]};
 const deliveries=new Map();
 for(const descriptor of registry.packs){
  const dir='dist/content/delivery/'+descriptor.id;
  let names=[];try{names=readdirSync(dir).filter(n=>n.endsWith('.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(names.length>1)throw Error('Ambiguous delivery sidecar: '+descriptor.id);
  if(!names.length)continue;
  const path=dir+'/'+names[0],bytes=readFileSync(path),sha256=createHash('sha256').update(bytes).digest('hex');
  if(names[0]!==sha256+'.json')throw Error('Delivery filename must bind exact bytes.');
  const sidecar=validateDelivery(JSON.parse(bytes),{packId:descriptor.id,presentationRevision:descriptor.revision});
  deliveries.set(descriptor.id,{sidecar,path,sha256});deliveryIndex.packs.push({packId:descriptor.id,presentationRevision:descriptor.revision,delivery:{url:'/'+path.slice(5),sha256,bytes:bytes.length}});
 }
 mkdirSync('dist/content/delivery',{recursive:true});writeFileSync('dist/content/delivery/index.json',JSON.stringify(deliveryIndex));
 mkdirSync('dist/offline',{recursive:true});
 for(const descriptor of registry.packs){
  const payloadPath='dist'+descriptor.presentation.url,pack=JSON.parse(readFileSync(payloadPath,'utf8'));
  const selected=new Set();
  const include=url=>{if(typeof url==='string'&&url.startsWith('/')&&!url.startsWith('//')){try{if(statSync('dist'+url).isFile())selected.add('dist'+url);}catch{}}};
  for(const a of Object.values(pack.assets)){include(a.src);include(a.poster);include(a.descriptionAudio);}
  for(const a of pack.activities)include(a.audioSrc);
  const delivery=deliveries.get(descriptor.id),media=Array.from(selected).sort().map(digest);
  if(delivery){
   const byPath=new Map(delivery.sidecar.entries.map(e=>[e.path,e]));
   for(const f of media){if(f.group==='video')continue;const e=byPath.get(f.path);if(!e)throw Error('Incomplete delivery coverage: '+f.path);if(e.source.sha256!==f.sha256||e.source.bytes!==f.bytes)throw Error('Delivery source mismatch: '+f.path);
    const aligned=Object.values(pack.assets).find(a=>a.alignment?.audioSha256===f.sha256);if(aligned&&(e.timing.status!=='verified'||e.timing.alignmentSha256!==createHash('sha256').update(JSON.stringify(aligned.alignment)).digest('hex')))throw Error('Unverified Scripture alignment: '+f.path);
    Object.assign(f,{sha256:e.delivery.sha256,bytes:e.delivery.bytes,mime:e.delivery.mime,deliveryURL:e.delivery.url,sourceSha256:e.source.sha256,deliveryRevision:delivery.sha256,timing:e.timing});
   }
   if(byPath.size!==media.filter(f=>f.group!=='video').length)throw Error('Unexpected delivery entries.');
  }
  const entries=[...shell,digest(registryPath),digest(payloadPath),digest('dist/content/delivery/index.json'),...(delivery?[digest(delivery.path)]:[]),...media];
  const revision=createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0,12);
  const manifest={schema:1,packId:descriptor.id,presentationRevision:descriptor.revision,...(delivery?{deliveryRevision:delivery.sha256}:{}),revision,files:entries};
  writeFileSync(`dist/offline/${descriptor.id}.json`,JSON.stringify(manifest));
 }
}
// Legacy manifest remains readable for already installed pre-registry clients.
const legacyEntries=allFiles.sort().map(digest),legacyRevision=createHash('sha256').update(JSON.stringify(legacyEntries)).digest('hex').slice(0,12);
writeFileSync('dist/offline-manifest.json',JSON.stringify({schema:1,packId:'fia-mark-authentic',revision:legacyRevision,files:legacyEntries}));
console.log(`Offline build ${buildId}: ${registry?.packs.length||0} separate passage manifests`);
