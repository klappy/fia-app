import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {startReference,referenceManifest} from '../scripts/parity-reference.mjs';
import {stableScreenshot} from './stable-screenshot.js';
const pack=JSON.parse(readFileSync('tests/parity-reference/source/src/lib/pack.json','utf8'));
const approvedDownload=JSON.parse(readFileSync('dist/offline/eng.MRK-1-1-13.json','utf8'));
// Same accepted derivative bytes on both sides isolate unchanged UI/artwork.
// Lossy source-to-output image differences are reviewed separately, never masked.
const deliveryIndex=JSON.parse(readFileSync('dist/content/delivery/index.json','utf8'));
const deliveryRecord=deliveryIndex.packs.find(p=>p.packId==='eng.MRK-1-1-13');
const deliveryBytes=readFileSync('dist'+deliveryRecord.delivery.url);
if(deliveryBytes.length!==deliveryRecord.delivery.bytes||createHash('sha256').update(deliveryBytes).digest('hex')!==deliveryRecord.delivery.sha256)throw Error('Unverified visual delivery sidecar');
const imageFixtures=new Map(JSON.parse(deliveryBytes).entries.filter(e=>e.delivery.kind==='image').map(e=>{
 const body=readFileSync(`tests/parity-reference/derivative-media/${e.delivery.sha256}.webp`);
 if(body.length!==e.delivery.bytes||createHash('sha256').update(body).digest('hex')!==e.delivery.sha256)throw Error('Unverified visual derivative '+e.path);
 return [e.path,{body,mime:e.delivery.mime,sha256:e.delivery.sha256}];
}));
if(imageFixtures.size!==8)throw Error('Expected all eight reviewed image fixtures');

