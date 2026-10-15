import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {seedPassage,downloadSelected} from './helpers.js';
test('packaged authority reads and explicit text Save remain read-only and recover offline',async({page,context,request})=>{
 test.skip(process.env.FIA_WORKER_PREVIEW!=='1','Opt-in actual packaged Worker preview only');
 test.setTimeout(120000);
 const mutations=[];context.on('request',r=>{if(r.method()==='POST')mutations.push(r.url());});
 const response=await request.get('/v1/packs/eng.MRK-1-1-13');expect(response.status()).toBe(200);expect(response.headers()['content-type']).toContain('application/json');const record=await response.json();expect(record.status).toBe('ready');
 const artifact=await request.get(`/v1/artifacts/${record.artifact.sha256}`);expect(artifact.status()).toBe(200);const bytes=await artifact.body();expect(bytes.length).toBe(record.artifact.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.revision);
 await seedPassage(page,'S01-U002');await downloadSelected(page,'core');expect(mutations).toEqual([]);
 await context.setOffline(true);await page.reload();await expect(page.getByRole('navigation',{name:'Session controls'})).toBeVisible();expect(mutations).toEqual([]);
});
