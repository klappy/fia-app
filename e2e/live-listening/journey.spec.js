import {test,expect} from '@playwright/test';
const packId='eng.MRK-1-14-20';
const first='In this step, hear Mark 1:14–20 and put it in your hearts.';
const progress=page=>page.evaluate(id=>JSON.parse(localStorage.getItem(`fia-v3-progress@1:${id}`)||'null'),packId);
const controls=page=>page.getByRole('navigation',{name:'Session controls'});
async function menu(page,name){await page.getByRole('button',{name:'More options',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();}
async function setting(page,name,value){await menu(page,'Settings');await page.getByRole('checkbox',{name:new RegExp(name)}).setChecked(value);await page.getByRole('button',{name:'Close',exact:true}).click();}
async function audioSnapshot(page){return page.evaluate(()=>window.__fiaNativeAudio.map(a=>({src:a.currentSrc,time:a.currentTime,paused:a.paused,readyState:a.readyState})));}
async function playing(page){await expect.poll(async()=>{const a=await audioSnapshot(page);return a.some(x=>!x.paused&&x.readyState>=2);},{timeout:45000,message:'Listening outcome requires actual native playback; unavailable is a failure'}).toBe(true);const before=await audioSnapshot(page);await expect.poll(async()=>{const after=await audioSnapshot(page);return after.some((a,i)=>!a.paused&&a.src===before[i]?.src&&a.time-before[i].time>=0.25);},{timeout:10000}).toBe(true);return {before,after:await audioSnapshot(page)};}
async function silent(page){const before=await audioSnapshot(page);await page.waitForTimeout(1500);const after=await audioSnapshot(page);expect(after.every(a=>a.paused)).toBe(true);expect(after.every((a,i)=>!before[i]||a.time-before[i].time<0.1)).toBe(true);return {before,after};}
async function onePause(page){const pause=controls(page).getByRole('button',{name:'Pause',exact:true});await expect(pause).toHaveCount(1);await expect(pause.locator('svg.lucide-pause')).toHaveCount(1);await pause.click();await silent(page);return true;}
async function next(page){const before=await progress(page);await controls(page).getByRole('button',{name:'Skip to next activity',exact:true}).click();await expect.poll(async()=>(await progress(page))?.session.index).toBe(before.session.index+1);}
let evidence;
test.beforeEach(async({page,request})=>{
 evidence={schemaVersion:1,environment:process.env.FIA_ENVIRONMENT,origin:process.env.BASE_URL,expectedCommit:process.env.EXPECT_COMMIT,packId,observations:[],nativePlayback:[],claims:{}};
 // Observe real detached native Audio instances. No methods, clocks, events or network responses are mocked.
 await page.addInitScript(()=>{window.__fiaNativeAudio=[];window.Audio=new Proxy(window.Audio,{construct(target,args){const audio=Reflect.construct(target,args);window.__fiaNativeAudio.push(audio);return audio;}});});
 page.on('pageerror',error=>evidence.observations.push({kind:'pageerror',message:error.message}));
 const response=await request.get('/version.json',{headers:{'cache-control':'no-cache'}});expect(response.ok()).toBe(true);evidence.networkVersion=await response.json();expect(evidence.networkVersion.commit).toBe(process.env.EXPECT_COMMIT);
 await page.goto('/');evidence.loadedRelease=await page.locator('meta[name="fia-release"]').getAttribute('content');expect(evidence.loadedRelease).toBe(`${evidence.networkVersion.version}+${process.env.EXPECT_COMMIT.slice(0,7)}`);
 await menu(page,'Passages');const card=page.locator('article.pack-card').filter({has:page.getByRole('heading',{name:'Mark 1:14–20',exact:true})});await card.getByRole('button',{name:'Open passage',exact:true}).click();await expect(page.locator('.reading-verses')).toContainText(first);evidence.claims.firstUnitVisible=true;
});
test.afterEach(async({page},info)=>{evidence.outcome=info.status;evidence.observations.push({kind:'visible-controls',labels:await controls(page).getByRole('button').evaluateAll(nodes=>nodes.map(n=>({label:n.getAttribute('aria-label'),disabled:n.disabled}))).catch(()=>[])});evidence.observations.push({kind:'visible-notices',text:await page.getByRole('status').allTextContents().catch(()=>[])});evidence.lastProgress=await progress(page).catch(()=>null);evidence.nativeFinal=await audioSnapshot(page).catch(()=>[]);await info.attach('live-listening-evidence',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});});
test('P2 automatic Begin and Next preserve first unit and advance native audio',async({page})=>{
 await setting(page,'Automatic guide narration',true);await expect(controls(page).locator('.guide-primary')).toHaveAttribute('aria-label',/^(Begin|Play|Resume)$/);await expect(controls(page).locator('.guide-primary svg.lucide-play')).toHaveCount(1);await controls(page).locator('.guide-primary').click();evidence.nativePlayback.push(await playing(page));expect((await progress(page)).activityId).toBe('S01-U001');evidence.claims.firstUnitPlayed=true;await onePause(page);evidence.claims.singlePauseActs=true;
 await next(page);expect((await progress(page)).activityId).toBe('S01-U002');evidence.nativePlayback.push(await playing(page));evidence.claims.nextPlayed=true;
});
test('P2 Scripture ON must deliver actual BSB playback',async({page})=>{
 await setting(page,'Automatic guide narration',false);await setting(page,'Automatic Scripture reading',true);
 await controls(page).locator('.guide-primary').click();await controls(page).locator('.guide-primary').click();await expect(page.locator('.reading-verses')).toContainText('After the arrest of John');expect((await progress(page)).activityId).toBe('S01-U002-reading-1');evidence.nativePlayback.push(await playing(page));evidence.claims.scripturePlayed=true;
});
test('P2 pending cancellation and OFF to ON cannot resurrect playback',async({page})=>{
 await setting(page,'Automatic guide narration',true);await controls(page).locator('.guide-primary').click();await expect(controls(page).getByRole('button',{name:/Cancel loading|Cancel preparation/})).toBeVisible({timeout:15000});evidence.claims.pendingObserved=true;
 await setting(page,'Automatic guide narration',false);await silent(page);await setting(page,'Automatic guide narration',true);await silent(page);evidence.claims.noResurrection=true;
});
test('P2 manual prepare ready then explicit Play has one working Pause',async({page})=>{
 await setting(page,'Automatic guide narration',false);await controls(page).getByRole('button',{name:/^Play( original recording)?$/}).click();await expect(controls(page).getByRole('button',{name:/Cancel preparation|Cancel loading/})).toBeVisible({timeout:15000});evidence.claims.pendingObserved=true;
 await expect(controls(page).getByRole('button',{name:/^Play( original recording)?$/})).toBeVisible({timeout:60000});await silent(page);evidence.claims.readySilent=true;
 await controls(page).getByRole('button',{name:/^Play( original recording)?$/}).click();evidence.nativePlayback.push(await playing(page));await onePause(page);evidence.claims.singlePauseActs=true;evidence.claims.explicitPlay=true;
});
test('P2 settings and place persist without hidden writes or surprise sound',async({page})=>{
 await setting(page,'Automatic guide narration',false);await setting(page,'Automatic Scripture reading',false);await controls(page).locator('.guide-primary').click();const before=await progress(page);await page.reload();expect(await page.locator('meta[name="fia-release"]').getAttribute('content')).toBe(evidence.loadedRelease);await expect.poll(async()=>(await progress(page))?.activityId).toBe(before.activityId);await menu(page,'Settings');await expect(page.getByRole('checkbox',{name:/Automatic guide narration/})).not.toBeChecked();await expect(page.getByRole('checkbox',{name:/Automatic Scripture reading/})).not.toBeChecked();await page.getByRole('button',{name:'Close',exact:true}).click();await silent(page);evidence.claims.preferencesPersisted=true;evidence.claims.placePersisted=true;
});
