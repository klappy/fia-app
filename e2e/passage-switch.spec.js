import {test,expect} from '@playwright/test';
import {seedPassage} from './helpers.js';
// R1 truthful passage switch, against the actual packaged Worker preview with the
// service worker allowed. The refused pack U is fault-injected at the network, so the
// page must see exactly what the network said (G1) and say it in the sheet (G6).
// Chromium routes service-worker fetches through context.route only with this switch;
// without it the fault would bypass the service worker under test. Scoped to this file.
const SW_EVENTS='PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS',priorEvents=process.env[SW_EVENTS];
test.beforeAll(()=>{process.env[SW_EVENTS]='1';});
test.afterAll(()=>{if(priorEvents===undefined)delete process.env[SW_EVENTS];else process.env[SW_EVENTS]=priorEvents;});
const U='eng.MRK-1-14-20',refusal={status:'unavailable',reason:'fault-injected'};
const controlled=page=>page.waitForFunction(()=>navigator.serviceWorker?.controller!==null&&navigator.serviceWorker?.controller!==undefined,null,{timeout:5000});
async function refuse(context,delay=0){await context.route(`**/v1/packs/${U}`,async route=>{if(delay)await new Promise(r=>setTimeout(r,delay));await route.fulfill({status:404,contentType:'application/json',body:JSON.stringify(refusal)});});}
const seen=(page,path)=>{const responses=[];page.on('response',r=>{if(new URL(r.url()).pathname===path)responses.push(r);});return responses;};
const passages=async page=>{await page.getByRole('button',{name:'More options'}).click();await page.getByRole('button',{name:'Passages',exact:true}).click();};
const card=(page,title)=>page.getByRole('dialog').locator('article.pack-card').filter({has:page.getByRole('heading',{name:title,exact:true})});
// The packaged Worker preview locally, or DEV/staging after deploy; production has no /v1 reads yet.
test.beforeEach(()=>{test.skip(process.env.FIA_WORKER_PREVIEW!=='1'&&!['https://dev.fiaguide.app','https://staging.fiaguide.app'].includes(process.env.BASE_URL),'Needs the packaged Worker preview or a DEV/staging deployment');});

test('R1/A1 A2: a refused pack shows its truth in the sheet; Open was busy; the reading screen and current passage are unchanged',async({page,context})=>{
 await refuse(context,800);const responses=seen(page,`/v1/packs/${U}`);
 await seedPassage(page,'S01-U002');await controlled(page);const heading=await page.locator('h1').first().textContent();
 await passages(page);const target=card(page,'Mark 1:14–20'),open=target.getByRole('button',{name:/Open passage|Resume passage/});
 await open.click();await expect(open).toHaveAttribute('aria-busy','true');await expect(open).toBeDisabled();
 const alert=target.getByRole('alert');await expect(alert).toHaveText('This passage is not available yet. Your current passage stays open.',{timeout:5000});
 const fromSW=responses.filter(r=>r.fromServiceWorker());expect(fromSW.length).toBeGreaterThan(0);
 for(const r of responses){expect(r.status()).toBe(404);expect(r.headers()['content-type']).toContain('application/json');expect(await r.json()).toEqual(refusal);}
 const box=await alert.boundingBox();expect(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('[role="alert"]'),{x:box.x+box.width/2,y:box.y+box.height/2})).toBe(true);
 await expect(open).not.toHaveAttribute('aria-busy','true');await expect(target).toContainText('Not available yet');await expect(target).not.toContainText('available on request');
 await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('.scene-notice')).toHaveCount(0);await expect(page.getByText(/catalog is invalid/)).toHaveCount(0);
 expect(await page.locator('h1').first().textContent()).toBe(heading);expect(await page.evaluate(()=>localStorage.getItem('fia-v3-selected-pack'))).not.toBe(U);
});

test('R1/A3: with the refused pack saved, the first relaunch falls back once and clears the key; the second is quiet',async({page,context})=>{
 await refuse(context);await page.goto('/');await controlled(page);
 await page.evaluate(id=>localStorage.setItem('fia-v3-selected-pack',id),U);
 await page.reload();await controlled(page);
 await expect(page.locator('.scene-notice')).toHaveText(['Your last passage is not available yet, so Mark 1:1–13 is open.'],{timeout:5000});
 expect(await page.evaluate(()=>localStorage.getItem('fia-v3-selected-pack'))).toBeNull();
 const again=seen(page,`/v1/packs/${U}`);await page.reload();await controlled(page);await page.waitForTimeout(2500);
 await expect(page.locator('.scene-notice')).toHaveCount(0);expect(again).toHaveLength(0);expect(await page.evaluate(()=>localStorage.getItem('fia-v3-selected-pack'))).toBeNull();
});

test('R1/A5: from Mark 1:21–28, Passages → Resume Mark 1:1–13 opens at the saved screen within 5 s',async({page})=>{
 test.setTimeout(90000);const posts=[];page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/v1/'))posts.push({path:new URL(r.url()).pathname,status:r.status()});});
 await seedPassage(page,'S01-U002');await controlled(page);
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fia-v3-progress@1:eng.MRK-1-1-13')||'null')?.activityId)).toBeTruthy();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('fia-v3-progress@1:eng.MRK-1-1-13')).activityId),heading=await page.locator('h1').first().textContent();
 await passages(page);await card(page,'Mark 1:21–28').getByRole('button',{name:/Open passage|Resume passage/}).click();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('fia-v3-selected-pack')),{timeout:30000}).toBe('eng.MRK-1-21-28');await expect(page.getByRole('dialog')).toHaveCount(0);
 await passages(page);const back=card(page,'Mark 1:1–13').getByRole('button',{name:'Resume passage'});const started=Date.now();await back.click();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('fia-v3-selected-pack')),{timeout:5000}).toBe('eng.MRK-1-1-13');
 await expect(page.locator('h1').first()).toHaveText(heading,{timeout:Math.max(1,5000-(Date.now()-started))});await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('fia-v3-progress@1:eng.MRK-1-1-13')).activityId)).toBe(saved);
 expect(posts.filter(p=>p.status>=500)).toEqual([]);await expect(page.locator('.scene-notice')).toHaveCount(0);
});
