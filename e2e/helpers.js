import {expect} from '@playwright/test';
export async function openPassage(page){await page.goto('/');await expect(page.locator('.reading')).toBeVisible();}
export async function journey(page){
 await openPassage(page);const before=await page.locator('.reading').textContent();
 await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.locator('.reading')).not.toHaveText(before);
 const next=await page.locator('.reading').textContent();await page.reload();await expect(page.locator('.reading')).toHaveText(next);
 await page.getByRole('button',{name:'Play',exact:true}).click();await expect(page.locator('.notice')).toContainText(/unavailable|pending/i);await expect(page.getByRole('button',{name:'Pause',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Open library and settings'}).click();await expect(page.getByRole('dialog')).toContainText('downloads are unavailable');
 await page.getByRole('button',{name:'Español · Unavailable'}).click();await expect(page.getByRole('dialog')).toContainText('English remains active');
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Close library and settings'}).click();await page.reload();await expect(page.locator('.reading')).toHaveText(next);
 await page.getByRole('button',{name:'Open library and settings'}).click();await expect(page.getByRole('checkbox')).toBeChecked();await page.getByRole('button',{name:'Close library and settings'}).click();
 await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.locator('.reading')).toHaveText(before);
}
