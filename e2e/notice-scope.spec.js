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

// The notice a Scripture screen without a recording raises follows what the server served (JOURNEY-C1).
// A server-executable presentation declares each screen's narration: a blocked one says the recording is
// unavailable. The registry presentation (production) has no recording path, and automatic Scripture
// reading says so. Read from the target's own answers for the revision the page opened.
const unavailableNotice='This recording is unavailable. You can continue.';
async function servedNotice(page,id,activityId){
 const record=await (await page.request.get(`/v1/packs/${id}`)).json(),opened=await page.evaluate(id=>JSON.parse(localStorage.getItem(`fia-v3-progress@1:${id}`)||'null')?.revision,id);
 if(opened)expect(record.revision,'the page opened what the server serves').toBe(opened);
 const presentation=await (await page.request.get(`/v1/artifacts/${record.artifact.sha256}`)).json(),activity=presentation.activities.find(a=>a.id===activityId);
 if(!presentation.execution)return {mode:'registry',notice:activity.kind==='scripture'&&!activity.audioSrc?scriptureNotice:null};
 const narration=activity.execution.narration;
 return {mode:`executable, ${narration.action}${narration.reason?` (${narration.reason})`:''}`,notice:narration.action==='blocked'?unavailableNotice:null};
}
// Saved place on the guide screen just before the first reading, automatic guide narration off,
// automatic Scripture on: Continue reaches a reading with no recording (the audit's PROD steps).
// open 'passages' opens it from the Passages sheet, as a person does: the server then always answers
// with its prepared presentation, so the journey does not depend on which earlier test (easy-button
// R6.2/K4, passage-switch A5) already prepared it in the shared Worker state. open 'restore' relaunches
// into it, which serves whatever is current. Returns the notice the Scripture screen raised.
async function startBeforeReading(page,id,{open='restore'}={}){
 const activities=activitiesOf(id),session=createSession(activities);session.index=activities.findIndex(a=>a.kind==='scripture')-1;
 const pack=registry.packs.find(p=>p.id===id);
 await page.addInitScript(([id,progress,device,restore])=>{if(!localStorage.getItem(`fia-v3-progress@1:${id}`)){if(restore)localStorage.setItem('fia-v3-selected-pack',id);localStorage.setItem(`fia-v3-progress@1:${id}`,JSON.stringify(progress));localStorage.setItem('fia-v3-preferences@1',JSON.stringify(device));}},[id,{total:activities.length,revision:pack.revision,activityId:activities[session.index].id,session},{muted:true,preferences:session.preferences},open==='restore']);
 await page.goto('/');await controlled(page);
 if(open==='passages'){await passages(page);await card(page,pack.title).getByRole('button',{name:/Open passage|Resume passage/}).click();await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:30000});}
 await expect(page.locator('h1').first()).toHaveText(activities[session.index].prompt,{timeout:10000});
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 const reading=activities[session.index+1].id;
 await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem(`fia-v3-progress@1:${id}`)||'null')?.activityId,id)).toBe(reading);
 const served=await servedNotice(page,id,reading);
 test.info().annotations.push({type:'served',description:`${id} ${reading}: ${served.mode}`});
 expect(served.notice,`${id} ${reading} serves a recording (${served.mode}); this journey needs a Scripture screen without one`).not.toBeNull();
 await expect(page.locator('.scene-notice')).toHaveText([served.notice],{timeout:5000});
 return served.notice;
}
// G5: in-page record of when the new heading first renders, when the stale notice was last seen after it,
// and how long after it the stale notice was first absent.
async function watchStale(page,stale,heading){
 await page.evaluate(([stale,heading])=>{const w=window.__staleNotice={headingAt:null,staleAfterHeading:null,goneAfterHeading:null};const look=()=>{const now=performance.now(),shown=[...document.querySelectorAll('[role="status"]')].some(n=>n.textContent.includes(stale));if(w.headingAt===null&&[...document.querySelectorAll('h1')].some(h=>h.textContent===heading))w.headingAt=now;if(w.headingAt===null)return;if(shown)w.staleAfterHeading=now-w.headingAt;else w.goneAfterHeading??=now-w.headingAt;};new MutationObserver(look).observe(document.body,{subtree:true,childList:true,characterData:true});const frame=()=>{look();requestAnimationFrame(frame);};requestAnimationFrame(frame);},[stale,heading]);
}
const passages=async page=>{await page.getByRole('button',{name:'Session progress: open section overview'}).click();await page.getByRole('button',{name:/^Passages/}).click();};
const card=(page,title)=>page.getByRole('dialog').locator('article.pack-card').filter({has:page.getByRole('heading',{name:title,exact:true})});
async function openFromSheet(page,title,heading){await card(page,title).getByRole('button',{name:/Open passage|Resume passage/}).click();await expect(page.locator('h1').first()).toHaveText(heading,{timeout:5000});await page.waitForTimeout(400);return page.evaluate(()=>window.__staleNotice);}