let reference;
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{reference=await startReference();});
test.afterAll(async()=>{await reference?.close();});
const find=predicate=>{const index=pack.activities.findIndex(predicate);if(index<0)throw Error('Missing reference state');return index;};
// Authorized changed states for this candidate: every state that paints the session bar. The captain adopted the
// one-bar / stage-icon design book as mocked on 2026-10-08 (cookbook design/alpha-system/components/progress-rail.md
// § One bar; tokens.md § Icon vocabulary; cookbook #234, #235; app #210, #211; release/changes/one-bar-stage-icons.md).
// These are recorded as new-state evidence with independent visual review required, never as a renamed parity PASS.
// The pinned reference is unchanged. Plainly: with all eleven reference states authorized, THIS CANDIDATE HAS NO PARITY
// COMPARISON — the four width/theme shells pass with zero compared states — and parity resumes only when the reference
// is re-pinned to the adopted design. The four sheet states were already outside parity before this change.
// 'progress-overview' now also paints the overview sheet (cookbook design/alpha-system/components/overview-sheet.md,
// adopted 2026-10-08 as mocked in design/alpha-v2-screens/25-one-bar-overview.mock.html; fb-03 S2;
// release/changes/overview-sheet.md): new-state evidence, independent visual review required.
const authorizedChangedStates=new Set(['initial-guide','grouped-reading','scripture','discussion','image','map','term-instruction','term-definition','section-transition','progress-overview','menu']);
const states=[
 {name:'initial-guide',index:0,initial:true},
 {name:'grouped-reading',index:find(a=>!!a.readingGroupId)},
 {name:'scripture',index:find(a=>a.kind==='scripture')},
 {name:'discussion',index:find(a=>a.completion==='confirm')},
 {name:'image',index:find(a=>pack.assets[a.assetId]?.kind==='image')},
 {name:'map',index:find(a=>pack.assets[a.assetId]?.kind==='map')},
 {name:'term-instruction',index:find(a=>pack.assets[a.assetId]?.kind==='term')},
 {name:'term-definition',index:find(a=>pack.assets[a.assetId]?.kind==='term'),definition:true},
 {name:'section-transition',index:find(a=>a.sectionId===pack.sections[1].id),transition:true},
 {name:'progress-overview',index:0,progress:true},
 {name:'menu',index:0,menu:true},
 {name:'settings',index:0,menu:'Settings'},
 // Language and Passages left the menu for the overview sheet (fb-03 S3); these candidate-only sheet states open them there.
 {name:'languages',index:0,overview:'Language'},
 {name:'passages',index:0,overview:'Passages'},
 {name:'about',index:0,menu:'About & sources'},
];
async function openState(browser,url,viewport,dark,state,{verifiedFixture=false}={}){
 const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block',colorScheme:dark?'dark':'light'});
 const page=await context.newPage(),activity=pack.activities[state.index];
 await page.route('**/*',route=>{const fixture=imageFixtures.get(new URL(route.request().url()).pathname);return fixture?route.fulfill({status:200,contentType:fixture.mime,body:fixture.body}):route.continue();});
 await page.addInitScript(({index,dark,id,sectionId,definition,transition,initial,packId})=>{
  const session={index,status:initial?'ready':'paused',completed:[],mode:'scripted',preferences:{readScripture:false,describeImages:false,autoplayVideo:false},detour:null,detourReturnStatus:null,queued:null,pinned:null,history:[],events:[]};
  localStorage.setItem('fia-v3-progress@1:fia-mark-authentic',JSON.stringify({revision:'1',activityId:id,session,transitionSection:transition?sectionId:null,termDefinition:definition?id:null}));
  if(packId)localStorage.setItem('fia-v3-selected-pack',packId);
  localStorage.setItem('fia-v3-preferences@1',JSON.stringify({scale:1,rate:1,muted:!initial,dark,preferences:session.preferences}));
 },{...state,dark,id:activity.id,sectionId:activity.sectionId});
 if(verifiedFixture)await page.addInitScript(manifest=>{
  // Static visual fixture only: exact build-verified files. Real installation is tested separately.
  const active={postMessage(message,ports){ports[0].postMessage({ok:true,saved:true,active:{manifest,files:manifest.files}});}};Object.defineProperty(navigator,'serviceWorker',{value:{ready:Promise.resolve({active}),register:async()=>({active})},configurable:true});
 },approvedDownload);
 if(['online-available-initial','prepared-online-visual'].includes(state.name))await page.addInitScript(({manifest,visuals})=>{
  // Current-visual autoload fixture uses the same hash-verified image bytes as parity.
  window.__visualFixtureRequests=[];
  const active={postMessage(message,ports){if(message.type==='MEDIA_PLAY'){window.__visualFixtureRequests.push(message.path);const visual=visuals[message.path];ports[0].postMessage(visual?{ok:true,mime:visual.mime,bytes:Uint8Array.from(visual.bytes).buffer}:{ok:false,error:'Unexpected nonvisual playback'});return;}const response=message.type==='MEDIA_STATUS'?{ok:true,deliveryRevision:manifest.deliveryRevision,files:manifest.files.filter(f=>f.deliveryURL)}:{ok:true,saved:false,selected:true};ports[0].postMessage(response);}};
  Object.defineProperty(navigator,'serviceWorker',{value:{ready:Promise.resolve({active}),register:async()=>({active})},configurable:true});
 },{manifest:approvedDownload,visuals:Object.fromEntries([...imageFixtures].map(([path,f])=>[path,{mime:f.mime,bytes:[...f.body]}]))});
 await page.goto(url);await expect(page.locator('main.scene')).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 // Downloaded initial-state parity requires the final verified availability state.
 // Both pages must expose the same intended action before paint stabilization.
 if(state.initial && (verifiedFixture || url===reference.url))await expect(page.getByRole('button',{name:'Begin',exact:true})).toBeVisible();
 if(state.progress)await page.getByRole('button',{name:'Session progress: open section overview',exact:true}).click();
 if(state.menu){await page.getByRole('button',{name:'More options',exact:true}).click();if(typeof state.menu==='string')await page.getByRole('button',{name:state.menu,exact:state.menu!=='Language'}).click();}
 if(state.overview){await page.getByRole('button',{name:'Session progress: open section overview',exact:true}).click();await page.getByRole('button',{name:new RegExp('^'+state.overview)}).click();}
 await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
 await page.mouse.move(0,0);
 await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 return {page,context};
}
// Cookbook123: settle the demonstrated Chromium partial-paint artifact symmetrically.
async function settlePrimaryPaint(page){
 const inspect=()=>{
  const control=document.querySelector('.guide-primary');if(!control)return null;
  return {styleAttribute:control.getAttribute('style'),html:control.outerHTML,storage:JSON.stringify({...localStorage}),elements:Object.fromEntries(['.guide-primary','.primary-orbit','.primary-disc','.playback-ring','.scene-controls'].map(selector=>{const element=document.querySelector(selector);if(!element)return [selector,null];const style=getComputedStyle(element);return [selector,{rect:element.getBoundingClientRect().toJSON(),style:Object.fromEntries([...style].map(key=>[key,style.getPropertyValue(key)]))}];}))};
 };
 const before=await page.evaluate(inspect);
 if(!before)return {applicable:false};
 await page.evaluate(original=>{const control=document.querySelector('.guide-primary');try{control.setAttribute('style',(original??'')+';display:none');document.body.offsetHeight;}finally{if(original===null)control.removeAttribute('style');else control.setAttribute('style',original);document.body.offsetHeight;}},before.styleAttribute);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 // Mutate/restore the attribute without retaining a live inline CSSStyleDeclaration.
 // Preserve absent versus empty attributes exactly after browser synchronization.
 await page.evaluate(original=>{const control=document.querySelector('.guide-primary');if(original===null)control.removeAttribute('style');else control.setAttribute('style',original);document.body.offsetHeight;},before.styleAttribute);
 const after=await page.evaluate(inspect);
 return {applicable:true,unchanged:JSON.stringify(after)===JSON.stringify(before),before,after};
}
for(const width of [390,1280])for(const dark of [false,true])test('approved reference pixel parity '+width+' '+(dark?'dark':'light'),async({browser,baseURL,request},info)=>{
 test.setTimeout(240000);mkdirSync(info.outputDir,{recursive:true});
 const viewport={width,height:width===390?844:800},stamp=await (await request.get('/version.json')).json();
 const evidence={imageFixtureScope:'Same eight source-bound optimized derivatives on both pages; original-to-lossy-output comparison independently reviewed',imageFixtures:[...imageFixtures].map(([path,f])=>({path,sha256:f.sha256})),referenceCommit:referenceManifest.referenceCommit,candidateCheckout:process.env.GITHUB_SHA||stamp.commit,build:stamp,viewport,dark,comparison:'retain pre-settlement captures, verify symmetric full-paint settlement preserves DOM/styles/geometry/progress, then consecutive identical captures within eight attempts and exact cross-page PNG bytes; no pixel tolerance',states:[],newStates:[],limitations:['Static downloaded-state fixture supplies exact build-verified manifest metadata; this is not installation proof. Actual worker/media transfer tested by upgrade/journey suite.','Help and conversation have no exposed entry in the pinned menu; no new access route invented.','Audible quality, physical devices and playing-video frame parity are not established by static captures.']};
 try{for(const state of states.filter(s=>!['settings','languages','passages','about'].includes(s.name)&&!authorizedChangedStates.has(s.name))){let baseline,candidate;
  try{
   baseline=await openState(browser,reference.url,viewport,dark,state);candidate=await openState(browser,baseURL,viewport,dark,state,{verifiedFixture:true});
   const capture=async(page,path)=>{const result=await stableScreenshot(async()=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const image=await page.screenshot({animations:'disabled'});writeFileSync(path,image);return image;});return result;};
   const beforeExpected=await capture(baseline.page,info.outputPath(state.name+'-before-reference.png'));
   const beforeActual=await capture(candidate.page,info.outputPath(state.name+'-before-candidate.png'));
   const stateEvidence={name:state.name,preSettlementEqual:beforeActual.image.equals(beforeExpected.image),preSettlementReferenceSha256:createHash('sha256').update(beforeExpected.image).digest('hex'),preSettlementCandidateSha256:createHash('sha256').update(beforeActual.image).digest('hex')};evidence.states.push(stateEvidence);
   stateEvidence.referenceSettlement=await settlePrimaryPaint(baseline.page);
   stateEvidence.candidateSettlement=await settlePrimaryPaint(candidate.page);
   for(const settlement of [stateEvidence.referenceSettlement,stateEvidence.candidateSettlement])if(settlement.applicable)expect(settlement.after,'Paint settlement must restore exact DOM, styles, geometry and progress').toEqual(settlement.before);
   const expected=await capture(baseline.page,info.outputPath(state.name+'-reference.png'));
   const actual=await capture(candidate.page,info.outputPath(state.name+'-candidate.png'));
   const equal=actual.image.equals(expected.image);Object.assign(stateEvidence,{equal,referenceCaptures:expected.attempts,candidateCaptures:actual.attempts});
   if(!equal){
    const diagnostic={name:state.name,purpose:'Failure-only paint investigation; original equality remains authoritative',browser:browser.version(),stages:[]};
    evidence.paintDiagnostics??=[];evidence.paintDiagnostics.push(diagnostic);
    try{
     const inspect=page=>page.evaluate(()=>Object.fromEntries(['.guide-primary','.primary-orbit','.primary-disc','.playback-ring','.scene-controls'].map(selector=>{const element=document.querySelector(selector);if(!element)return [selector,null];const style=getComputedStyle(element);return [selector,{rect:element.getBoundingClientRect().toJSON(),html:element.outerHTML,style:Object.fromEntries([...style].map(key=>[key,style.getPropertyValue(key)]))}];})));
     diagnostic.original={reference:await inspect(baseline.page),candidate:await inspect(candidate.page)};
     for(const stage of ['hide-show','clone']){
      for(const page of [baseline.page,candidate.page])await page.evaluate(stage=>{const control=document.querySelector('.guide-primary');if(!control)throw Error('Missing primary control for paint diagnostic');if(stage==='clone')control.replaceWith(control.cloneNode(true));else{const original=control.style.display;control.style.display='none';document.body.offsetHeight;control.style.display=original;}},stage);
      const referencePaint=await capture(baseline.page,info.outputPath(state.name+'-diagnostic-'+stage+'-reference.png'));
      const candidatePaint=await capture(candidate.page,info.outputPath(state.name+'-diagnostic-'+stage+'-candidate.png'));
      diagnostic.stages.push({stage,equal:referencePaint.image.equals(candidatePaint.image),referenceSha256:createHash('sha256').update(referencePaint.image).digest('hex'),candidateSha256:createHash('sha256').update(candidatePaint.image).digest('hex'),referenceCaptures:referencePaint.attempts,candidateCaptures:candidatePaint.attempts,reference:await inspect(baseline.page),candidate:await inspect(candidate.page)});
     }
    }catch(error){diagnostic.error=String(error?.stack||error);}
   }
   expect(equal,'Visible parity failed: '+state.name+'; inspect both exact images').toBe(true);
  }finally{await baseline?.context.close();await candidate?.context.close();}
 }
 // Authorized changed states are a separate evidence set, never a renamed parity PASS.
 for(const state of [...states.filter(s=>['settings','languages','passages','about'].includes(s.name)||authorizedChangedStates.has(s.name)),{name:'manual-download-required',index:find(a=>pack.assets[a.assetId]?.kind==='image')},{name:'online-available-initial',index:0,initial:true},{name:'prepared-online-visual',index:find(a=>pack.assets[a.assetId]?.kind==='image')},{name:'spanish-text-only-initial',index:0,initial:true,packId:'spa.MRK-1-1-13'}]){
  const candidate=await openState(browser,baseURL,viewport,dark,state);
  try{if(state.name==='manual-download-required'){await expect(candidate.page.getByText('This image is not available online yet. You can continue with the passage text.',{exact:true})).toBeVisible();expect(await candidate.page.locator('img[src],video[src],audio[src]').count()).toBe(0);}
   if(state.name==='prepared-online-visual'){await expect.poll(()=>candidate.page.locator('.visual-viewport img').first().evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);expect(await candidate.page.evaluate(()=>window.__visualFixtureRequests)).toEqual([pack.assets[pack.activities[state.index].assetId].src]);expect(await candidate.page.locator('video[src],audio[src]').count()).toBe(0);}
   if(state.name==='online-available-initial')await expect(candidate.page.getByRole('button',{name:'Begin',exact:true})).toBeVisible();
   if(state.name==='spanish-text-only-initial')await expect(candidate.page.getByRole('button',{name:'Continue',exact:true})).toBeVisible();
   const actual=await stableScreenshot(()=>candidate.page.screenshot({animations:'disabled'}));writeFileSync(info.outputPath(state.name+'-new-state.png'),actual.image);evidence.newStates.push({name:state.name,referenceComparison:'not-applicable-user-authorized-content-or-availability-change',independentVisualReview:'required',captures:actual.attempts});
  }finally{await candidate.context.close();}
 }
 }finally{writeFileSync(info.outputPath('parity-evidence.json'),JSON.stringify(evidence,null,2));}
});
