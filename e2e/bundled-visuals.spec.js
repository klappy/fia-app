import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createSession} from '../apps/web/src/lib/engine.js';
import {bundledVisualBindings} from '../apps/web/src/lib/bundled-visuals.js';
const registry=JSON.parse(readFileSync(new URL('../apps/web/public/content/registry.json',import.meta.url)));
if(process.env.FIA_CORPUS_CHROMIUM)test.use({launchOptions:{executablePath:process.env.FIA_CORPUS_CHROMIUM}});
for(const group of ['eng.MRK','eng.LUK','spa.MRK','spa.LUK']){
 const pin=bundledVisualBindings.find(f=>f.visualPublication.packId.startsWith(group)&&f.visualPublication.kind===(group==='eng.MRK'?'map':'image'));
 test(`real bundled visual ${group}`,async({page,request},info)=>{
  test.skip(process.env.FIA_BUNDLED_VISUAL_BROWSER!=='1','opt-in real bundled visual check');test.setTimeout(180000);
  expect(process.env.BASE_URL).toBeFalsy();expect(process.env.FIA_WORKER_PREVIEW).toBe('1');expect(pin).toBeTruthy();
  const version=await(await request.get('/version.json')).json();expect(version.commit).toBe(process.env.EXPECT_COMMIT);
  const descriptor=registry.packs.find(d=>d.id===pin.visualPublication.packId),presentation=JSON.parse(readFileSync(new URL('../apps/web/public'+descriptor.presentation.url,import.meta.url))),asset=presentation.assets[pin.visualPublication.assetId],session=createSession(presentation.activities);session.preferences.readScripture=false;
  const external=[],errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:4173'?route.continue():(external.push(route.request().url()),route.abort()));
  await page.addInitScript(({descriptor,session,activityId})=>{if(localStorage.getItem('fia-v3-selected-pack'))return;localStorage.setItem('fia-v3-selected-pack',descriptor.id);localStorage.setItem('fia-v3-library-language',descriptor.language);localStorage.setItem(`fia-v3-progress@1:${descriptor.id}`,JSON.stringify({total:1,revision:descriptor.revision,activityId,session,transitionSection:null}));localStorage.setItem('fia-v3-preferences@1',JSON.stringify({muted:true,preferences:session.preferences}));},{descriptor,session,activityId:presentation.activities[0].id});
  await page.goto('/');await expect(page.getByRole('navigation',{name:'Session controls'})).toBeVisible();const passage=descriptor.title.replace(/^MRK\b/,descriptor.language==='spa'?'Marcos':'Mark').replace(/^LUK\b/,descriptor.language==='spa'?'Lucas':'Luke');await expect(page.getByRole('button',{name:`Choose passage: ${passage}`,exact:true})).toBeVisible({timeout:20000});await expect.poll(()=>page.evaluate(()=>localStorage.getItem('fia-v3-selected-pack'))).toBe(descriptor.id);
  await page.getByRole('button',{name:'More options',exact:true}).click();await page.getByRole('button',{name:'Passage resources',exact:true}).click();const section=page.locator('.outline details').filter({has:page.locator('summary',{hasText:asset.kind==='map'?'Maps':'Images'})});await section.locator('summary').click();await section.getByRole('button',{name:asset.subtitle||asset.title,exact:false}).click();
  const image=page.locator('.visual-viewport img').first();await expect(image).toBeVisible({timeout:30000});await expect.poll(()=>image.evaluate(i=>i.complete&&i.naturalWidth>0&&i.naturalHeight>0),{timeout:30000}).toBeTruthy();
  const dimensions=await image.evaluate(i=>({width:i.naturalWidth,height:i.naturalHeight}));expect(dimensions).toEqual({width:pin.visualPublication.width,height:pin.visualPublication.height});
  const actual=await image.evaluate(async i=>{const bytes=await(await fetch(i.currentSrc)).arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');});expect(actual).toBe(pin.sha256);expect(errors).toEqual([]);expect(external).toEqual([]);
  await info.attach('real-bundled-visual',{body:JSON.stringify({commit:version.commit,packId:descriptor.id,assetId:asset.id,sha256:actual,dimensions,external,pageErrors:errors,limits:'Targeted real local bundled visual rendering; seeded selection, no audio, offline or full-corpus claim.'}),contentType:'application/json'});
 });
}