test('R3/C1 G5: a Scripture notice on Mark 1:21–28 is gone within 300 ms of Mark 1:29–34’s heading',async({page})=>{
 const stale=await startBeforeReading(page,'eng.MRK-1-21-28',{open:'passages'});const next=activitiesOf('eng.MRK-1-29-34')[0],heading=next.prompt;
 await watchStale(page,stale,heading);await passages(page);
 const seen=await openFromSheet(page,'Mark 1:29–34',heading);
 expect(seen.headingAt).not.toBeNull();
 expect(seen.goneAfterHeading,JSON.stringify(seen)).not.toBeNull();expect(seen.goneAfterHeading,JSON.stringify(seen)).toBeLessThanOrEqual(300);
 // R3 item 2: the new passage may raise its own notice. When it reads the same, it is the new passage's
 // (raised after the stale one was gone); otherwise the stale text never shows beside the new heading.
 const own=await servedNotice(page,'eng.MRK-1-29-34',next.id);
 test.info().annotations.push({type:'served',description:`eng.MRK-1-29-34 ${next.id}: ${own.mode}`});
 if(own.notice===stale)await expect(page.locator('.scene-notice')).toHaveText([own.notice]);
 else{expect(seen.staleAfterHeading,JSON.stringify(seen)).toBeNull();await expect(page.getByText(stale)).toHaveCount(0);}
});

test('R3/C2 G5: a Spanish RV1909 notice does not carry onto English Mark 1:14–20',async({page})=>{
 const stale=await startBeforeReading(page,'spa.MRK-1-14-20');const heading=activitiesOf('eng.MRK-1-14-20')[0].prompt;
 await page.getByRole('button',{name:'Session progress: open section overview'}).click();await page.getByRole('button',{name:/^Language/}).click();await page.getByRole('dialog').getByRole('button',{name:/English/}).click();await page.getByRole('button',{name:'Close',exact:true}).first().click();
 await watchStale(page,stale,heading);await passages(page);
 const seen=await openFromSheet(page,'Mark 1:14–20',heading);
 expect(seen.headingAt).not.toBeNull();expect(seen.staleAfterHeading).toBeNull();await expect(page.locator('.scene-notice')).toHaveCount(0);
});

test('R3/C4 G6: a notice raised while a sheet is open shows on top, inside the sheet, and leaves Close reachable',async({page})=>{
 await page.addInitScript(()=>{const setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='fia-v3-library-language')throw new DOMException('Fault-injected storage refusal','QuotaExceededError');return setItem.call(this,key,value);};});
 await page.goto('/');await controlled(page);
 await page.getByRole('button',{name:'Session progress: open section overview'}).click();await page.getByRole('button',{name:/^Language/}).click();await page.getByRole('dialog').getByRole('button',{name:/Español/}).click();
 const notice=page.getByRole('dialog').getByRole('status').filter({hasText:'Language choice could not be saved on this device.'});await expect(notice).toBeVisible();
 const centre=async locator=>{const box=await locator.boundingBox();return {x:box.x+box.width/2,y:box.y+box.height/2};};
 expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('[role="status"]')?.textContent||null,await centre(notice))).toBe('Language choice could not be saved on this device.');
 const close=page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).first();
 expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('button')?.getAttribute('aria-label')||null,await centre(close))).toBe('Close');
 await expect(page.locator('main .scene-notice')).toHaveCount(0);
 await close.click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText('Language choice could not be saved on this device.')).toHaveCount(0);
});
