import {replacementWorkerReady} from '../scripts/upgrade-readiness.mjs';
import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {legacyWorker} from '../scripts/legacy-worker-fixture.js';
test('actual previous worker yields to fresh app without deleting user data',async({browser})=>{
 test.skip(!!process.env.BASE_URL,'Upgrade reference is only part of normal feature CI');
 const oldWorker=await legacyWorker();let upgraded=false;
 const oldShell='<html><body><h1>Previous shell reference</h1></body></html>';
 const entry={path:'/index.html',mime:'text/html',group:'shell',bytes:Buffer.byteLength(oldShell),sha256:createHash('sha256').update(oldShell).digest('hex')};
 const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;
 if(!upgraded){res.setHeader('Content-Type',path==='/sw.js'?'application/javascript':path==='/offline-shell.json'?'application/json':'text/html');res.end(path==='/sw.js'?oldWorker:path==='/offline-shell.json'?JSON.stringify({appVersion:'0.3.5',entries:[entry]}):oldShell);return;}
 let file=resolve('dist','.'+path);if(!file.startsWith(resolve('dist')+'/'))file=resolve('dist/index.html');if(existsSync(file)&&statSync(file).isDirectory())file=resolve(file,'index.html');if(!existsSync(file))file=resolve('dist/index.html');res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css'})[extname(file)] || 'application/octet-stream');res.end(readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;const context=await browser.newContext();
 try{const page=await context.newPage();await page.goto(url);await page.evaluate(async()=>{localStorage.setItem('legacy-progress-test','preserve');await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});await page.reload();await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBeTruthy();
 const cachesBefore=await page.evaluate(()=>caches.keys());expect(cachesBefore.some(x=>x.startsWith('fia-shell-'))).toBeTruthy();
 upgraded=true;await page.reload();await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});await expect.poll(()=>page.evaluate(replacementWorkerReady)).toBeTruthy();await page.reload();await expect(page.getByRole('navigation',{name:'Session controls'})).toBeVisible();await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>resolve(e.data);navigator.serviceWorker.controller.postMessage({type:'DOWNLOAD_STATUS'},[c.port2]);setTimeout(()=>resolve(null),3000);}))).toMatchObject({available:true});
 expect(await page.evaluate(()=>localStorage.getItem('legacy-progress-test'))).toBe('preserve');expect(await page.evaluate(()=>caches.keys())).toEqual(expect.arrayContaining(cachesBefore));await page.reload();await expect(page.getByRole('navigation',{name:'Session controls'})).toBeVisible();
 }finally{await context.close();await new Promise(r=>server.close(r));}
});
