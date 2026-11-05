import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
// Captain rule (2026-11-05, iPhone Safari on the #324 preview): every pericope the app offers must play. The
// Passages sheet states each pericope's recording status; this walks every pericope the served delivery index
// publishes a recording for, opens it, taps the first card's primary and requires real native playback with no
// preparation failure. Pericopes that state "Guide recordings unavailable" must say so on the card and keep the
// text path working (no failure notice). Runs against BASE_URL (a deployed environment or the PR preview).
const registry=JSON.parse(readFileSync(new URL('../apps/web/public/content/registry.json',import.meta.url),'utf8'));
const titles=Object.fromEntries(registry.packs.map(p=>[p.id,p.title]));
const FAIL=/could not be checked|temporarily unavailable|not supported|belongs to another|changed|invalid|untrusted/i;
async function openPack(page,id){
 await page.goto('/');
 await page.getByRole('button',{name:'Session progress: open section overview',exact:true}).click();
 await page.getByRole('button',{name:/^Passages/}).click();
 const card=page.locator('article.pack-card').filter({has:page.getByRole('heading',{name:titles[id],exact:true})}).first();
 await card.scrollIntoViewIfNeeded();
 const status=await card.innerText();
 await card.getByRole('button',{name:/^Open passage: /}).click();
 return status;
}
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{window.__fiaStarted=0;const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){this.addEventListener('playing',()=>{window.__fiaStarted++;},{once:true});return play.apply(this,arguments);};});
});
test('every pericope with a published recording plays its first card',async({page,request})=>{
 test.skip(process.env.FIA_EVERY_PERICOPE!=='1','runs from playwright.preview.config.js against a deployed origin');
 test.setTimeout(240000);
 const index=await (await request.get('/content/delivery/index.json')).json();
 const ids=index.packs.map(p=>p.packId);expect(ids.length).toBeGreaterThan(0);
 for(const id of ids){
  const failures=[];const onResponse=r=>{if(new URL(r.url()).pathname.startsWith('/v1/prep')&&r.status()>=400&&![404,422].includes(r.status()))failures.push(`${r.status()} ${new URL(r.url()).pathname}`);};
  page.on('response',onResponse);
  const status=await openPack(page,id);
  expect(status,id+' is offered with a recording').not.toMatch(/recordings unavailable/);
  const primary=page.locator('nav[aria-label="Session controls"] .guide-primary');
  await expect(primary).not.toHaveAttribute('aria-busy','true',{timeout:30000});
  const playing=()=>page.evaluate(()=>window.__fiaStarted>0);
  // The first cards of a pericope may be silent discussion cards (Mark 1:1–13 opens on one) and narration may start by
  // itself and end fast. So: if nothing has started within a few seconds, tap the primary, up to four cards in.
  for(let card=0;card<4&&!await playing();card++){
   await page.waitForTimeout(5000);
   if(!await playing())await primary.click();
  }
  await expect.poll(playing,{timeout:45000,message:`${id}: the first narrated card must play`}).toBe(true);
  const notices=await page.locator('.scene-notice').allTextContents();
  expect(notices.join(' '),`${id}: no preparation failure`).not.toMatch(FAIL);
  expect(failures,`${id}: no failing preparation responses`).toEqual([]);
  page.off('response',onResponse);
 }
});
test('a pericope that offers no recording says so and never shows a preparation failure',async({page})=>{
 test.skip(process.env.FIA_EVERY_PERICOPE!=='1','runs from playwright.preview.config.js against a deployed origin');
 const id='eng.MRK-1-21-28';
 const status=await openPack(page,id);
 expect(status).toMatch(/recordings unavailable/);
 const primary=page.locator('nav[aria-label="Session controls"] .guide-primary');
 await expect(primary).not.toHaveAttribute('aria-busy','true',{timeout:30000});
 await primary.click();
 await page.waitForTimeout(2000);
 expect((await page.locator('.scene-notice').allTextContents()).join(' ')).not.toMatch(FAIL);
});
