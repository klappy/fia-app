// Repro (J-A2, slice pp): a Save interrupted by a network drop must become retryable once the
// network returns and then reach a verified save. Runs against the built Site served by
// scripts/worker-preview.mjs (needs `npm run build` first). Exit code 0 = pass, 1 = fail.
// Usage: node apps/web/tests/interrupted-save-retry.e2e.cjs  (FIA_PREVIEW_PORT, default 4391; FIA_CHROMIUM = optional browser path)
const {spawn}=require('node:child_process');
const http=require('node:http');
const {chromium}=require('playwright');
// The page talks to a pass-through proxy; "dropping the network" destroys every proxied socket and
// refuses new ones, for the page and its service worker alike (context.setOffline does not reliably
// cut a service worker's fetches to a local server).
const port=Number(process.env.FIA_PREVIEW_PORT||4391),upstream=port+1,base=`http://127.0.0.1:${port}`;
let down=false;const live=new Set();
const proxy=http.createServer((req,res)=>{
 if(down)return void req.socket.destroy();
 const headers={...req.headers,host:`127.0.0.1:${upstream}`};for(const h of ['origin','referer'])if(headers[h])headers[h]=headers[h].replace(`:${port}`,`:${upstream}`);
 const out=http.request({host:'127.0.0.1',port:upstream,path:req.url,method:req.method,headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
 if(!live.has(req.socket)){live.add(req.socket);req.socket.once('close',()=>live.delete(req.socket));}out.on('error',()=>req.socket.destroy());req.pipe(out);
});
function network(on){down=!on;if(down)for(const s of live)s.destroy();}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitForServer(){for(let i=0;i<120;i++){try{if((await fetch(`http://127.0.0.1:${upstream}`)).ok)return;}catch{}await sleep(500);}throw Error('preview server did not start');}
(async()=>{
 const server=spawn(process.execPath,['scripts/worker-preview.mjs'],{env:{...process.env,FIA_PREVIEW_PORT:String(upstream)},stdio:['ignore','pipe','pipe']});
 let browser,code=1;
 try{
  await waitForServer();await new Promise(r=>proxy.listen(port,'127.0.0.1',r));
  browser=await chromium.launch(process.env.FIA_CHROMIUM?{executablePath:process.env.FIA_CHROMIUM}:{});const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
  await page.goto(base+'/');await page.getByRole('navigation',{name:'Session controls'}).waitFor();
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.getByRole('button',{name:'More options'}).click();await page.getByRole('button',{name:'Downloads',exact:true}).click();
  await page.getByRole('group',{name:'Include in download'}).waitFor();
  await page.getByRole('radio',{name:/^Text and all available resources/}).check();
  const button=page.getByRole('button',{name:/^(Download selection|Resume download)$/});
  await button.click();
  // Drop the network as soon as the Save is under way.
  // QA saw 0.0 MB and an empty pack cache: the drop lands before the first file is verified.
  if(process.env.FIA_DROP_AFTER_FILE==='1')await page.getByText(/ [1-9]\d* \/ \d+ files$/).waitFor({timeout:60000});
  network(false);
  // Count every appearance of the "Checking device storage…" status from 3 s after the drop (after the Save's own refresh).
  await page.waitForTimeout(3000);
  await page.evaluate(()=>{window.__fiaChecking=0;new MutationObserver(()=>{if([...document.querySelectorAll('[role=status]')].some(n=>n.textContent.startsWith('Checking device storage')))window.__fiaChecking++;}).observe(document.body,{childList:true,subtree:true,characterData:true});});
  // Hold the drop for a while (QA held it for tens of seconds), then restore the network.
  await sleep(Number(process.env.FIA_DROP_MS||20000));
  const offlineAlert=await page.getByRole('alert').first().innerText().catch(()=>'(none)'),pauseShown=await page.getByRole('button',{name:'Pause download'}).count();
  // The background re-check (first after 5 s, then backing off) must not wipe the failure alert or flash "Checking…".
  const checkingFlashes=await page.evaluate(()=>window.__fiaChecking||0);
  if(offlineAlert==='(none)')throw Error('FAIL: the interrupted-Save alert is not shown after a re-check while offline');
  if(checkingFlashes)throw Error(`FAIL: "Checking device storage…" flashed ${checkingFlashes} time(s) during background re-checks`);
  console.log(JSON.stringify({offlineAlert,checkingFlashes,pauseShown,panel:(await page.locator('.pack-card').first().innerText()).slice(0,400)}));
  network(true);
  // The network is back: the Save must be retryable.
  let enabled=false;const t0=Date.now();
  while(Date.now()-t0<20000){if(await button.count()&&await button.isEnabled())break;await sleep(500);}
  enabled=await button.count()>0&&await button.isEnabled();
  const row=await page.locator('.pack-card .library-message[role=status]').first().innerText().catch(()=>'(none)'),label=await page.locator('.pack-card button.secondary.full').last().innerText().catch(()=>'');
  console.log(JSON.stringify({retryEnabledWithin20s:enabled,row,label,pauseShown:await page.getByRole('button',{name:'Pause download'}).count()}));
  if(!enabled)throw Error('FAIL: "Download selection" still disabled 20 s after the network returned');
  await button.click();
  await page.getByText('The download is verified. Reload to use the saved version. Your place is kept.').waitFor({timeout:90000});
  const entries=await page.evaluate(async()=>{let n=0;for(const name of await caches.keys())if(/^fia-v3-pack-/.test(name))n+=(await (await caches.open(name)).keys()).length;return n;});
  console.log(JSON.stringify({verifiedSave:true,packCacheEntries:entries}));
  if(!entries)throw Error('FAIL: pack cache empty after verified save');
  console.log('PASS');code=0;
 }catch(e){console.log(e.message);}
 finally{await browser?.close();server.kill();proxy.close();process.exit(code);}
})();
