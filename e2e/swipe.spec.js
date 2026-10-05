import {test,expect} from '@playwright/test';
import {seedPassage,saved} from './helpers.js';
import {readFileSync} from 'node:fs';
import {activities,assets} from '../apps/web/src/lib/content.js';

async function swipe(page,selector,from,to){
 await page.locator(selector).first().evaluate((el,{from,to})=>{
  const touch=(x,y)=>new Touch({identifier:1,target:el,clientX:x,clientY:y});
  el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[touch(...from)],changedTouches:[touch(...from)]}));
  el.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,touches:[touch(...to)],changedTouches:[touch(...to)]}));
  el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[touch(...to)]}));
 },{from,to});
}
test('swipe dispatches existing next/back and rejects controls, edges, vertical and sheet gestures',async({page})=>{
 await page.setViewportSize({width:390,height:844});await seedPassage(page);
 const initial=(await saved(page)).index;
 await swipe(page,'.scene',[270,350],[120,350]);await expect.poll(async()=>(await saved(page)).index).toBeGreaterThan(initial);
 await swipe(page,'.scene',[120,350],[270,350]);await expect.poll(async()=>(await saved(page)).index).toBe(initial);
 for(const [selector,from,to] of [['.scene',[10,350],[170,350]],['.scene',[250,350],[150,550]],['.guide-primary',[270,350],[120,350]]]){
  await swipe(page,selector,from,to);expect((await saved(page)).index).toBe(initial);
 }
 await page.getByRole('button',{name:'More options'}).click();await swipe(page,'.scene',[270,350],[120,350]);expect((await saved(page)).index).toBe(initial);
});

test('native touch scroll remains available and horizontal touch uses existing navigation',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','Native touch input probe uses Chromium CDP; not physical-device proof');
 await page.setViewportSize({width:390,height:844});await seedPassage(page,'S01-U002-reading-1');
 const initial=(await saved(page)).index,scroll=page.locator('.scripture-scroll');await expect(scroll).toBeVisible();
 const input=await context.newCDPSession(page);
 async function drag(x,y,dx,dy){await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=8;i++){await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/8,y:y+dy*i/8}]});await page.waitForTimeout(20);}await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 await drag(200,550,0,-200);await expect.poll(()=>scroll.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);expect((await saved(page)).index).toBe(initial);
 await drag(270,350,-150,0);await expect.poll(async()=>(await saved(page)).index).toBeGreaterThan(initial);
 await input.detach();
});

// Availability is a static fixture here; real delivery integrity remains in the
// worker/journey suites. The rendered map and native video controls are real DOM.
for(const kind of ['map','video'])test(`${kind} gestures do not navigate the passage`,async({page})=>{
 const manifest=JSON.parse(readFileSync(new URL('../dist/offline/eng.MRK-1-1-13.json',import.meta.url),'utf8'));
 await page.addInitScript(manifest=>{const active={postMessage(message,ports){ports[0].postMessage({ok:true,saved:true,active:{manifest,files:manifest.files}});}};Object.defineProperty(navigator,'serviceWorker',{value:{ready:Promise.resolve({active}),register:async()=>({active})},configurable:true});},manifest);
 const activity=kind==='map'?activities.find(a=>assets[a.assetId]?.kind==='map'):activities[0];expect(activity).toBeTruthy();
 await seedPassage(page,activity.id);const initial=(await saved(page)).index;
 if(kind==='video'){await page.getByRole('button',{name:'More options'}).click();await page.getByRole('button',{name:'Passage resources',exact:true}).click();await page.locator('summary').filter({hasText:/^Videos$/}).click();await page.getByRole('dialog').getByRole('button',{name:'Jordan River',exact:false}).click();}
 if(kind==='map'){
  await expect(page.locator('.visual-viewport img')).toBeVisible();
  await swipe(page,'.visual-viewport',[270,350],[120,350]);expect((await saved(page)).index).toBe(initial);
  await page.locator('.visual-viewport').click();await expect(page.locator('.visual-dialog[open]')).toBeVisible();
  const viewport=page.locator('.visual-dialog .visual-viewport');await viewport.locator('img').evaluate(img=>img.decode());await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await viewport.focus();await viewport.press('+');
  await expect(viewport.locator('img')).toHaveAttribute('style',/scale\(1\.5\)/);
  const before=await viewport.locator('img').getAttribute('style');await viewport.press('ArrowRight');
  expect(await viewport.locator('img').getAttribute('style')).not.toBe(before);
  await swipe(page,'.visual-dialog .visual-viewport',[270,350],[120,350]);expect((await saved(page)).index).toBe(initial);
 }else{
  await expect(page.locator('video')).toBeVisible();await swipe(page,'video',[270,350],[120,350]);expect((await saved(page)).index).toBe(initial);
  expect(await page.locator('video').evaluate(v=>v.paused)).toBe(true);
 }
});

test('selected text prevents passage swipe',async({page})=>{
 await seedPassage(page,'S01-U002-reading-1');const initial=(await saved(page)).index;
 await page.locator('.scripture-scroll').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);});
 expect(await page.evaluate(()=>window.getSelection().toString().length)).toBeGreaterThan(0);
 await swipe(page,'.scene',[270,350],[120,350]);expect((await saved(page)).index).toBe(initial);
});
