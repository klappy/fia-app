import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {pageIndices} from '../packages/views/session.js';
import {openPassage} from './helpers.js';
const bundle=JSON.parse(readFileSync(new URL('../apps/web/public/content/bundle.json',import.meta.url)));
test('every full-text page renders exact content and reaches final hold',async({page})=>{
 await openPassage(page);let index=0,pages=0;
 while(index<128){const indices=pageIndices(bundle,index);await expect(page.locator('main h1')).toHaveText(bundle.activities[index].title);
 for(const i of indices)for(const text of bundle.activities[i].text.split('\n'))await expect(page.locator('.reading')).toContainText(text);
 const action=page.getByRole('button',{name:bundle.activities[index].kind==='discussion'?'Continue discussion':'Continue',exact:true});await action.click();pages++;if(index===127)break;index=Math.max(...indices)+1;}
 expect(pages).toBe(111);await expect(page.locator('main')).toContainText('reached the end');await expect(page.locator('.transport .easy')).toBeDisabled();
});
