import {test,expect} from '@playwright/test';
// QA-only, opt-in (the packaged Worker preview with the U008 source policy; CI never runs it): the normal UI journey that failed at
// 00bd9a6. Open Mark 1:14–20, render the real a1400 photo and c4 map, then More options → Downloads must offer the published
// originals, and Save must bind exactly the publication generation the page displays (OFFLINE exact selection).
// A local Chromium build other than Playwright's own may be named with FIA_E2E_CHROMIUM.
test.use({launchOptions:process.env.FIA_E2E_CHROMIUM?{executablePath:process.env.FIA_E2E_CHROMIUM}:{}});
test('U008: Downloads offers the published originals, and Save binds the displayed generation',async({page,context})=>{
 test.skip(process.env.FIA_WORKER_PREVIEW!=='1'||process.env.FIA_PREVIEW_SOURCE_POLICY!=='u008-first-proof','QA-only real-source preview');
 test.setTimeout(600000);
 // The generation the page displays: the one the last visual demand's ready answer carried.
 let displayed=null;
 page.on('response',async r=>{if(new URL(r.url()).pathname!=='/v1/presentation-preparations'||r.request().method()!=='POST')return;try{const j=await r.json();if(j.status==='ready'&&j.record?.execution?.visualResources)displayed=j.record.execution.publication?.generation??displayed;}catch{}});
 await page.goto('/');await expect(page.getByRole('navigation',{name:'Session controls'})).toBeVisible();
 await page.waitForFunction(()=>!!navigator.serviceWorker?.controller,null,{timeout:30000});
 await page.getByRole('button',{name:'Session progress: open section overview'}).click();await page.getByRole('button',{name:/^Passages/}).click();
 const card=page.getByRole('dialog').locator('article.pack-card').filter({has:page.getByRole('heading',{name:'Mark 1:14–20',exact:true})});
 await card.getByRole('button',{name:/Open passage|Resume passage/}).click();await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:120000});
 const shown=alt=>page.locator('.visual-viewport img').evaluateAll((els,a)=>els.some(e=>e.alt===a&&e.complete&&e.naturalWidth>0),alt);
 let photo=false,map=false;
 for(let i=0;i<40&&!map;i++){
  for(let w=0;w<20&&!photo;w++){photo=await shown('Sea of Galilee');if(!photo)await page.waitForTimeout(250);}
  if(photo)for(let w=0;w<60&&!map;w++){map=await shown('Galilee Area with Caesarea Philippi and Capernaum');if(!map)await page.waitForTimeout(500);}
  if(!map)await page.getByRole('button',{name:'Skip to next activity'}).click();
 }
 expect(photo&&map,'the real photo and map render').toBe(true);expect(displayed).toMatch(/^[a-f0-9]{64}$/);
 await page.getByRole('button',{name:'More options'}).click();await page.getByRole('button',{name:'Downloads',exact:true}).click();
 const group=page.getByRole('group',{name:'Include in download'});await expect(group).toBeVisible({timeout:60000});
 const all=page.getByRole('radio',{name:/^Text and all available resources/});await expect(all).toBeVisible({timeout:30000});await expect(all).toBeEnabled();
 await all.check();
 // Bounded readiness: the published originals are saved as served, so the Save is ready with no image size to choose.
 const save=page.getByRole('button',{name:'Download selection',exact:true});await expect(save,'Save is ready for "all"').toBeEnabled({timeout:30000});
 await save.click();
 await expect(page.getByText('The download is verified. Reload to use the saved version. Your place is kept.')).toBeVisible({timeout:180000});
 // The saved snapshot is exactly the displayed generation.
 const sw=context.serviceWorkers()[0];expect(sw).toBeTruthy();
 const saved=await sw.evaluate(async()=>{const a=await read(packKey('eng.MRK-1-14-20','active'));return {generation:a?.serverSnapshot?.record?.execution?.publication?.generation??null,images:(a?.files||[]).filter(f=>f.group==='image').map(f=>f.path)};});
 expect(saved.generation).toBe(displayed);expect(saved.images.length).toBe(2);
 // QA at c0a837f: about 6 s after Save the Saved state was retired by an ambiguous revision-only read. A normal refreshed
 // status at least 15 s after Save (no network cut) still reports Saved, with the Saved copy rechecked by its own generation.
 await page.waitForTimeout(15000);
 const later=await sw.evaluate(async()=>{const s=await status('eng.MRK-1-14-20');return {saved:s.saved,authority:s.savedAuthority?.state??null,invalid:!!s.active?.serverSnapshot?.invalid};});
 expect(later,'still Saved 15 s after Save').toEqual({saved:true,authority:'verified',invalid:false});
});
