import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {activities} from '../apps/web/src/lib/content.js';
import {seedPassage,saved,downloadSelected} from './helpers.js';
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
test('explicit Play uses cached verified recording while automatic narration stays off',async({page,context})=>{
 await page.addInitScript(()=>{const NativeAudio=window.Audio;window.__verifiedPlayers=[];window.Audio=class extends NativeAudio{constructor(...args){super(...args);window.__verifiedPlayers.push(this);}};});
 test.setTimeout(120000);await seedPassage(page,'S01-U002');await downloadSelected(page,'audio');const index=(await saved(page)).index;
 const media=[];context.on('request',r=>{if((new URL(r.url()).origin==='https://transcode.klappy.dev'||/\.(mp3|m4a|wav|ogg|mp4|webm|jpe?g|png|webp)(?:$|\?)/.test(r.url()))&&!r.url().includes('/assets/fia-'))media.push(r.url());});
 await context.setOffline(true);await page.getByRole('button',{name:'Play',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__verifiedPlayers.at(-1)?.currentTime||0)).toBeGreaterThan(.1);
 const first=await page.evaluate(()=>window.__verifiedPlayers.at(-1).currentTime);await expect.poll(()=>page.evaluate(()=>window.__verifiedPlayers.at(-1).currentTime)).toBeGreaterThan(first);
 const expected=JSON.parse(readFileSync('dist/offline/eng.MRK-1-1-13.json')).files.find(f=>f.path==='/audio/source/S01-U002.mp3');
 const actual=await page.evaluate(async()=>{const src=window.__verifiedPlayers.at(-1).src;if(!src.startsWith('blob:'))throw Error('Expected verified playback blob');const b=await(await fetch(src)).arrayBuffer();return {bytes:b.byteLength,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('')};});
 expect(actual).toEqual({bytes:expected.bytes,sha256:expected.sha256});expect(activities[(await saved(page)).index].id).toBe('S01-U002');expect(media).toEqual([]);
 await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Pause',exact:true}).click();await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();expect((await saved(page)).index).toBe(index);
});
test('explicit all-resource download verifies real bytes, survives offline reload, and removes without losing progress',async({page,context})=>{
 test.setTimeout(120000);await seedPassage(page,'S02-U005');const index=(await saved(page)).index;
 const downloads=async()=>{await page.getByRole('button',{name:'More options'}).click();await page.getByRole('button',{name:'Downloads',exact:true}).click();await expect(page.getByRole('group',{name:'Include in download'})).toBeVisible();};
 await downloads();await page.getByRole('radio',{name:/^Text and all available resources/}).check();await page.getByRole('button',{name:'Download selection',exact:true}).click();
 await expect(page.getByText('The download is verified. Reload to use the saved version. Your place is kept.')).toBeVisible({timeout:90000});
 await page.getByRole('button',{name:'Reload saved version'}).click();await expect(page.getByRole('navigation',{name:'Session controls'})).toBeVisible();
 await context.setOffline(true);await page.reload();await expect(page.getByRole('navigation',{name:'Session controls'})).toBeVisible();expect((await saved(page)).index).toBe(index);
 await expect.poll(()=>page.locator('.visual-viewport img').first().evaluate(img=>img.complete&&img.naturalWidth>0)).toBeTruthy();
 await context.setOffline(false);await downloads();await page.getByRole('button',{name:'Remove from device',exact:true}).click();await page.getByRole('button',{name:'Remove download',exact:true}).click();await expect(page.getByText('Not saved for offline use',{exact:true})).toBeVisible();expect((await saved(page)).index).toBe(index);
});

test('text-only download and restore issue no resource media requests',async({page,context})=>{
 test.setTimeout(120000);const media=[];page.on('request',r=>{if((new URL(r.url()).origin==='https://transcode.klappy.dev'||/\.(mp3|m4a|wav|ogg|mp4|webm|jpe?g|png|webp)(?:$|\?)/.test(r.url()))&&!r.url().includes('/assets/fia-'))media.push(r.url());});
 await seedPassage(page,'S02-U005');await downloadSelected(page,'core');expect(media).toEqual([]);await context.setOffline(true);await page.reload();await expect(page.getByRole('navigation',{name:'Session controls'})).toBeVisible();expect(media).toEqual([]);await expect(page.getByRole('button',{name:'View image',exact:true})).toBeVisible();
});
