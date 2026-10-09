import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
// J4 (scripted journeys): reading follows the clip being spoken. Untimed text uses the
// clip's own clock, not the shared recording it is cut from; word-timed Scripture holds
// the last spoken line through gaps. The Mark 1:1–13 rows use source recordings and request
// no preparation; the served rows play what the target serves for the screen.
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
// Each frame records the reading's scroll position, the playing element's clock and the easy
// button's ring (the clip's own progress, as the person sees it). The trace runs 10.5 s, and
// on until the ring passes 55% of the clip, so a row can show the text moved (N1).
async function trace(page){
 await page.addInitScript(()=>{
  const players=[],Native=window.Audio;
  window.Audio=class extends Native{constructor(...args){super(...args);players.push(this);this.addEventListener('playing',()=>{const t=window.__trace;if(t&&t.playing===null)t.playing=performance.now();});}};
  const ring=()=>{const arc=document.querySelector('nav[aria-label="Session controls"] .guide-primary .playback-arc');if(!arc)return null;const length=parseFloat(arc.getAttribute('stroke-dasharray')),offset=parseFloat(arc.getAttribute('stroke-dashoffset'));return length>0?1-offset/length:null;};
  window.__startTrace=(cap=120000)=>{
   const t=window.__trace={rows:[],playing:null,done:false};
   const tick=now=>{
    const view=document.querySelector('main .scripture-scroll'),audio=players.find(p=>!p.paused),progress=ring();
    t.rows.push({t:now,top:view?view.scrollTop:null,max:view?view.scrollHeight-view.clientHeight:null,time:audio?audio.currentTime:null,ring:audio?progress:null,verse:!!view?.querySelector('.reading-verses > p[aria-current="true"]')});
    const since=t.playing===null?0:now-t.playing;
    if(t.playing!==null&&since>=10500&&(!audio||progress>=.55||since>=cap)){t.done=true;return;}
    requestAnimationFrame(tick);
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
 test.setTimeout(150000);
 await trace(page);await page.goto('/');await expect(page.getByRole('navigation',{name:'Session controls'})).toBeVisible();
 await openScreen(page,screen.label);await follows(page,screen.id,clip(screen.audio),'Begin');
});

// The served rows (RECIPE R2 B2; SCRIPTED-JOURNEYS J4) are opened from Passages, as a person does: the
// server answers an explicit open with its prepared presentation, and the served mode is read from the
// target's own answers. A local target that serves no recording for the screen records
// `not-served: <environment>`. A deployed target (BASE_URL) never skips a blocking check: a passage
// that does not open or a non-OK answer fails the row; only a screen served without a recording is
// recorded as not-served (N2).
const passageOnly=registry.packs.find(p=>p.id==='eng.MRK-1-14-20');
const deployed=process.env.BASE_URL;
const environment=deployed||(process.env.FIA_WORKER_PREVIEW==='1'?'local Worker preview':'local static preview');
async function openPassage(page,title){
 await page.getByRole('button',{name:'Session progress: open section overview'}).click();await page.getByRole('button',{name:/^Passages/}).click();
 const card=page.getByRole('dialog').locator('article.pack-card').filter({has:page.getByRole('heading',{name:title,exact:true})});
 await card.getByRole('button',{name:/Open passage|Resume passage/}).click();
 const opened=await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:30000}).then(()=>true,()=>false);
 if(deployed)expect(opened,`${title} opens on ${deployed}`).toBe(true);
 return opened;
}
// Server answers are read from the page, through the same origin and worker as the app's own reads.
async function servedJSON(page,path){
 const response=await page.evaluate(async path=>{const r=await fetch(path,{cache:'no-store'});return {status:r.status,ok:r.ok,json:r.ok?await r.json():null};},path);
 if(deployed)expect(response.ok,`GET ${path} on ${deployed}: ${response.status}`).toBe(true);
 return response.ok?{ok:true,json:response.json}:{ok:false,evidence:`GET ${path} ${response.status}`};
}
async function servedScreen(page,packId,find,actions){
 const pack=await servedJSON(page,`/v1/packs/${packId}`);if(!pack.ok)return {served:false,evidence:pack.evidence};
 const record=pack.json,artifact=await servedJSON(page,`/v1/artifacts/${record.artifact.sha256}`);if(!artifact.ok)return {served:false,evidence:artifact.evidence};
 const presentation=artifact.json,activity=presentation.activities.find(find),narration=activity?.execution?.narration;
 if(!actions.includes(narration?.action))return {served:false,evidence:`${packId}@${record.revision} ${activity?.id||'no such screen'}: ${narration?`${narration.action} ${narration.reason||''}`.trim():'not executable'}`};
 // Each server screen is its own progress item: "<section>, <n>: <prompt>".
 const section=presentation.sections.find(s=>s.id===activity.sectionId),position=presentation.activities.filter(a=>a.sectionId===activity.sectionId).findIndex(a=>a.id===activity.id);
 return {served:true,record,activity,narration,label:`${section.title}, ${position+1}: ${activity.prompt||activity.title}`};
}
function notServed(id,evidence){
 test.info().annotations.push({type:'J4',description:`not-served: ${environment} (${evidence})`});console.log(`J4 ${id} not-served: ${environment} (${evidence})`);
 test.skip(true,`not-served: ${environment}`);
}

// Passage-only Scripture: Mark 1:14–20 BSB while the server binds it as an excerpt. It plays from a
// blob: URL (GAP-R2: the text never moved on DEV e78c1f7).
test(`J4 ${passageOnly.id} ${passageOnly.defaultScriptureId} (passage-only, untimed): a served excerpt playing from a blob URL starts in view and follows the clip`,async({page})=>{
 test.setTimeout(150000);
 const id=`${passageOnly.id} ${passageOnly.defaultScriptureId}`;
 await trace(page);await page.goto('/');await expect(page.getByRole('navigation',{name:'Session controls'})).toBeVisible();
 if(!await openPassage(page,passageOnly.title))return notServed(id,'the passage did not open');
 const served=await servedScreen(page,passageOnly.id,a=>a.kind==='scripture'&&a.execution?.focalAssetId===passageOnly.defaultScriptureId,['play-bound-audio']);
 if(!served.served)return notServed(id,served.evidence);
 const descriptor=served.record.execution.artifacts.find(a=>a.id===served.narration.artifact.id),bound=await servedJSON(page,`/v1/artifacts/${descriptor.sha256}`);
 if(!bound.ok)return notServed(id,bound.evidence);
 await openScreen(page,served.label);await follows(page,`${passageOnly.id} ${served.activity.id}`,bound.json.playbackRange,/^(Begin|Play)$/);
});

// An admitted guide screen voiced by its served recording (S1, review of #201): Mark 1:14–20 S01-U002
// is served as prepare-original and plays from a blob: URL. Its text overflows only on a small phone at
// the Largest reading size (320×568: 524 px), so the row reads it there. The prepared recording's range is
// not visible to the page, so the clip's progress is read from the easy button's ring.
test(`J4 ${passageOnly.id} S01-U002 (admitted guide, prepared, untimed): served guide narration playing from a blob URL starts in view and follows the clip`,async({page})=>{
 test.setTimeout(180000);
 const id=`${passageOnly.id} S01-U002`;
 await page.setViewportSize({width:320,height:568});
 await trace(page);await page.goto('/');await expect(page.getByRole('navigation',{name:'Session controls'})).toBeVisible();
 if(!await openPassage(page,passageOnly.title))return notServed(id,'the passage did not open');
 const served=await servedScreen(page,passageOnly.id,a=>a.id==='S01-U002',['prepare-original','play-bound-audio']);
 if(!served.served)return notServed(id,served.evidence);
 await page.getByRole('button',{name:'More options'}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByLabel('Reading size').selectOption('1.5');await page.getByRole('button',{name:'Close',exact:true}).click();
 await openScreen(page,served.label);
 await follows(page,`${id} (${served.narration.action})`,null,/^(Begin|Play)$/,{playTimeout:90000,unplayable:evidence=>notServed(id,evidence)});
});

// clip: the excerpt's range in the recording it is cut from, or null to read the clip's progress from the ring.
async function follows(page,id,clip,offered,{playTimeout=30000,unplayable=null}={}){
 const view=page.locator('main .scripture-scroll');await expect(view).toBeVisible();await page.waitForTimeout(2000);
 expect(await view.evaluate(v=>v.scrollHeight-v.clientHeight),'text overflows the reading area').toBeGreaterThan(200);
 const primary=page.getByRole('navigation',{name:'Session controls'}).locator('.guide-primary');
 await expect(primary,'the easy button offers to start this recording').toHaveAccessibleName(offered,{timeout:30000});
 await page.evaluate(()=>window.__startTrace());await primary.click();
 if(unplayable){
  // A local target cannot prepare a recording ("…requires the published HTTPS app"); a deployed one must play it.
  // The start has ended without sound when the easy button is no longer busy and a notice says why.
  const state=()=>page.evaluate(()=>({playing:window.__trace.playing!==null,busy:document.querySelector('nav[aria-label="Session controls"] .guide-primary')?.getAttribute('aria-busy')==='true',notice:[...document.querySelectorAll('[role="status"]')].map(n=>n.textContent.trim()).filter(Boolean).join(' | ')}));
  const clicked=Date.now();
  await expect.poll(async()=>{const s=await state();return s.playing||!s.busy&&!!s.notice&&Date.now()-clicked>1500;},{timeout:playTimeout}).toBe(true);
  const s=await state();
  if(!s.playing){if(!deployed)return unplayable(`no recording played: ${s.notice}`);throw Error(`${id}: no recording played on ${deployed}: ${s.notice}`);}
 }
 await expect.poll(()=>page.evaluate(()=>window.__trace.playing),{timeout:playTimeout}).not.toBeNull();
 await expect.poll(()=>page.evaluate(()=>window.__trace.done),{timeout:130000}).toBe(true);
 const {rows,playing}=await page.evaluate(()=>window.__trace);
 const progress=r=>clip?(r.time-clip.startSeconds)/(clip.endSeconds-clip.startSeconds):r.ring;
 const sounding=rows.filter(r=>r.t>=playing&&r.top!==null&&r.time!==null&&progress(r)!==null);
 const after=rows.filter(r=>r.t>=playing&&r.top!==null&&r.t-playing<=10000);
 const at=ms=>sounding.find(r=>r.t-playing>=ms&&r.t-playing<=10000);
 const first=after[0];if(clip)expect(first.time,'the clip, not the file start, is playing').toBeGreaterThanOrEqual(clip.startSeconds-.25);
 const startJump=Math.max(...after.filter(r=>r.t-playing<=500).map(r=>Math.abs(r.top-first.top)));
 let window250=0,back=0,peak=-Infinity,reversals=0,dir=0,run=0,verseGap=0,gapFrom=null,marked=false;
 for(let i=0;i<after.length;i++){
  for(let j=i+1;j<after.length&&after[j].t-after[i].t<=250;j++)window250=Math.max(window250,Math.abs(after[j].top-after[i].top));
  peak=Math.max(peak,after[i].top);back=Math.max(back,peak-after[i].top);
  if(i){const d=after[i].top-after[i-1].top,s=Math.sign(d);if(s&&s===dir)run+=Math.abs(d);else if(s){if(dir&&run>=2)reversals++;dir=s;run=Math.abs(d);}}
  if(after[i].verse){marked=true;gapFrom=null;}else if(marked){gapFrom??=after[i].t;verseGap=Math.max(verseGap,after[i].t-gapFrom);}
 }
 // Drift is measured while the clip sounds: at every one of 3, 6 and 9 s that falls before the clip ends,
 // and at half the clip. The clip has ended at the first frame with no player sounding or with full progress;
 // each checkpoint before that needs its own sample.
 const ended=rows.find(r=>r.t>=playing&&(r.time===null||progress(r)!==null&&progress(r)>=1)),endMs=ended?Math.round(ended.t-playing):null;
 const checkpoints=[3000,6000,9000].filter(ms=>endMs===null||ms<endMs),samples=checkpoints.map(ms=>({ms,row:at(ms)})).map(s=>({...s,row:s.row&&progress(s.row)<1?s.row:null}));
 const unsampled=samples.filter(s=>!s.row).map(s=>s.ms),drift=samples.filter(s=>s.row).map(s=>Math.abs(s.row.top/s.row.max-progress(s.row)));
 const half=sounding.find(r=>progress(r)>=.5);
 const moved=half?half.top-first.top:null,drift50=half?Math.abs(half.top/half.max-progress(half)):null;
 const framesMoving=sounding.filter((r,i)=>i&&r.top!==sounding[i-1].top).length;
 const facts={startJump:+startJump.toFixed(1),window250:+window250.toFixed(1),checkpoints,clipEndedMs:endMs,drift:drift.map(d=>+d.toFixed(3)),back:+back.toFixed(1),max:first.max,reversals,verseGapMs:Math.round(verseGap),movedAtHalf:moved===null?null:+moved.toFixed(1),driftAtHalf:drift50===null?null:+drift50.toFixed(3),framesMoving,halfAtSeconds:half?+((half.t-playing)/1000).toFixed(1):null};
 // Machine facts for the receipt; reversals and the verse-marker gap are advisory in J4.
 test.info().annotations.push({type:'J4',description:JSON.stringify(facts)});console.log(`J4 ${id} ${JSON.stringify(facts)}`);
 expect(startJump,`first 500 ms after playing ${JSON.stringify(facts)}`).toBeLessThanOrEqual(40);
 expect(window250,`any 250 ms window ${JSON.stringify(facts)}`).toBeLessThanOrEqual(80);
 expect(checkpoints.length,`the clip sounds past the first checkpoint ${JSON.stringify(facts)}`).toBeGreaterThan(0);
 expect(unsampled,`a drift sample at every checkpoint before the clip ends ${JSON.stringify(facts)}`).toEqual([]);
 for(const d of drift)expect(d,`scroll fraction vs clip progress ${JSON.stringify(facts)}`).toBeLessThanOrEqual(.15);
 expect(back,`back-scroll ${JSON.stringify(facts)}`).toBeLessThanOrEqual(16);
 // N1: the text moved. By half the clip the reading has left its start and is where the clip is.
 expect(half,`the trace reaches half the clip ${JSON.stringify(facts)}`).toBeTruthy();
 expect(moved,`moved by half the clip ${JSON.stringify(facts)}`).toBeGreaterThan(0);
 expect(framesMoving,`frames moving ${JSON.stringify(facts)}`).toBeGreaterThan(0);
 expect(drift50,`scroll fraction vs clip progress at half the clip ${JSON.stringify(facts)}`).toBeLessThanOrEqual(.15);
}
