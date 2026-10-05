import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const helper=(await readFile(new URL('../apps/web/src/lib/video-presentation.js',import.meta.url),'utf8')).replace('export function createVideoPresentation','function createVideoPresentation')+'\nwindow.createVideoPresentation=createVideoPresentation;';
test('actual standard fullscreen releases the retained DOM owner before transition',async({page})=>{
 await page.setContent('<button id="enter">Enter</button><button id="next">Next</button><video style="width:240px;height:160px" playsinline preload="none"></video>');
 await page.addScriptTag({content:helper});
 await page.evaluate(()=>{const v=document.querySelector('video');window.events=[];window.owner=createVideoPresentation({quiesce:()=>events.push('quiesce')});owner.register(v,'fixture:one');document.addEventListener('fullscreenchange',()=>events.push(document.fullscreenElement?'entered':'exited'));document.querySelector('#enter').onclick=()=>v.requestFullscreen();document.querySelector('#next').onclick=()=>{window.before=v.isConnected;owner.defer(()=>{events.push('transition');window.exitedBeforeTransition=document.fullscreenElement!==v;v.remove();});};});
 await page.locator('#enter').click();await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.tagName)).toBe('VIDEO');
 // Native fullscreen hides outside controls; invoke the same already-bound
 // navigation handler in this isolated fixture, not an app/user-input proof.
 await page.evaluate(()=>document.querySelector('#next').click());
 await expect.poll(()=>page.evaluate(()=>window.events.includes('transition'))).toBe(true);
 expect(await page.evaluate(()=>window.before&&window.exitedBeforeTransition)).toBe(true);
 expect(await page.locator('video').count()).toBe(0);
});
test('inline DOM remains interactive and simulated native timeout never removes it',async({page})=>{
 await page.setContent('<button id="action">Action</button><video playsinline preload="none"></video>');await page.addScriptTag({content:helper});
 await page.evaluate(()=>{const v=document.querySelector('video');window.calls=0;window.notices=[];window.owner=createVideoPresentation({delay:20,notice:t=>notices.push(t)});owner.register(v,'fixture:two');document.querySelector('#action').onclick=()=>calls++;Object.defineProperty(v,'webkitDisplayingFullscreen',{value:true,writable:true});v.dispatchEvent(new Event('webkitbeginfullscreen'));owner.defer(()=>v.remove());});
 await expect.poll(()=>page.evaluate(()=>window.notices.length)).toBeGreaterThan(0);await page.locator('#action').click();
 expect(await page.evaluate(()=>window.calls)).toBe(1);expect(await page.locator('video').count()).toBe(1);await page.evaluate(()=>owner.dispose());
});
