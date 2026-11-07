import {test,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createSession} from '../apps/web/src/lib/engine.js';
const pack=JSON.parse(readFileSync('apps/web/src/lib/pack.json')),origin='http://127.0.0.1:4197';
const targets=['scripture-BereanStandardBible','a112','c197','a203'];
test('approved first-passage layout preserves focal space and existing resource menu at Standard and Largest reading sizes',async({page,request,context},info)=>{
 const receipt={version:await(await request.get('/version.json')).json(),scope:'Local390x844 Chromium layout/menu regression; no Library screenshot/publisher/device/audio acceptance',external:[],observations:[]};expect(receipt.version.commit).toBe(process.env.EXPECT_COMMIT);
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(receipt.external.push(route.request().url()),route.abort()));
 const session=createSession(pack.activities);session.preferences.narrateGuide=false;session.preferences.readScripture=false;
 await page.addInitScript(session=>{if(!localStorage.getItem('fia-v3-session@2'))localStorage.setItem('fia-v3-session@2',JSON.stringify({session,muted:true}));},session);
 try{
 await page.goto('/');await page.evaluate(()=>navigator.serviceWorker.ready);await expect(page.getByRole('button',{name:/^Choose passage:/})).toContainText('Mark 1:1–13');await expect(page.locator('.reading-verses')).toContainText(pack.activities[0].narration);
 async function observe(id,size){
  await expect(page.locator('.guide-primary')).not.toHaveAttribute('aria-busy','true');
  await expect(page.locator('.step-resources')).toHaveCount(0);await expect(page.locator('main.scene')).not.toHaveClass(/has-step-resources/);
  const geometry=await page.evaluate(()=>{const scene=document.querySelector('main.scene'),controls=document.querySelector('.scene-controls'),reading=document.querySelector('.scripture-scroll'),image=document.querySelector('.visual-viewport img'),rect=n=>{const r=n?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,width:r.width,height:r.height}:null;};return {height:innerHeight,reserved:scene.style.getPropertyValue('--step-resources-height'),chromeBottom:parseFloat(getComputedStyle(controls).height),chromeBottomExpression:getComputedStyle(scene).getPropertyValue('--chrome-bottom'),controls:rect(controls),reading:rect(reading),image:rect(image),scale:scene.style.getPropertyValue('--reading-scale')};});
  expect(geometry.reserved).toBe('');expect(geometry.chromeBottom).toBe(112);expect(geometry.controls.height).toBe(112);expect(geometry.scale).toBe(size==='Standard'?'1':'1.5');
  const row={id,size,geometry};
  if(pack.assets[id]?.kind==='scripture'){const actual=await page.locator('.reading-verses > p').allTextContents();for(let i=0;i<pack.assets[id].verses.length;i++)expect(actual[i]).toContain(pack.assets[id].verses[i].text);row.readableVerseCount=actual.length;}
  else if(id!=='guide'){
   const image=page.locator('.visual-viewport img');if(await image.count()){
    row.image=await image.evaluate(async img=>{await img.decode();const b=await(await fetch(img.currentSrc)).arrayBuffer();return {src:img.currentSrc,width:img.naturalWidth,height:img.naturalHeight,bytes:b.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(n=>n.toString(16).padStart(2,'0')).join('')};});expect(row.image.width).toBeGreaterThan(0);const source=readFileSync('apps/web/public'+pack.assets[id].src);expect(row.image.sha256).toBe(createHash('sha256').update(source).digest('hex'));
   }else{row.unavailable=await page.locator('.media-error').innerText();receipt.observations.push(row);throw Error(`Approved local ${id} did not render: ${row.unavailable}`);}
  }
  receipt.observations.push(row);mkdirSync('/tmp/fia-approved-layout',{recursive:true});await page.screenshot({path:`/tmp/fia-approved-layout/${size}-${id}.png`});
 }
 for(const size of ['Standard','Largest']){
  await page.getByRole('button',{name:'More options',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Reading size').selectOption({label:size});await page.getByRole('button',{name:'Close',exact:true}).click();await observe('guide',size);
  for(const id of targets){const asset=pack.assets[id],category=asset.kind==='scripture'?'Scripture translations':asset.kind==='map'?'Maps':'Images',name=asset.sourceEvidence?.short||asset.subtitle||asset.title;
   await page.getByRole('button',{name:'More options',exact:true}).click();await page.getByRole('button',{name:'Passage resources',exact:true}).click();const details=page.locator('details').filter({has:page.locator('summary').getByText(category,{exact:true})});await details.locator('summary').click();const matches=Object.values(pack.assets).filter(a=>a.kind===asset.kind&&(a.sourceEvidence?.short||a.subtitle||a.title)===name);await details.getByRole('button',{name,exact:true}).nth(matches.findIndex(a=>a.id===id)).click();await expect(page.getByRole('dialog')).toHaveCount(0);await observe(id,size);await page.getByRole('button',{name:'Return to guide',exact:true}).click();await expect(page.locator('.reading-verses')).toContainText(pack.activities[0].narration);
  }
 }
 expect(receipt.external).toEqual([]);
 }finally{mkdirSync('/tmp/fia-approved-layout',{recursive:true});writeFileSync('/tmp/fia-approved-layout/receipt.json',JSON.stringify(receipt,null,2));await info.attach('approved-layout',{body:JSON.stringify(receipt,null,2),contentType:'application/json'});}
});
