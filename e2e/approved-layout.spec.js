import {test,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {selectApprovedDelivery} from './approved-layout-delivery.mjs';
import {createSession} from '../apps/web/src/lib/engine.js';

const pack=JSON.parse(readFileSync('apps/web/src/lib/pack.json'));
const origin='http://127.0.0.1:4197';
const imageMode=process.env.FIA_LAYOUT_IMAGE_MODE||'not-executed';
// The served delivery ledger, not original JPEG/PNG bytes, owns the output oracle.
function deliveryOracle(id){
 const manifest=JSON.parse(readFileSync('dist/offline/eng.MRK-1-1-13.json'));
 const ledgerBytes=readFileSync(`apps/web/public/content/delivery/eng.MRK-1-1-13/${manifest.deliveryRevision}.json`);
 return selectApprovedDelivery({manifest,ledgerBytes,logicalPath:pack.assets[id].src});
}

// Every external SW request is paused at Request stage and failed before transport.
// This is explicit controlled denial, never publisher/network failure evidence.
async function guardServiceWorker(browser,worker,receipt){
 const root=await browser.newBrowserCDPSession();
 const targets=await root.send('Target.getTargets');
 const target=targets.targetInfos.find(t=>t.type==='service_worker'&&t.url===worker.url());
 if(!target)throw Error('Exact service worker unavailable; no image selection allowed');
 const {sessionId}=await root.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
 let seq=0;const pending=new Map();
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});root.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);});
 root.on('Target.receivedMessageFromTarget',({sessionId:s,message})=>{
  if(s!==sessionId)return;const m=JSON.parse(message);
  if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(JSON.stringify(m.error))):p?.resolve(m.result);return;}
  if(m.method==='Fetch.requestPaused'){
   const p=m.params;
   if(new URL(p.request.url).origin!==origin){
    receipt.denials.push({kind:'controlled-pretransport-denial',url:p.request.url,requestId:p.requestId,errorReason:'BlockedByClient'});
    send('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'}).then(()=>receipt.denials.push({kind:'denial-acknowledged',requestId:p.requestId})).catch(error=>receipt.denials.push({guardError:error.message}));
   }else send('Fetch.continueRequest',{requestId:p.requestId}).catch(error=>receipt.denials.push({guardError:error.message}));
  }
  if(m.method==='Network.loadingFailed')receipt.denials.push({kind:'network-failure',...m.params});
 });
 await send('Network.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
 return root;
}

