import {test,expect} from '@playwright/test';
import {activities} from '../apps/web/src/lib/content.js';
import {seedPassage,saved} from './helpers.js';
test('approved manual journey preserves grouped readings and explicit holds through completion',async({page})=>{
 await seedPassage(page,activities[0].id);let count=0;
 while((await saved(page)).status!=='complete'){
  const before=await page.evaluate(()=>localStorage.getItem('fia-v3-session@2'));
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('fia-v3-session@2'))).not.toBe(before);
  if(++count>activities.length+10)throw Error('Journey did not terminate');
 }
 await expect(page.getByRole('heading',{name:'Carry the story with you.'})).toBeVisible();expect(count).toBeGreaterThan(90);expect((await saved(page)).completed.length).toBe(activities.length);
});
test('explicit Play uses real recording while automatic narration stays off',async({page})=>{
 await seedPassage(page,'S01-U002');const index=(await saved(page)).index;
 const response=page.waitForResponse(r=>r.url().endsWith('/audio/source/S01-U002.mp3'));
 await page.getByRole('button',{name:'Play',exact:true}).click();expect((await response).ok()).toBeTruthy();
 await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Pause',exact:true}).click();await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();expect((await saved(page)).index).toBe(index);
});
