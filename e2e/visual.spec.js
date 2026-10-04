import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {openPassage} from './helpers.js';
for(const width of [390,1280])test(`exact checkout design evidence ${width}`,async({page,request},info)=>{
 await page.setViewportSize({width,height:width===390?844:800});
 const stamp=await (await request.get('/version.json')).json();
 mkdirSync(info.outputDir,{recursive:true});writeFileSync(info.outputPath('evidence.json'),JSON.stringify({testedCheckout:process.env.GITHUB_SHA || stamp.commit,build:stamp,viewport:{width,height:width===390?844:800}},null,2));
 await openPassage(page);await expect(page.locator('body')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:info.outputPath('passage.png'),fullPage:true});
 await page.getByRole('button',{name:'Open library and settings'}).click();await page.screenshot({path:info.outputPath('settings.png'),fullPage:true});
 await page.goto('/build-status');await expect(page.locator('#version')).toContainText(stamp.commit);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:info.outputPath('build-status.png'),fullPage:true});
});
