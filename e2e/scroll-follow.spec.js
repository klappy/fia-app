import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
// J4 (scripted journeys): reading follows the clip being spoken. Untimed text uses the
// clip's own clock, not the shared recording it is cut from; word-timed Scripture holds
// the last spoken line through gaps. Source recordings only; no preparation is requested.
const registry=JSON.parse(readFileSync('apps/web/public/content/registry.json','utf8'));
const index=JSON.parse(readFileSync('dist/content/delivery/index.json','utf8'));
const record=index.packs.find(p=>p.packId==='eng.MRK-1-1-13');
const bytes=readFileSync('dist'+record.delivery.url);
if(bytes.length!==record.delivery.bytes||createHash('sha256').update(bytes).digest('hex')!==record.delivery.sha256)throw Error('Unverified delivery sidecar');
const entries=JSON.parse(bytes).entries;
const clip=path=>{const range=entries.find(e=>e.path===path)?.playbackRange;if(!range)throw Error('Missing clip range '+path);return range;};
const screens=[
 {id:'S02-U010',label:'Setting the Stage, 13: Mark tells us',audio:'/audio/source/S02-U010.mp3',timing:'untimed'},
 {id:'S02-U013',label:'Setting the Stage, 15: The Holy Spirit',audio:'/audio/source/S02-U013.mp3',timing:'untimed'},
 {id:'BSB',label:'Hear and Heart, 3: Berean Standard Bible',audio:'/audio/source/scripture-BereanStandardBible.mp3',timing:'word-aligned'},
];
async function trace(page){
 await page.addInitScript(()=>{
  const players=[],Native=window.Audio;
  window.Audio=class extends Native{constructor(...args){super(...args);players.push(this);this.addEventListener('playing',()=>{const t=window.__trace;if(t&&t.playing===null)t.playing=performance.now();});}};
  window.__startTrace=()=>{
   const t=window.__trace={rows:[],playing:null};
   const tick=now=>{
    const view=document.querySelector('main .scripture-scroll'),audio=players.find(p=>!p.paused);
    t.rows.push({t:now,top:view?view.scrollTop:null,max:view?view.scrollHeight-view.clientHeight:null,time:audio?audio.currentTime:null,verse:!!view?.querySelector('.reading-verses > p[aria-current="true"]')});
    if(t.playing===null||now-t.playing<10500)requestAnimationFrame(tick);
   };
   requestAnimationFrame(tick);
  };
 });
}
async function openScreen(page,label){
 await page.getByRole('button',{name:'Session progress: open section overview'}).click();
 const item=page.locator(`.progress-map-item[aria-label^="${label}"]`).first();await item.scrollIntoViewIfNeeded();await item.click();
}
for(const screen of screens)test(`J4 ${screen.id} (${screen.timing}): reading starts in view and follows the clip`,async({page})=>{
 test.setTimeout(90000);
 await trace(page);await page.goto('/');await expect(page.getByRole('navigation',{name:'Session controls'})).toBeVisible();
 await openScreen(page,screen.label);await follows(page,screen.id,clip(screen.audio),'Begin');
});

// The passage-only row (RECIPE R2 B2; SCRIPTED-JOURNEYS J4): a registry-derived Scripture screen whose
// recording the server binds as an excerpt, Mark 1:14–20 BSB while it is served. It plays from a blob:
// URL (GAP-R2: the text never moved on DEV e78c1f7). The served mode is read from the target's own
// answers; a target that serves no recording for the screen records `not-served: <environment>`.
const passageOnly=registry.packs.find(p=>p.id==='eng.MRK-1-14-20');
async function servedExcerpt(request,packId,assetId){
 const pack=await request.get(`/v1/packs/${packId}`);if(!pack.ok())return {served:false,evidence:`GET /v1/packs/${packId} ${pack.status()}`};
 const record=await pack.json(),presentation=await (await request.get(`/v1/artifacts/${record.artifact.sha256}`)).json();
 const activity=presentation.activities.find(a=>a.kind==='scripture'&&a.execution?.focalAssetId===assetId),narration=activity?.execution?.narration;
 if(narration?.action!=='play-bound-audio')return {served:false,evidence:`${packId}@${record.revision} ${activity?.id||'no scripture screen'}: ${narration?`${narration.action} ${narration.reason||''}`.trim():'not executable'}`};
 const descriptor=record.execution.artifacts.find(a=>a.id===narration.artifact.id),bound=await (await request.get(`/v1/artifacts/${descriptor.sha256}`)).json();
 // Each server screen is its own progress item: "<section>, <n>: <prompt>".
 const section=presentation.sections.find(s=>s.id===activity.sectionId),position=presentation.activities.filter(a=>a.sectionId===activity.sectionId).findIndex(a=>a.id===activity.id);
 return {served:true,activity,range:bound.playbackRange,label:`${section.title}, ${position+1}: ${activity.prompt||activity.title}`};
}
test(`J4 ${passageOnly.id} ${passageOnly.defaultScriptureId} (passage-only, untimed): a served excerpt playing from a blob URL starts in view and follows the clip`,async({page})=>{
 test.setTimeout(120000);
 await trace(page);await page.goto('/');await expect(page.getByRole('navigation',{name:'Session controls'})).toBeVisible();
 // Opened from Passages, as a person does: the server answers an explicit open with its prepared presentation.
 await page.getByRole('button',{name:'More options'}).click();await page.getByRole('button',{name:'Passages',exact:true}).click();
 const card=page.getByRole('dialog').locator('article.pack-card').filter({has:page.getByRole('heading',{name:passageOnly.title,exact:true})});
 await card.getByRole('button',{name:/Open passage|Resume passage/}).click();
 const opened=await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:30000}).then(()=>true,()=>false);
 const environment=process.env.BASE_URL||(process.env.FIA_WORKER_PREVIEW==='1'?'local Worker preview':'local static preview');
 const served=opened?await servedExcerpt(page.request,passageOnly.id,passageOnly.defaultScriptureId):{served:false,evidence:'the passage did not open'};
 if(!served.served){test.info().annotations.push({type:'J4',description:`not-served: ${environment} (${served.evidence})`});console.log(`J4 ${passageOnly.id} not-served: ${environment} (${served.evidence})`);test.skip(true,`not-served: ${environment}`);}
 await openScreen(page,served.label);await follows(page,`${passageOnly.id} ${served.activity.id}`,served.range,/^(Begin|Play)$/);
});

