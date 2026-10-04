import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {startReference,referenceManifest} from '../scripts/parity-reference.mjs';
import {stableScreenshot} from './stable-screenshot.js';
const pack=JSON.parse(readFileSync('tests/parity-reference/source/src/lib/pack.json','utf8'));
const approvedDownload=JSON.parse(readFileSync('dist/offline/eng.MRK-1-1-13.json','utf8'));
let reference;
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{reference=await startReference();});
test.afterAll(async()=>{await reference?.close();});
const find=predicate=>{const index=pack.activities.findIndex(predicate);if(index<0)throw Error('Missing reference state');return index;};
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
 {name:'languages',index:0,menu:'Language'},
 {name:'passages',index:0,menu:'Passages'},
 {name:'about',index:0,menu:'About & sources'},
];
async function openState(browser,url,viewport,dark,state,{verifiedFixture=false}={}){
 const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block',colorScheme:dark?'dark':'light'});
 const page=await context.newPage(),activity=pack.activities[state.index];
 await page.addInitScript(({index,dark,id,sectionId,definition,transition,initial})=>{
  const session={index,status:initial?'ready':'paused',completed:[],mode:'scripted',preferences:{readScripture:false,describeImages:false,autoplayVideo:false},detour:null,detourReturnStatus:null,queued:null,pinned:null,history:[],events:[]};
  localStorage.setItem('fia-v3-progress@1:fia-mark-authentic',JSON.stringify({revision:'1',activityId:id,session,transitionSection:transition?sectionId:null,termDefinition:definition?id:null}));
  localStorage.setItem('fia-v3-preferences@1',JSON.stringify({scale:1,rate:1,muted:!initial,dark,preferences:session.preferences}));
 },{...state,dark,id:activity.id,sectionId:activity.sectionId});
 if(verifiedFixture)await page.addInitScript(manifest=>{
  // Static visual fixture only: exact build-verified files. Real installation is tested separately.
  const active={postMessage(message,ports){ports[0].postMessage({ok:true,saved:true,active:{manifest,files:manifest.files}});}};Object.defineProperty(navigator,'serviceWorker',{value:{ready:Promise.resolve({active}),register:async()=>({active})},configurable:true});
 },approvedDownload);
 await page.goto(url);await expect(page.locator('main.scene')).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 // Downloaded initial-state parity requires the final verified availability state.
 // Both pages must expose the same intended action before paint stabilization.
 if(state.initial && (verifiedFixture || url===reference.url))await expect(page.getByRole('button',{name:'Begin',exact:true})).toBeVisible();
 if(state.progress)await page.getByRole('button',{name:'Session progress: open section overview',exact:true}).click();
 if(state.menu){await page.getByRole('button',{name:'More options',exact:true}).click();if(typeof state.menu==='string')await page.getByRole('button',{name:state.menu,exact:state.menu!=='Language'}).click();}
 await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
 await page.mouse.move(0,0);
 await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 return {page,context};
}
for(const width of [390,1280])for(const dark of [false,true])test('approved reference pixel parity '+width+' '+(dark?'dark':'light'),async({browser,baseURL,request},info)=>{
 test.setTimeout(240000);mkdirSync(info.outputDir,{recursive:true});
 const viewport={width,height:width===390?844:800},stamp=await (await request.get('/version.json')).json();
 const evidence={referenceCommit:referenceManifest.referenceCommit,candidateCheckout:process.env.GITHUB_SHA||stamp.commit,build:stamp,viewport,dark,comparison:'each page requires consecutive identical captures within eight attempts, then exact cross-page PNG bytes; no pixel tolerance',states:[],newStates:[],limitations:['Static downloaded-state fixture supplies exact build-verified manifest metadata; this is not installation proof. Actual worker/media transfer tested by upgrade/journey suite.','Help and conversation have no exposed entry in the pinned menu; no new access route invented.','Audible quality, physical devices and playing-video frame parity are not established by static captures.']};
 try{for(const state of states.filter(s=>!['settings','languages','passages','about'].includes(s.name))){let baseline,candidate;
  try{
   baseline=await openState(browser,reference.url,viewport,dark,state);candidate=await openState(browser,baseURL,viewport,dark,state,{verifiedFixture:true});
   const capture=async(page,path)=>{const result=await stableScreenshot(async()=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const image=await page.screenshot({animations:'disabled'});writeFileSync(path,image);return image;});return result;};
   const expected=await capture(baseline.page,info.outputPath(state.name+'-reference.png'));
   const actual=await capture(candidate.page,info.outputPath(state.name+'-candidate.png'));
   const equal=actual.image.equals(expected.image);evidence.states.push({name:state.name,equal,referenceCaptures:expected.attempts,candidateCaptures:actual.attempts});
   expect(equal,'Visible parity failed: '+state.name+'; inspect both exact images').toBe(true);
  }finally{await baseline?.context.close();await candidate?.context.close();}
 }
 // Authorized changed states are a separate evidence set, never a renamed parity PASS.
 for(const state of [...states.filter(s=>['settings','languages','passages','about'].includes(s.name)),{name:'manual-download-required',index:find(a=>pack.assets[a.assetId]?.kind==='image')},{name:'text-only-initial',index:0,initial:true}]){
  const candidate=await openState(browser,baseURL,viewport,dark,state);
  try{if(state.name==='manual-download-required'){await expect(candidate.page.getByRole('button',{name:'Open Downloads'})).toBeVisible();expect(await candidate.page.locator('img[src],video[src],audio[src]').count()).toBe(0);}
   if(state.name==='text-only-initial')await expect(candidate.page.getByRole('button',{name:'Continue',exact:true})).toBeVisible();
   const actual=await stableScreenshot(()=>candidate.page.screenshot({animations:'disabled'}));writeFileSync(info.outputPath(state.name+'-new-state.png'),actual.image);evidence.newStates.push({name:state.name,referenceComparison:'not-applicable-user-authorized-content-or-availability-change',independentVisualReview:'required',captures:actual.attempts});
  }finally{await candidate.context.close();}
 }
 }finally{writeFileSync(info.outputPath('parity-evidence.json'),JSON.stringify(evidence,null,2));}
});
