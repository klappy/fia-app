import {test,expect} from '@playwright/test';

// Easy-button guard (cookbook RECIPE R4-R6, SCRIPTED-JOURNEYS EB and J3).
// Faces are sampled from the first paint; causes are logged beside them, so the
// assertions read machine facts instead of timers.
function easyButtonProbe(){
 const log=window.__easy={faces:[],causes:[],players:[]};
 const now=()=>performance.now();
 const primary=()=>document.querySelector('nav[aria-label="Session controls"] .guide-primary');
 const face=()=>{const b=primary();if(!b)return null;const svg=b.querySelector('.primary-disc svg');const icon=svg?[...svg.classList].find(c=>c.startsWith('lucide-')&&c!=='lucide-icon')||'svg':'';return {label:b.getAttribute('aria-label'),busy:b.getAttribute('aria-busy')==='true',disabled:b.getAttribute('aria-disabled')==='true'||b.disabled,icon};};
 let last='';
 const sample=()=>{const f=face();const key=JSON.stringify(f);if(f&&key!==last){last=key;log.faces.push({t:now(),...f});}};
 new MutationObserver(sample).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-label','aria-busy','aria-disabled','class']});
 for(const type of ['pointerdown','keydown'])window.addEventListener(type,()=>log.causes.push({t:now(),kind:'gesture'}),true);
 for(const type of ['online','offline'])window.addEventListener(type,()=>log.causes.push({t:now(),kind:'network'}));
 const NativeAudio=window.Audio;
 window.Audio=class extends NativeAudio{constructor(...args){super(...args);log.players.push(this);for(const type of ['playing','pause','ended','error'])this.addEventListener(type,()=>log.causes.push({t:now(),kind:`media:${type}`}));}};
 const nativeFetch=window.fetch;
 window.fetch=function(...args){const p=nativeFetch.apply(this,args);p.then(()=>log.causes.push({t:now(),kind:'response'}),()=>log.causes.push({t:now(),kind:'response'}));return p;};
 const port=Object.getOwnPropertyDescriptor(MessagePort.prototype,'onmessage');
 Object.defineProperty(MessagePort.prototype,'onmessage',{configurable:true,get(){return port.get.call(this);},set(fn){port.set.call(this,typeof fn==='function'?function(event){log.causes.push({t:now(),kind:'status'});return fn.call(this,event);}:fn);}});
}
const CHECKING='Checking availability';
const isChecking=f=>f.label===CHECKING&&f.busy&&!f.icon;
const faces=page=>page.evaluate(()=>window.__easy.faces);
async function settled(page,{quietMs=3000,timeout=20000}={}){
 // Wait for the first verified face, then hold still with no input.
 await expect.poll(async()=>(await faces(page)).some(f=>!isChecking(f)),{timeout}).toBe(true);
 await page.waitForTimeout(quietMs);
}
function uncaused(log,from){
 // EB: after the first verified face, every change needs a logged cause in the 1000 ms before it.
 return log.faces.slice(from).filter(change=>!log.causes.some(c=>c.t<=change.t+5&&change.t-c.t<=1000)).map(f=>`${Math.round(f.t)}ms ${f.label}`);
}
async function tapCentre(page,count,gapMs){
 const box=await page.locator('nav[aria-label="Session controls"] .guide-primary').boundingBox();
 const x=box.x+box.width/2,y=box.y+box.height/2,taps=[];
 for(let i=0;i<count;i++){if(i)await page.waitForTimeout(gapMs);taps.push(await page.evaluate(()=>performance.now()));await page.mouse.click(x,y);}
 return taps;
}

test.beforeEach(async({page})=>{await page.addInitScript(easyButtonProbe);});

test('first visit: the easy button checks quietly, then changes once to the verified action',async({page})=>{
 await page.goto('/');
 await settled(page);
 const seen=await faces(page);
 expect(seen.length,JSON.stringify(seen)).toBeGreaterThan(0);
 expect(isChecking(seen[0]),`first face ${JSON.stringify(seen[0])}`).toBe(true);
 expect(seen[0].disabled).toBe(false);
 expect(seen.map(f=>f.label),'one change after checking, then none without a cause').toEqual([CHECKING,'Begin']);
});

test('reduced motion keeps the checking disc static',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 const disc=page.locator('.guide-primary[aria-busy="true"] .primary-disc');
 await expect(disc).toBeVisible();
 const style=await disc.evaluate(el=>({name:getComputedStyle(el).animationName,opacity:getComputedStyle(el).opacity}));
 expect(style.name).toBe('none');expect(Number(style.opacity)).toBeCloseTo(.7,2);
});