async function follows(page,id,range,offered){
 const length=range.endSeconds-range.startSeconds;
 const view=page.locator('main .scripture-scroll');await expect(view).toBeVisible();await page.waitForTimeout(2000);
 expect(await view.evaluate(v=>v.scrollHeight-v.clientHeight),'text overflows the reading area').toBeGreaterThan(200);
 const primary=page.getByRole('navigation',{name:'Session controls'}).locator('.guide-primary');
 await expect(primary,'the easy button offers to start this recording').toHaveAccessibleName(offered,{timeout:30000});
 await page.evaluate(()=>window.__startTrace());await primary.click();
 await expect.poll(()=>page.evaluate(()=>window.__trace.playing),{timeout:30000}).not.toBeNull();
 await expect.poll(()=>page.evaluate(()=>{const t=window.__trace;return t.rows.at(-1).t-t.playing;}),{timeout:20000}).toBeGreaterThan(10000);
 const {rows,playing}=await page.evaluate(()=>window.__trace);
 const after=rows.filter(r=>r.t>=playing&&r.top!==null&&r.t-playing<=10000);
 const at=ms=>after.find(r=>r.t-playing>=ms);
 const first=after[0];expect(first.time,'the clip, not the file start, is playing').toBeGreaterThanOrEqual(range.startSeconds-.25);
 const startJump=Math.max(...after.filter(r=>r.t-playing<=500).map(r=>Math.abs(r.top-first.top)));
 let window250=0,back=0,peak=-Infinity,reversals=0,dir=0,run=0,verseGap=0,gapFrom=null,marked=false;
 for(let i=0;i<after.length;i++){
  for(let j=i+1;j<after.length&&after[j].t-after[i].t<=250;j++)window250=Math.max(window250,Math.abs(after[j].top-after[i].top));
  peak=Math.max(peak,after[i].top);back=Math.max(back,peak-after[i].top);
  if(i){const d=after[i].top-after[i-1].top,s=Math.sign(d);if(s&&s===dir)run+=Math.abs(d);else if(s){if(dir&&run>=2)reversals++;dir=s;run=Math.abs(d);}}
  if(after[i].verse){marked=true;gapFrom=null;}else if(marked){gapFrom??=after[i].t;verseGap=Math.max(verseGap,after[i].t-gapFrom);}
 }
 const drift=[3000,6000,9000].map(ms=>{const r=at(ms);return Math.abs(r.top/r.max-(r.time-range.startSeconds)/length);});
 const facts={startJump:+startJump.toFixed(1),window250:+window250.toFixed(1),drift:drift.map(d=>+d.toFixed(3)),back:+back.toFixed(1),max:first.max,reversals,verseGapMs:Math.round(verseGap)};
 // Machine facts for the receipt; reversals and the verse-marker gap are advisory in J4.
 test.info().annotations.push({type:'J4',description:JSON.stringify(facts)});console.log(`J4 ${id} ${JSON.stringify(facts)}`);
 expect(startJump,`first 500 ms after playing ${JSON.stringify(facts)}`).toBeLessThanOrEqual(40);
 expect(window250,`any 250 ms window ${JSON.stringify(facts)}`).toBeLessThanOrEqual(80);
 for(const d of drift)expect(d,`scroll fraction vs clip progress ${JSON.stringify(facts)}`).toBeLessThanOrEqual(.15);
 expect(back,`back-scroll ${JSON.stringify(facts)}`).toBeLessThanOrEqual(16);
}
