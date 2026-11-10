import {test,expect} from '@playwright/test';
import {iosPlayback,playbackLog} from './fixtures/ios-playback.js';
import {START_BOUND_MS} from '../apps/web/src/lib/audio.js';

// Captain on DEV (iPhone, 2026-10-07): "The spinner springs forever on each page that isn't the first."
// iOS lets a later screen start without a tap only on an element a tap already started, and a start it
// does not allow can stay pending with neither sound nor a rejection. Mark 1:1–13's first three screens
// carry recordings.
const PAUSED_AUTOMATIC='Tap Play to hear the narration. Your browser paused automatic audio.';
const MARGIN_MS=1500;
function dockProbe(){
 const log=window.__dock=[];let last='';
 const sample=()=>{
  const centre=document.querySelector('nav[aria-label="Session controls"] .guide-primary');if(!centre)return;
  const position=[...document.querySelectorAll('.sr-only')].map(n=>/^(\d+) of \d+ screens$/.exec(n.textContent.trim())).find(Boolean);
  const entry={screen:position?Number(position[1]):0,label:centre.getAttribute('aria-label'),busy:centre.getAttribute('aria-busy')==='true',notice:[...document.querySelectorAll('.scene-notice')].map(n=>n.textContent.trim()).join(' / ')};
  const key=JSON.stringify(entry);if(key!==last){last=key;log.push({t:Math.round(performance.now()),...entry});}
 };
 new MutationObserver(sample).observe(document,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','aria-busy','class']});
}
const dock=page=>page.evaluate(()=>window.__dock);
const clock=page=>page.evaluate(()=>Math.round(performance.now()));
// Spinner spans after `from` that outlast the start bound: each busy span is measured from the first clip
// handed to the player inside it (the bound starts there) to the span's end, or to `end` while it still
// spins. Loading before the handover has its own bounds.
function pastBound(log,{sources},from,end){
 const late=[];let open=null;
 const close=(until,spinning)=>{
  const handover=sources.find(s=>s.t>=open.t-50&&s.t<=until);
  if(handover&&until-handover.t>START_BOUND_MS+MARGIN_MS)late.push({screen:open.screen,label:open.label,msAfterHandover:until-handover.t,...(spinning?{stillSpinning:true}:{})});
  open=null;
 };
 for(const e of log.filter(e=>e.t>=from)){if(e.busy&&!open)open=e;else if(!e.busy&&open)close(e.t,false);}
 if(open)close(end,true);
 return late;
}
// The screen shown when each clip reached sound.
const heardOn=(log,playing)=>[...new Set(playing.map(p=>log.filter(e=>e.t<=p.t).at(-1)?.screen))];
async function begin(page){
 await page.goto('/');
 const centre=page.locator('nav[aria-label="Session controls"] .guide-primary');
 await expect(centre).toHaveAttribute('aria-label','Begin',{timeout:20000});await expect(centre).not.toHaveAttribute('aria-busy','true');
 const at=await clock(page);await centre.click();return {centre,at};
}
async function evidence(page){
 const [log,playback,now]=await Promise.all([dock(page),playbackLog(page),clock(page)]);
 test.info().annotations.push({type:'dock',description:JSON.stringify(log)},{type:'playback',description:JSON.stringify(playback)});
 return {log,playback,now};
}

test('iOS: one tap on Begin; every later screen starts on its own and the spinner never outlasts the start bound',async({page})=>{
 test.setTimeout(120000);
 // Real speed: screen 2's clip arrives after the tap's permission has lapsed, as on the captain's iPhone.
 await page.addInitScript(iosPlayback,{start:'hang'});await page.addInitScript(dockProbe);
 const {at}=await begin(page);
 try{
  // Sound on screen 3 means screens 1 and 2 played to their end and screens 2 and 3 started with no further tap.
  await expect.poll(async()=>heardOn(await dock(page),(await playbackLog(page)).playing),{timeout:75000,message:'screens 2 and 3 start on their own'}).toEqual(expect.arrayContaining([1,2,3]));
 }finally{
  const {log,playback,now}=await evidence(page);
  expect(pastBound(log,playback,at,now),`no spinner lasts past the ${START_BOUND_MS} ms start bound: ${JSON.stringify(log)}`).toEqual([]);
  expect(playback.plays.filter(p=>p.outcome!=='started'),'no start is left pending by the browser').toEqual([]);
 }
 await expect(page.locator('.scene-notice')).toHaveCount(0);
});

test('iOS: a start the browser leaves pending ends as Resume at the bound with its notice; one tap plays it and later screens start on their own',async({page})=>{
 test.setTimeout(90000);
 // The strictest iOS: no gesture is carried past its own event, and starting an element with no source unlocks nothing.
 await page.addInitScript(iosPlayback,{start:'hang',windowMs:0,primeSourceless:false,rate:16});await page.addInitScript(dockProbe);
 const {centre,at}=await begin(page);
 try{
  await expect(centre,'the starting face ends at the bound').toHaveAttribute('aria-label','Resume',{timeout:START_BOUND_MS+10000});
  await expect(centre).not.toHaveAttribute('aria-busy','true');
  await expect(page.locator('.scene-notice')).toHaveText([PAUSED_AUTOMATIC]);
 }finally{
  const {log,playback,now}=await evidence(page);
  expect(pastBound(log,playback,at,now),`the spinner ends at the ${START_BOUND_MS} ms start bound: ${JSON.stringify(log)}`).toEqual([]);
 }
 expect((await playbackLog(page)).playing,'nothing played before the tap').toEqual([]);
 const tap=await clock(page);await centre.click();
 await expect.poll(async()=>heardOn(await dock(page),(await playbackLog(page)).playing),{timeout:60000,message:'after one tap, screens 2 and 3 start on their own'}).toEqual(expect.arrayContaining([1,2,3]));
 const {log,playback,now}=await evidence(page);
 expect(pastBound(log,playback,tap,now),JSON.stringify(log)).toEqual([]);
 // One tap on Begin and one on Resume: the gate saw no other gesture, so later screens started untapped.
 expect(log.filter(e=>e.t>tap&&e.label==='Resume'),JSON.stringify(log)).toEqual([]);
});
