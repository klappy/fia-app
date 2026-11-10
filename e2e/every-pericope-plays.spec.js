import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
// Captain rule (2026-11-05, iPhone Safari on the #324 preview): every pericope the app offers must play. The
// Passages sheet states each pericope's recording status. This opens every pericope the served delivery index
// publishes a recording for and requires real native playback of its first narrated card with no preparation
// failure. A pericope whose card says "Guide recordings unavailable" must keep the text path working with no
// failure notice. Runs from playwright.preview.config.js against a deployed origin (BASE_URL).
const registry=JSON.parse(readFileSync(new URL('../apps/web/public/content/registry.json',import.meta.url),'utf8'));
const titles=Object.fromEntries(registry.packs.map(p=>[p.id,p.title]));
const FAIL=/could not be checked|temporarily unavailable|not supported|belongs to another|invalid|untrusted/i;
const onlyPreview=()=>test.skip(process.env.FIA_EVERY_PERICOPE!=='1','runs from playwright.preview.config.js against a deployed origin');
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
const primaryOf=page=>page.locator('nav[aria-label="Session controls"] .guide-primary');
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{window.__fiaStarted=0;const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){this.addEventListener('playing',()=>{window.__fiaStarted++;},{once:true});return play.apply(this,arguments);};});
});
test('every pericope with a recording prepared on tap plays its first card',async({page,request})=>{
 onlyPreview();test.setTimeout(240000);
 const index=await (await request.get('/content/delivery/index.json')).json();
 const ids=index.packs.map(p=>p.packId);expect(ids.length).toBeGreaterThan(0);
 const checked=[];
 for(const id of ids){
  const failures=[];const onResponse=r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/v1/prep')&&r.status()>=400&&![404,422].includes(r.status()))failures.push(`${r.status()} ${path}`);};
  page.on('response',onResponse);
  const status=await openPack(page,id);
  expect(status,`${id} is offered with a recording`).not.toMatch(/recordings unavailable/);
  // "Guide recordings available" pericopes (Mark 1:1–13) play from their saved download and are covered by
  // full-journey.spec.js and the live-listening journey; this spec owns the prepare-on-tap path that failed on iPhone.
  if(!/on request/.test(status)){page.off('response',onResponse);continue;}
  const primary=primaryOf(page);
  await expect(primary).not.toHaveAttribute('aria-busy','true',{timeout:30000});
  await primary.click();
  await expect.poll(()=>page.evaluate(()=>window.__fiaStarted>0),{timeout:45000,message:`${id}: the first card must play`}).toBe(true);
  expect((await page.locator('.scene-notice').allTextContents()).join(' '),`${id}: no preparation failure`).not.toMatch(FAIL);
  expect(failures,`${id}: no failing preparation responses`).toEqual([]);
  checked.push(id);page.off('response',onResponse);
 }
 expect(checked,'at least Mark 1:14–20 is prepared on tap').toContain('eng.MRK-1-14-20');
});
test('a pericope that offers no recording says so and never shows a preparation failure',async({page})=>{
 onlyPreview();
 const status=await openPack(page,'eng.MRK-1-21-28');
 expect(status).toMatch(/recordings unavailable/);
 const primary=primaryOf(page);
 await expect(primary).not.toHaveAttribute('aria-busy','true',{timeout:30000});
 await primary.click();
 await page.waitForTimeout(2000);
 expect((await page.locator('.scene-notice').allTextContents()).join(' ')).not.toMatch(FAIL);
});
