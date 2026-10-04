import {readdirSync,readFileSync,writeFileSync,mkdirSync,copyFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {marked} from 'marked';
import {createHash} from 'node:crypto';
mkdirSync('dist/docs',{recursive:true});
for(const file of ['V3-BLUEPRINT.md','TEST-GUIDE.md','CONTENT-RECEIPT.md']){
 const source=readFileSync(join('apps/web/docs',file),'utf8');copyFileSync(join('apps/web/docs',file),join('dist/docs',file));
 const title=source.split('\n')[0].replace(/^# /,'');
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>@font-face{font-family:NR;src:url('/fonts/noto-serif-latin-400-normal.woff2')}*{box-sizing:border-box}body{margin:0;background:#F7F8FB;color:#242C3A;font:16px/1.8 system-ui,sans-serif}main{max-width:870px;padding:48px 30px 100px;margin:auto}nav{display:flex;gap:25px;font-size:13px;margin-bottom:40px}a{color:#56753e;text-underline-offset:4px}h1,h2,h3{font-family:NR,Georgia,serif;font-weight:400;line-height:1.2}h1{font-size:42px;letter-spacing:-1px}h2{font-size:30px;margin-top:44px}h3{font-size:24px}p,li{color:#5A6472}table{width:100%;border-collapse:collapse;font-size:13px;display:block;overflow:auto}th,td{padding:12px;border:1px solid #dbe0d0;text-align:left;vertical-align:top}th{background:#e8eedb}pre{overflow:auto;background:#e9eedf;padding:20px;border-radius:12px}code{font-size:13px}hr{border:0;border-top:1px solid #dbe0d0}blockquote{border-left:3px solid #bbc9a3;padding-left:20px}@media(max-width:600px){main{padding:25px 20px 60px}h1{font-size:34px}nav{gap:15px;flex-wrap:wrap}table{font-size:11px}}@media print{nav{display:none}main{max-width:none;padding:0}body{background:white;font-size:11px}h1{font-size:28px}h2{font-size:21px}table{display:table}a{color:inherit}}</style></head><body><main><nav><a href="/">← Try the prototype</a><a href="/docs/V3-BLUEPRINT.html">Design blueprint</a><a href="/docs/TEST-GUIDE.html">Test guide</a></nav>${marked.parse(source)}</main></body></html>`;
 writeFileSync(join('dist/docs',file.replace('.md','.html')),html);
}
function walk(dir){return readdirSync(dir).flatMap(name=>{const path=join(dir,name);return statSync(path).isDirectory()?walk(path):[path];});}
const files=walk('dist').filter(p=>!p.endsWith('/sw.js')&&!p.endsWith('/offline-manifest.json')&&!p.includes('/docs/')&&!p.includes('/content/'));
const entries=files.sort().map(path=>({path:'/'+path.slice(5),bytes:statSync(path).size,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),group:/\.(mp3|m4a|wav|ogg)$/.test(path)?'audio':/\.(mp4|webm)$/.test(path)?'video':'core'}));
const id=createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0,12);
writeFileSync('dist/sw.js',readFileSync('apps/web/public/sw.js','utf8').replace('__BUILD_ID__',id));
writeFileSync('dist/offline-manifest.json',JSON.stringify({schema:1,packId:'fia-mark-authentic',revision:id,files:entries}));
console.log(`Offline build ${id}: ${entries.length} verified files, ${(entries.reduce((n,f)=>n+f.bytes,0)/1024/1024).toFixed(1)} MB`);
