import {test,expect} from '@playwright/test';
import {journey} from './helpers.js';
test('public build identity, resources, real journey and truthful unavailable states',async({page,request})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 const r=await request.get('/version.json');expect(r.ok()).toBeTruthy();const stamp=await r.json();expect(stamp.version).toBe('3.0.0-alpha.1');expect(stamp.commit).toMatch(/^[a-f0-9]{40}$/);if(process.env.EXPECT_COMMIT)expect(stamp.commit).toBe(process.env.EXPECT_COMMIT);
 if(process.env.BASE_URL)expect(r.headers()['cache-control']).toContain('no-store');
 expect((await request.get('/content/bundle.json')).ok()).toBeTruthy();await journey(page);
 await page.goto('/build-status');await expect(page.getByRole('heading',{name:'FIA build status',exact:true})).toBeVisible();await expect(page.locator('#version')).toContainText(stamp.commit);expect(errors).toEqual([]);
});
