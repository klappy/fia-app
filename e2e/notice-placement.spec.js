import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createSession} from '../apps/web/src/lib/engine.js';
// A raised notice never covers the stage's own words (fia-app-cookbook work/active/2026-11-03-narration-blocked-toast-overlap):
// at 390×844 and 1280×800, light and dark, the narration-blocked and offline notices sit clear of the stage title,
// credit and guide text on Mark 1:14–20 S02-U008 (a picture with its title and credit) and S02-U009 (guide text).
// The narration-blocked notice is data-driven: the packaged Worker preview serves S02-U008 and S02-U009 with
// narration blocked, and the static preview cannot open Mark 1:14–20 from /v1, so the whole spec runs with FIA_WORKER_PREVIEW=1.
const registry=JSON.parse(readFileSync(new URL('../apps/web/public/content/registry.json',import.meta.url)));
const id='eng.MRK-1-14-20',pack=registry.packs.find(p=>p.id===id);
const activities=JSON.parse(readFileSync(new URL('../apps/web/public'+pack.presentation.url,import.meta.url))).activities;
const unavailable='This recording is unavailable. You can continue.';
const worker=process.env.FIA_WORKER_PREVIEW==='1';
test.beforeEach(()=>{test.skip(!worker,'Needs the packaged Worker preview (FIA_WORKER_PREVIEW=1)');});
// Text the stage paints for a person to read: titles, credits and the guide's words, wherever the step puts them.
const stageText='main.scene :is(.visual-identification,.expanded-identification,.reading-identification,.scripture-scroll,.unavailable-words,.words-stage) :is(h1,h2,h3,p,span,small,strong,em,a,cite)';
async function open(page,activityId,dark,expectText=null){
 const session=createSession(activities);session.index=activities.findIndex(a=>a.id===activityId);session.status='waiting';
 await page.addInitScript(([id,progress,device])=>{if(!localStorage.getItem(`fia-v3-progress@1:${id}`)){localStorage.setItem('fia-v3-selected-pack',id);localStorage.setItem(`fia-v3-progress@1:${id}`,JSON.stringify(progress));localStorage.setItem('fia-v3-preferences@1',JSON.stringify(device));}},[id,{total:activities.length,revision:pack.revision,activityId,session,dark},{muted:true,dark,preferences:{...session.preferences,readScripture:false}}]);
 await page.goto('/');
 await expect(page.getByRole('navigation',{name:'Session controls'})).toBeVisible();
 // Opened from the Passages sheet, as a person does, the Worker answers with its prepared (executable) presentation.
 // A cold Worker may still be preparing it on the first open, so reopen until the step declares its narration.
 if(expectText){
  await page.waitForFunction(()=>!!navigator.serviceWorker?.controller,null,{timeout:10000});
  const notice=page.locator('main.scene > .scene-notice');
  const shown=()=>notice.filter({hasText:expectText}).waitFor({timeout:15000}).then(()=>true,()=>false);
  for(let attempt=0;attempt<4&&!await shown();attempt++){
   await page.getByRole('button',{name:'Session progress: open section overview'}).click();await page.getByRole('button',{name:/^Passages/}).click();
   await page.getByRole('dialog').locator('article.pack-card').filter({has:page.getByRole('heading',{name:pack.title,exact:true})}).getByRole('button',{name:/Open passage|Resume passage/}).click({timeout:10000});
   await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:60000});
  }
 }
}
// Every visible text box of the stage, intersected with the notice's box; any positive area is an overlap.
async function overlaps(page){
 const notice=page.locator('main.scene > .scene-notice');await expect(notice).toBeVisible();
 await page.waitForTimeout(400);
 return page.evaluate(selector=>{
  const n=document.querySelector('main.scene > .scene-notice').getBoundingClientRect(),hits=[];
  for(const el of document.querySelectorAll(selector)){
   const range=document.createRange();range.selectNodeContents(el);
   for(const r of range.getClientRects()){if(!r.width||!r.height)continue;const style=getComputedStyle(el);if(style.visibility==='hidden'||+style.opacity===0)continue;
    const w=Math.min(r.right,n.right)-Math.max(r.left,n.left),h=Math.min(r.bottom,n.bottom)-Math.max(r.top,n.top);
    if(w>0.5&&h>0.5)hits.push({text:el.textContent.trim().slice(0,60),box:[r.left,r.top,r.right,r.bottom].map(Math.round)});}
  }
  return {notice:[n.left,n.top,n.right,n.bottom].map(Math.round),hits};
 },stageText);
}
for(const [width,height] of [[390,844],[1280,800]])for(const dark of [false,true])for(const activityId of ['S02-U008','S02-U009']){
 const label=`${width}×${height} ${dark?'dark':'light'} ${activityId}`;
 test(`narration-blocked notice clears the stage words · ${label}`,async({browser,baseURL})=>{
  test.setTimeout(240000);
  const context=await browser.newContext({viewport:{width,height},baseURL}),page=await context.newPage();
  try{
   await open(page,activityId,dark,unavailable);
   const notice=page.locator('main.scene > .scene-notice');
   await expect(notice).toHaveText(unavailable);
   await expect(notice).toHaveAttribute('role','status');
   const seen=await overlaps(page);
   await test.info().attach(label,{body:await page.screenshot(),contentType:'image/png'});
   expect(seen.hits,JSON.stringify(seen)).toEqual([]);
   // The raised band holds the notice without opening a void: the guide's first line sits just under it (design-lens@1 rule 8).
   if(activityId==='S02-U009'&&width===390){
    const gap=await page.evaluate(()=>{
     const n=document.querySelector('main.scene > .scene-notice').getBoundingClientRect(),body=document.querySelector('main.scene .scripture-scroll .reading-verses');
     const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT,{acceptNode:t=>t.textContent.trim()?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP});
     const range=document.createRange();range.selectNodeContents(walker.nextNode());
     return range.getClientRects()[0].top-n.bottom;
    });
    expect(gap,`first guide line ${gap}px below the notice`).toBeGreaterThanOrEqual(0);
    expect(gap,`first guide line ${gap}px below the notice`).toBeLessThanOrEqual(24);
   }
   await expect(notice.getByRole('button',{name:'Dismiss notice'})).toBeVisible();
  }finally{await context.close();}
 });
 test(`offline notice clears the stage words · ${label}`,async({browser,baseURL})=>{
  const context=await browser.newContext({viewport:{width,height},baseURL,serviceWorkers:'block'}),page=await context.newPage();
  try{
   await open(page,activityId,dark);
   await page.waitForTimeout(500);
   await context.setOffline(true);
   const notice=page.locator('main.scene > .scene-notice');
   if(worker&&await notice.textContent().catch(()=>'')===unavailable)await notice.getByRole('button',{name:'Dismiss notice'}).click();
   await expect(notice).toHaveText(/offline/i,{timeout:5000});
   await expect(notice).toHaveAttribute('role','status');
   const seen=await overlaps(page);
   await test.info().attach(label,{body:await page.screenshot(),contentType:'image/png'});
   expect(seen.hits,JSON.stringify(seen)).toEqual([]);
  }finally{await context.close();}
 });
}
