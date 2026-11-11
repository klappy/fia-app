// Opt-in browser repro (needs `npm run build` first; run from the repo root):
//   node apps/web/tests/offline-cold-open.e2e.mjs
// Hosted fiaguide.app and dev.fiaguide.app answer GET /index.html with 307 -> / . The worker's install
// step caches '/index.html' with addAll, which follows that redirect and stores a response whose
// `redirected` flag is true. Chromium refuses a redirected response for a navigation (redirect mode
// "manual"), so an offline cold open that falls back to the install shell shows ERR_FAILED.
// The local preview answers 200, so this script puts a tiny front server in front of it that emulates
// the host's 307, saves Text only, then stops the front server (a real loss of network, which
// context.setOffline does not give the worker on 127.0.0.1) and reloads without "Reload saved version".
import {spawn} from 'node:child_process';
import http from 'node:http';
import {chromium} from 'playwright';
const inner=Number(process.env.FIA_PREVIEW_PORT||6411),outer=inner+1,innerOrigin=`http://127.0.0.1:${inner}`,outerOrigin=`http://127.0.0.1:${outer}`;
const preview=spawn(process.execPath,['scripts/worker-preview.mjs'],{env:{...process.env,FIA_PREVIEW_PORT:String(inner)},stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{preview.stdout.on('data',d=>{if(String(d).includes('Packaged Worker preview'))resolve();});preview.once('exit',code=>reject(Error('preview exited '+code)));});
const sockets=new Set();
const front=http.createServer((req,res)=>{
 const path=new URL(req.url,outerOrigin).pathname;
 if(path==='/index.html'&&['GET','HEAD'].includes(req.method))return void res.writeHead(307,{Location:'/','Content-Length':'0'}).end();
 const headers={...req.headers,host:`127.0.0.1:${inner}`};if(headers.origin===outerOrigin)headers.origin=innerOrigin;
 const upstream=http.request({host:'127.0.0.1',port:inner,method:req.method,path:req.url,headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
 upstream.on('error',()=>res.destroy());req.pipe(upstream);
});
front.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
await new Promise(r=>front.listen(outer,'127.0.0.1',r));
const browser=await chromium.launch(process.env.FIA_CHROMIUM?{executablePath:process.env.FIA_CHROMIUM}:{});
let result={};
try{
 const context=await browser.newContext({baseURL:outerOrigin,viewport:{width:375,height:667}});const page=await context.newPage();
 const step=s=>console.error(new Date().toISOString(),s);step('open');
 await page.goto('/');await page.getByRole('navigation',{name:'Session controls'}).waitFor({timeout:30000});
 await page.evaluate(()=>navigator.serviceWorker.ready);step('save');
 await page.getByRole('button',{name:'More options'}).click();await page.getByRole('button',{name:'Downloads',exact:true}).click();
 await page.getByRole('radio',{name:/^Text only/}).check();await page.getByRole('button',{name:'Download selection',exact:true}).click();
 await page.getByText('The download is verified. Reload to use the saved version. Your place is kept.').waitFor({timeout:90000});
 result.shell=await page.evaluate(async()=>{const name=(await caches.keys()).find(n=>n.startsWith('fia-v3-shell-'));const r=name&&await(await caches.open(name)).match('/index.html');return r?{name,status:r.status,redirected:r.redirected}:null;});
 if(process.env.FIA_REPRO_DEBUG)console.error(JSON.stringify(await page.evaluate(async()=>{const out={};for(const n of await caches.keys()){const c=await caches.open(n);const keys=(await c.keys()).map(r=>new URL(r.url).pathname);out[n]={count:keys.length,sample:keys.filter(k=>!k.startsWith('/content/')).slice(0,12)};const ix=await c.match('/index.html');if(ix)out[n].index={redirected:ix.redirected,status:ix.status};}return out;})));
 // Real offline: the host stops answering. Do not tap "Reload saved version".
 await new Promise(r=>{front.close(r);for(const s of sockets)s.destroy();});
 try{await page.reload({timeout:20000});await page.getByRole('navigation',{name:'Session controls'}).waitFor({timeout:20000});result.offlineReload='app';}
 catch(error){result.offlineReload='error: '+String(error.message).split('\n')[0];}
}finally{await browser.close();preview.kill('SIGTERM');front.close();}
console.log(JSON.stringify(result));
if(result.offlineReload!=='app'){console.error('FAIL: offline cold open did not show the app');process.exit(1);}
console.log('PASS: offline cold open shows the app');process.exit(0);