test('returning visit to a passage without recordings: checking, then one honest Continue',async({page})=>{
 test.skip(process.env.FIA_WORKER_PREVIEW!=='1','Opt-in actual packaged Worker preview only');
 const posts=[];page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
 await page.addInitScript(()=>{if(!localStorage.getItem('fia-v3-selected-pack'))localStorage.setItem('fia-v3-selected-pack','eng.MRK-1-21-28');});
 await page.goto('/');
 await expect(page.getByRole('heading',{level:1})).toHaveText(/Mark 1:21.28/,{timeout:20000});
 await settled(page);
 const seen=await faces(page);
 expect(seen.map(f=>f.label),JSON.stringify(seen)).toEqual([CHECKING,'Continue']);
 expect(isChecking(seen[0])).toBe(true);
 // R6: no recording can be prepared here, so no Play is offered and nothing is requested.
 const dock=page.getByRole('navigation',{name:'Session controls'});
 await expect(dock.getByRole('button',{name:/^Play/})).toHaveCount(0);
 await expect(dock.getByRole('button',{name:'Skip to next activity'})).toBeEnabled();
 await dock.getByRole('button',{name:'Replay'}).click();await page.waitForTimeout(500);
 expect(posts.filter(url=>new URL(url).pathname.startsWith('/v1/preparations'))).toEqual([]);
});

test('J3 hammer: six taps 150 ms apart start one recording and never cancel it',async({page})=>{
 await page.goto('/');
 await settled(page,{quietMs:300});
 await expect(page.locator('nav[aria-label="Session controls"] .guide-primary')).toHaveAttribute('aria-label','Begin');
 const before=(await faces(page)).length;
 const [first]=await tapCentre(page,6,150);
 await page.waitForFunction(t=>performance.now()-t>=3000,first);
 const at3=await page.evaluate(()=>window.__easy.players.map(p=>({paused:p.paused,readyState:p.readyState,time:p.currentTime,src:!!p.src})));
 await page.waitForTimeout(400);
 const later=await page.evaluate(()=>window.__easy.players.map(p=>p.currentTime));
 const playing=at3.map((p,i)=>({...p,i})).filter(p=>!p.paused&&p.readyState>=2);
 expect(playing,JSON.stringify(at3)).toHaveLength(1);
 expect(later[playing[0].i]-playing[0].time).toBeGreaterThan(.25);
 await expect(page.getByRole('status').filter({hasText:/canceled/i})).toHaveCount(0);
 const log=await page.evaluate(()=>window.__easy);
 const start=log.faces.slice(before-1);
 // Begin -> starting -> Pause: no X, no chevron, no Resume flash, at most two changes.
 expect(start.map(f=>f.label),JSON.stringify(start)).toEqual(['Begin','Pause','Pause']);
 expect(start[1].busy&&start[1].disabled&&start[1].icon!=='lucide-pause').toBe(true);
 expect(start[2].icon).toBe('lucide-pause');
 expect(uncaused(log,before)).toEqual([]);
});

test('E4: taps while checking wait, then start the checked Begin exactly once',async({page,context})=>{
 // Holding the offline manifest keeps the check open; service-worker routing needs the Chromium flag below.
 test.skip(process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS!=='1','Needs PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 to hold the service worker check');
 let release;const held=new Promise(r=>release=r);
 await context.route('**/offline/eng.MRK-1-1-13.json',async route=>{await held;await route.continue();});
 await page.goto('/');
 await expect(page.locator('nav[aria-label="Session controls"] .guide-primary')).toHaveAttribute('aria-label',CHECKING);
 const taps=await tapCentre(page,3,150);
 const during=await faces(page);
 expect(during.map(f=>f.label),'a tap while checking changes no label').toEqual([CHECKING]);
 expect(await page.evaluate(()=>window.__easy.players.length)).toBe(0);
 release();
 await expect.poll(async()=>(await faces(page)).at(-1).icon,{timeout:15000}).toBe('lucide-pause');
 await page.waitForFunction(t=>performance.now()-t>=3000,taps[0]);
 const players=await page.evaluate(()=>window.__easy.players.map(p=>({paused:p.paused,readyState:p.readyState})));
 expect(players.filter(p=>!p.paused&&p.readyState>=2),JSON.stringify(players)).toHaveLength(1);
 const seen=await faces(page);
 // [verifying, the state the checked action leads to]: never Begin in between.
 expect(seen.map(f=>f.label),JSON.stringify(seen)).toEqual([CHECKING,'Pause','Pause']);
 await expect(page.getByRole('status').filter({hasText:/canceled/i})).toHaveCount(0);
});
