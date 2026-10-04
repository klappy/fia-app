import {test,expect} from '@playwright/test';
import {journey} from './helpers.js';
import {isNavigationBeaconCancellation} from './request-failure.js';
test('public build identity, resources, real journey and truthful unavailable states',async({page,request,baseURL},testInfo)=>{
 const errors=[],navigationCancellations=[];let navigating=false;
 page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())navigating=true;});page.on('load',()=>navigating=false);
 page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>{const failure={url:r.url(),method:r.method(),errorText:r.failure()?.errorText,expectedOrigin:baseURL,navigating};if(isNavigationBeaconCancellation(failure))navigationCancellations.push(failure);else errors.push(`Failed ${r.url()}: ${failure.errorText}`);});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 const r=await request.get('/version.json');expect(r.ok()).toBeTruthy();const stamp=await r.json();expect(stamp.version).toBe('3.0.0-alpha.1');expect(stamp.commit).toMatch(/^[a-f0-9]{40}$/);if(process.env.EXPECT_COMMIT)expect(stamp.commit).toBe(process.env.EXPECT_COMMIT);
 if(process.env.BASE_URL)expect(r.headers()['cache-control']).toContain('no-store');
 expect((await request.get('/offline-manifest.json')).ok()).toBeTruthy();await journey(page);
 await page.goto('/build-status');await expect(page.getByRole('heading',{name:'FIA build status',exact:true})).toBeVisible();await expect(page.locator('#version')).toContainText(stamp.commit);await testInfo.attach('platform-navigation-cancellations',{body:JSON.stringify(navigationCancellations,null,2),contentType:'application/json'});expect(errors).toEqual([]);
});
