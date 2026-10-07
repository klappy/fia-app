import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createSession} from '../apps/web/src/lib/engine.js';
// R3 notices belong to the passage and screen that raised them: scripted-journey guards
// G5 (gone within 300 ms of the new heading) and G6 (a notice raised over a sheet is
// visible on top), against the packaged Worker preview with the service worker allowed.
const registry=JSON.parse(readFileSync(new URL('../apps/web/public/content/registry.json',import.meta.url)));
const activitiesOf=id=>JSON.parse(readFileSync(new URL('../apps/web/public'+registry.packs.find(p=>p.id===id).presentation.url,import.meta.url))).activities;
const scriptureNotice='No recording is available for this Scripture passage. You can read it and continue.';
const controlled=page=>page.waitForFunction(()=>!!navigator.serviceWorker?.controller,null,{timeout:5000});
test.beforeEach(()=>{test.skip(process.env.FIA_WORKER_PREVIEW!=='1','Needs the packaged Worker preview (FIA_WORKER_PREVIEW=1)');});

// Saved place on the guide screen just before the first reading, automatic guide narration off,
// automatic Scripture on: Continue reaches a reading with no recording (the audit's PROD steps).
async function startBeforeReading(page,id){
 const activities=activitiesOf(id),session=createSession(activities);session.index=activities.findIndex(a=>a.kind==='scripture')-1;
 const pack=registry.packs.find(p=>p.id===id);
 await page.addInitScript(([id,progress,device])=>{if(!localStorage.getItem('fia-v3-selected-pack')){localStorage.setItem('fia-v3-selected-pack',id);localStorage.setItem(`fia-v3-progress@1:${id}`,JSON.stringify(progress));localStorage.setItem('fia-v3-preferences@1',JSON.stringify(device));}},[id,{total:activities.length,revision:pack.revision,activityId:activities[session.index].id,session},{muted:true,preferences:session.preferences}]);
 await page.goto('/');await controlled(page);
 await expect(page.locator('h1').first()).toHaveText(activities[session.index].prompt,{timeout:10000});
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await expect(page.locator('.scene-notice')).toHaveText([scriptureNotice],{timeout:5000});
}
// G5: in-page record of when the new heading first renders and when the stale notice was last seen.
async function watchStale(page,stale,heading){
 await page.evaluate(([stale,heading])=>{const w=window.__staleNotice={headingAt:null,staleAfterHeading:null};const look=()=>{const now=performance.now(),shown=[...document.querySelectorAll('[role="status"]')].some(n=>n.textContent.includes(stale));if(w.headingAt===null&&[...document.querySelectorAll('h1')].some(h=>h.textContent===heading))w.headingAt=now;if(w.headingAt!==null&&shown)w.staleAfterHeading=now-w.headingAt;};new MutationObserver(look).observe(document.body,{subtree:true,childList:true,characterData:true});const frame=()=>{look();requestAnimationFrame(frame);};requestAnimationFrame(frame);},[stale,heading]);
}
const passages=async page=>{await page.getByRole('button',{name:'More options'}).click();await page.getByRole('button',{name:'Passages',exact:true}).click();};
const card=(page,title)=>page.getByRole('dialog').locator('article.pack-card').filter({has:page.getByRole('heading',{name:title,exact:true})});
async function openFromSheet(page,title,heading){await card(page,title).getByRole('button',{name:/Open passage|Resume passage/}).click();await expect(page.locator('h1').first()).toHaveText(heading,{timeout:5000});await page.waitForTimeout(400);return page.evaluate(()=>window.__staleNotice);}

test('R3/C1 G5: a Scripture notice on Mark 1:21–28 is gone within 300 ms of Mark 1:29–34’s heading',async({page})=>{
 await startBeforeReading(page,'eng.MRK-1-21-28');const heading=activitiesOf('eng.MRK-1-29-34')[0].prompt;
 await watchStale(page,scriptureNotice,heading);await passages(page);
 const seen=await openFromSheet(page,'Mark 1:29–34',heading);
 expect(seen.headingAt).not.toBeNull();expect(seen.staleAfterHeading).toBeNull();await expect(page.getByText(scriptureNotice)).toHaveCount(0);
});

test('R3/C2 G5: a Spanish RV1909 notice does not carry onto English Mark 1:14–20',async({page})=>{
 await startBeforeReading(page,'spa.MRK-1-14-20');const heading=activitiesOf('eng.MRK-1-14-20')[0].prompt;
 await page.getByRole('button',{name:'More options'}).click();await page.getByRole('button',{name:/^Language/}).click();await page.getByRole('dialog').getByRole('button',{name:/English/}).click();await page.getByRole('button',{name:'Close',exact:true}).click();
 await watchStale(page,scriptureNotice,heading);await passages(page);
 const seen=await openFromSheet(page,'Mark 1:14–20',heading);
 expect(seen.headingAt).not.toBeNull();expect(seen.staleAfterHeading).toBeNull();await expect(page.locator('.scene-notice')).toHaveCount(0);
});

test('R3/C4 G6: a notice raised while a sheet is open shows on top, inside the sheet, and leaves Close reachable',async({page})=>{
 await page.addInitScript(()=>{const setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='fia-v3-library-language')throw new DOMException('Fault-injected storage refusal','QuotaExceededError');return setItem.call(this,key,value);};});
 await page.goto('/');await controlled(page);
 await page.getByRole('button',{name:'More options'}).click();await page.getByRole('button',{name:/^Language/}).click();await page.getByRole('dialog').getByRole('button',{name:/Español/}).click();
 const notice=page.getByRole('dialog').getByRole('status').filter({hasText:'Language choice could not be saved on this device.'});await expect(notice).toBeVisible();
 const centre=async locator=>{const box=await locator.boundingBox();return {x:box.x+box.width/2,y:box.y+box.height/2};};
 expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('[role="status"]')?.textContent||null,await centre(notice))).toBe('Language choice could not be saved on this device.');
 const close=page.getByRole('dialog').getByRole('button',{name:'Close',exact:true});
 expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('button')?.getAttribute('aria-label')||null,await centre(close))).toBe('Close');
 await expect(page.locator('main .scene-notice')).toHaveCount(0);
 await close.click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText('Language choice could not be saved on this device.')).toHaveCount(0);
});
