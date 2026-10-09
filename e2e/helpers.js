import {expect} from '@playwright/test';
import {createSession} from '../apps/web/src/lib/engine.js';
import {activities} from '../apps/web/src/lib/content.js';
export async function openPassage(page){await page.goto('/');await expect(page.getByRole('navigation',{name:'Session controls'})).toBeVisible();}
export async function seedPassage(page,id='S01-U001',preferences={}){const session=createSession(activities);session.index=activities.findIndex(a=>a.id===id);session.preferences={...session.preferences,readScripture:false,...preferences};await page.addInitScript(value=>{if(!localStorage.getItem('fia-v3-session@2'))localStorage.setItem('fia-v3-session@2',JSON.stringify(value));},{session,muted:true});await openPassage(page);}
export const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('fia-v3-session@2')).session);
export async function journey(page){
 await seedPassage(page);const initial=(await saved(page)).index;
 await page.getByRole('button',{name:'Continue',exact:true}).click();await expect.poll(async()=>(await saved(page)).index).toBeGreaterThan(initial);
 const next=(await saved(page)).index;await page.reload();expect((await saved(page)).index).toBe(next);
 await page.getByRole('button',{name:'Session progress: open section overview'}).click();await page.getByRole('button',{name:/^Language/}).click();await page.getByRole('button',{name:/Español/}).click();await expect(page.getByRole('dialog')).toContainText('68 passages with text available');await page.getByRole('button',{name:'Close',exact:true}).first().click();expect((await saved(page)).index).toBe(next);
 await page.getByRole('button',{name:'More options'}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Listening');await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'More options'}).click();await page.getByRole('button',{name:'Downloads',exact:true}).click();await expect(page.getByRole('group',{name:'Include in download'})).toBeVisible();await page.getByRole('button',{name:'Close',exact:true}).click();
}

export async function downloadSelected(page,selection='core'){
 await page.getByRole('button',{name:'More options'}).click();await page.getByRole('button',{name:'Downloads',exact:true}).click();await expect(page.getByRole('group',{name:'Include in download'})).toBeVisible();
 await page.getByRole('radio',{name:selection==='core'?/^Text only/:selection==='audio'?/^Text and audio/:/^Text and all available resources/}).check();await page.getByRole('button',{name:'Download selection',exact:true}).click();
 await expect(page.getByText('The download is verified. Reload to use the saved version. Your place is kept.')).toBeVisible({timeout:90000});await page.getByRole('button',{name:'Close',exact:true}).click();
}