async function runCase({page,request,context,browser},info,action){
 const receipt={version:await(await request.get('/version.json')).json(),scope:'Local390x844 Chromium; guide/Scripture layout or explicitly labeled controlled image unavailability; no Library/device/audio/production acceptance',imageMode,pageDenials:[],denials:[],observations:[]};
 expect(receipt.version.commit).toBe(process.env.EXPECT_COMMIT);
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(receipt.pageDenials.push({url:route.request().url(),kind:'controlled-page-denial'}),route.abort('blockedbyclient')));
 const session=createSession(pack.activities);session.preferences.narrateGuide=false;session.preferences.readScripture=false;
 await page.addInitScript(session=>{if(!localStorage.getItem('fia-v3-session@2'))localStorage.setItem('fia-v3-session@2',JSON.stringify({session,muted:true}));},session);
 const output=process.env.FIA_LAYOUT_RECEIPTS||'/tmp/fia-approved-layout-corrected';mkdirSync(output,{recursive:true});
 const name=info.title.replace(/[^a-z0-9]+/gi,'-');
 try{
  await page.goto('/');await page.evaluate(()=>navigator.serviceWorker.ready);
  await expect.poll(()=>context.serviceWorkers().length).toBe(1);
  await guardServiceWorker(browser,context.serviceWorkers()[0],receipt);
  await expect(page.getByRole('button',{name:/^Choose passage:/})).toContainText('Mark 1:1–13');
  await expect(page.locator('.reading-verses')).toContainText(pack.activities[0].narration);
  await action(receipt);
  expect(receipt.denials.some(e=>e.guardError)).toBe(false);
  await expect.poll(()=>receipt.denials.filter(e=>e.kind==='controlled-pretransport-denial').every(e=>receipt.denials.some(a=>a.kind==='denial-acknowledged'&&a.requestId===e.requestId))).toBe(true);
 }finally{
  writeFileSync(`${output}/${name}.json`,JSON.stringify(receipt,null,2));
  await page.screenshot({path:`${output}/${name}.png`}).catch(()=>{});
  await info.attach('approved-layout',{body:JSON.stringify(receipt,null,2),contentType:'application/json'});
 }
}
async function readingSize(page,size){
 await page.getByRole('button',{name:'More options',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByLabel('Reading size').selectOption({label:size});await page.getByRole('button',{name:'Close',exact:true}).click();
}
async function explore(page,id){
 const asset=pack.assets[id],category=asset.kind==='scripture'?'Scripture translations':asset.kind==='map'?'Maps':'Images',name=asset.sourceEvidence?.short||asset.subtitle||asset.title;
 await page.getByRole('button',{name:'More options',exact:true}).click();await page.getByRole('button',{name:'Passage resources',exact:true}).click();
 const details=page.locator('details').filter({has:page.locator('summary').getByText(category,{exact:true})});await details.locator('summary').click();
 const matches=Object.values(pack.assets).filter(a=>a.kind===asset.kind&&(a.sourceEvidence?.short||a.subtitle||a.title)===name);
 await details.getByRole('button',{name,exact:true}).nth(matches.findIndex(a=>a.id===id)).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 const selected=await page.evaluate(()=>JSON.parse(localStorage.getItem('fia-v3-session@2')).session);expect(selected.detour).toBe(id);expect(selected.index).toBe(0);
}
async function observeLayout(page,id,size,receipt){
 await expect(page.locator('.guide-primary')).not.toHaveAttribute('aria-busy','true');
 await expect(page.locator('.step-resources')).toHaveCount(0);await expect(page.locator('main.scene')).not.toHaveClass(/has-step-resources/);
 const geometry=await page.evaluate(()=>{const scene=document.querySelector('main.scene'),controls=document.querySelector('.scene-controls');return {reserved:scene.style.getPropertyValue('--step-resources-height'),controlBandHeight:controls.getBoundingClientRect().height,scale:scene.style.getPropertyValue('--reading-scale')};});
 expect(geometry.reserved).toBe('');expect(geometry.controlBandHeight).toBe(112);expect(geometry.scale).toBe(size==='Standard'?'1':'1.5');
 const row={id,size,geometry};receipt.observations.push(row);return row;
}
async function returnToGuide(page){
 await page.getByRole('button',{name:'Return to guide',exact:true}).click();await expect(page.locator('.reading-verses')).toContainText(pack.activities[0].narration);
 const selected=await page.evaluate(()=>JSON.parse(localStorage.getItem('fia-v3-session@2')).session);expect(selected.detour).toBeNull();expect(selected.index).toBe(0);
}

// These independent non-media cases remain executable when any image is unavailable.
for(const size of ['Standard','Largest'])test(`guide and all Scripture editions preserve approved layout at ${size}`,async({page,request,context,browser},info)=>runCase({page,request,context,browser},info,async receipt=>{
 await readingSize(page,size);await observeLayout(page,'guide',size,receipt);
 for(const id of ['scripture-BereanStandardBible','scripture-unfoldingWordLiteral','scripture-unfoldingWordSimplified']){
  await explore(page,id);const row=await observeLayout(page,id,size,receipt),actual=await page.locator('.reading-verses > p').allTextContents();
  for(let i=0;i<pack.assets[id].verses.length;i++)expect(actual[i]).toContain(pack.assets[id].verses[i].text);
  row.readableVerseCount=actual.length;await returnToGuide(page);
 }
}));

for(const id of ['a112','c197','a203'])for(const size of ['Standard','Largest'])test(`image ${id} ${size} approved layout and delivery identity`,async({page,request,context,browser},info)=>{
 test.skip(!['controlled-unavailable','verified-local-delivery'].includes(imageMode),'Actual WebP decode is unexecuted without verified local delivery; no remote acquisition. Use controlled-unavailable only for denial/layout proof.');
 await runCase({page,request,context,browser},info,async receipt=>{
  const oracle=deliveryOracle(id);receipt.deliveryOracle=oracle;await readingSize(page,size);await explore(page,id);
  const row=await observeLayout(page,id,size,receipt);
  if(imageMode==='controlled-unavailable'){
   await expect(page.locator('.media-error')).toContainText(/Failed to fetch|unavailable|not saved|not prepared/i);await expect(page.locator('.visual-viewport img')).toHaveCount(0);
   row.controlledUnavailable=await page.locator('.media-error').innerText();
   expect(receipt.denials.some(e=>e.kind==='controlled-pretransport-denial'&&e.url===oracle.url)).toBe(true);
  }else{
   const image=page.locator('.visual-viewport img');await expect(image).toBeVisible();
   row.image=await image.evaluate(async img=>{await img.decode();const r=await fetch(img.currentSrc),b=await r.arrayBuffer();return {src:img.currentSrc,width:img.naturalWidth,height:img.naturalHeight,mime:r.headers.get('content-type')?.split(';')[0],bytes:b.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(n=>n.toString(16).padStart(2,'0')).join('')};});
   expect({sha256:row.image.sha256,bytes:row.image.bytes,mime:row.image.mime}).toEqual({sha256:oracle.sha256,bytes:oracle.bytes,mime:oracle.mime});
   expect(row.image.width).toBe(oracle.width);expect(row.image.height).toBe(oracle.height);
   expect(receipt.denials.filter(e=>e.kind==='controlled-pretransport-denial')).toHaveLength(0);
  }
  await returnToGuide(page);
 });
});

// Direct authored focal states are distinct from menu detours, which hide the old footer.
// Install the SW guard on the safe first guide before controlled progress adoption/reload.
for(const activityId of ['S01-U002','S01-U002-reading-1','S02-U005','S02-U005-resource-c197','S02-U008','S02-U008-resource-a204'])for(const size of ['Standard','Largest'])test(`direct authored ${activityId} ${size} has no resource footer`,async({page,request,context,browser},info)=>{
 const activity=pack.activities.find(a=>a.id===activityId);expect(activity).toBeTruthy();
 const asset=pack.assets[activity.assetId],visual=asset&&['image','map'].includes(asset.kind);
 test.skip(visual&&imageMode!=='controlled-unavailable','Direct visual layout requires explicit pretransport controlled-unavailable mode; real decode remains separate and unexecuted.');
 await runCase({page,request,context,browser},info,async receipt=>{
  const session=createSession(pack.activities);session.index=pack.activities.indexOf(activity);session.preferences.narrateGuide=false;session.preferences.readScripture=false;
  const descriptor=JSON.parse(readFileSync('apps/web/public/content/registry.json')).packs.find(p=>p.id==='eng.MRK-1-1-13');
  receipt.controlledSourceProgress={activityId,index:session.index,detour:null,scope:'Explicit controlled authored-progress seed after SW guard; not a natural progression journey'};
  await page.evaluate(({session,activityId,revision,total,size})=>{
   const scale=size==='Standard'?1:1.5;localStorage.setItem('fia-v3-session@2',JSON.stringify({session,muted:true,scale}));
   localStorage.setItem('fia-v3-progress@1:eng.MRK-1-1-13',JSON.stringify({session,revision,total,activityId}));
   localStorage.setItem('fia-v3-preferences@1',JSON.stringify({muted:true,scale,preferences:session.preferences}));
  },{session,activityId,revision:descriptor.revision,total:pack.activities.length,size});
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fia-v3-session@2')).session.index)).toBe(session.index);
  await expect(page.getByRole('button',{name:/^Choose passage:/})).toContainText('Mark 1:1–13');
  const actual=await page.evaluate(()=>JSON.parse(localStorage.getItem('fia-v3-session@2')).session);expect(actual.index).toBe(session.index);expect(actual.detour).toBeNull();
  const heldInstruction=activity.narration||activity.prompt;
  if(visual)await expect(page.locator('.unavailable-words .reading-verses')).toContainText(heldInstruction);
  else if(asset?.kind==='scripture')await expect(page.locator('.reading-verses')).toContainText(asset.verses[0].text);
  else await expect(page.locator('.reading-verses')).toContainText(heldInstruction);
  const row=await observeLayout(page,activityId,size,receipt);row.heldInstruction=heldInstruction;
  if(visual){
   const oracle=deliveryOracle(asset.id);receipt.deliveryOracle=oracle;
   await expect(page.locator('.media-error')).toContainText(/Failed to fetch|unavailable|not saved|not prepared/i);await expect(page.locator('.visual-viewport img')).toHaveCount(0);
   row.controlledUnavailable=await page.locator('.media-error').innerText();
   expect(receipt.denials.some(e=>e.kind==='controlled-pretransport-denial'&&e.url===oracle.url)).toBe(true);
  }else if(asset?.kind==='scripture'){
   const paragraphs=await page.locator('.reading-verses > p').allTextContents();for(let i=0;i<asset.verses.length;i++)expect(paragraphs[i]).toContain(asset.verses[i].text);row.readableVerseCount=paragraphs.length;
  }else await expect(page.locator('.reading-verses')).toContainText(activity.sourceText||activity.narration);
 });
});
