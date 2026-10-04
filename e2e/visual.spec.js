import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {startReference,referenceManifest} from '../scripts/parity-reference.mjs';
const pack=JSON.parse(readFileSync('tests/parity-reference/source/src/lib/pack.json','utf8'));
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
 {name:'menu',index:0,menu:true},
 {name:'settings',index:0,menu:'Settings'},
 {name:'languages',index:0,menu:'Language'},
 {name:'passages',index:0,menu:'Passages'},
 {name:'about',index:0,menu:'About & sources'},
];
async function openState(browser,url,viewport,dark,state){
 const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block',colorScheme:dark?'dark':'light'});
 const page=await context.newPage(),activity=pack.activities[state.index];
 await page.addInitScript(({index,dark,id,sectionId,definition,transition,initial})=>{
  const session={index,status:initial?'ready':'paused',completed:[],mode:'scripted',preferences:{readScripture:false,describeImages:false,autoplayVideo:false},detour:null,detourReturnStatus:null,queued:null,pinned:null,history:[],events:[]};
  localStorage.setItem('fia-v3-progress@1:fia-mark-authentic',JSON.stringify({revision:'1',activityId:id,session,transitionSection:transition?sectionId:null,termDefinition:definition?id:null}));
  localStorage.setItem('fia-v3-preferences@1',JSON.stringify({scale:1,rate:1,muted:!initial,dark,preferences:session.preferences}));
 },{...state,dark,id:activity.id,sectionId:activity.sectionId});
 await page.goto(url);await expect(page.locator('main.scene')).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
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
 const evidence={referenceCommit:referenceManifest.referenceCommit,candidateCheckout:process.env.GITHUB_SHA||stamp.commit,build:stamp,viewport,dark,comparison:'exact PNG bytes; no pixel tolerance',states:[],limitations:['Static presentation with service workers blocked; actual worker tested by upgrade/journey suite.','Help and conversation have no exposed entry in the pinned menu; no new access route invented.','Audible quality, physical devices and playing-video frame parity are not established by static captures.']};
 try{for(const state of states){let baseline,candidate;
  try{
   baseline=await openState(browser,reference.url,viewport,dark,state);candidate=await openState(browser,baseURL,viewport,dark,state);
   const expected=await baseline.page.screenshot({path:info.outputPath(state.name+'-reference.png'),animations:'disabled'});
   const actual=await candidate.page.screenshot({path:info.outputPath(state.name+'-candidate.png'),animations:'disabled'});
   const equal=actual.equals(expected);evidence.states.push({name:state.name,equal});
   expect(equal,'Visible parity failed: '+state.name+'; inspect both exact images').toBe(true);
  }finally{await baseline?.context.close();await candidate?.context.close();}
 }}finally{writeFileSync(info.outputPath('parity-evidence.json'),JSON.stringify(evidence,null,2));}
});
