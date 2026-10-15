import {test,expect} from '@playwright/test';
import {activities} from '../apps/web/src/lib/content.js';
import {createSession} from '../apps/web/src/lib/engine.js';

const rgb=value=>value.match(/[\d.]+/g).map(Number);
const composite=(color,background)=>{const [r,g,b,a=1]=rgb(color),bg=rgb(background);return `rgb(${[r,g,b].map((v,i)=>v*a+bg[i]*(1-a)).join(',')})`;};
const luminance=color=>rgb(color).slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);

for(const width of [390,1280])for(const dark of [false,true])for(const revisited of [false,true])test(`Overview icon contrast ${width} ${dark?'dark':'light'} ${revisited?'revisited':'fresh'}`,async({browser,baseURL},info)=>{
 const context=await browser.newContext({viewport:{width,height:width===390?844:800},serviceWorkers:'block'}),page=await context.newPage();
 try{
  const session=createSession(activities);session.index=activities.findIndex(a=>a.id==='S02-U008');session.status='waiting';session.completed=activities.slice(0,session.index+(revisited?1:0)).map(a=>a.id);
  await page.addInitScript(value=>localStorage.setItem('fia-v3-session@2',JSON.stringify(value)),{session,dark,muted:true});
  await page.goto(baseURL);await page.getByRole('button',{name:'Session progress: open section overview'}).click();
  const current=page.locator('.ov-item.current');await expect(current).toHaveCount(1);await expect(current).toContainText('picture, 10 of 15');
  expect(await current.evaluate(e=>e.classList.contains('complete'))).toBe(revisited);
  const dots=await page.locator('.ov-item').evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e.querySelector('.ov-dot'));return{state:e.className,color:s.color,background:s.backgroundColor};}));
  for(const dot of dots)expect(contrast(dot.color,dot.background),dot.state).toBeGreaterThanOrEqual(3);
  await current.focus();await page.keyboard.press('Tab');
  const focus=await page.evaluate(()=>{const s=getComputedStyle(document.activeElement),sample=document.createElement('span');sample.style.background='var(--paper-000)';document.body.append(sample);const background=getComputedStyle(sample).backgroundColor;sample.remove();return{color:s.outlineColor,style:s.outlineStyle,width:s.outlineWidth,background};});
  expect(focus.style).toBe('solid');expect(parseFloat(focus.width)).toBeGreaterThanOrEqual(2);expect(contrast(composite(focus.color,focus.background),focus.background)).toBeGreaterThanOrEqual(3);
  await info.attach('computed-contrast',{body:JSON.stringify({dots:dots.map(d=>({...d,ratio:contrast(d.color,d.background)})),focus:{...focus,ratio:contrast(composite(focus.color,focus.background),focus.background)}},null,2),contentType:'application/json'});
  await info.attach('Overview',{body:await page.screenshot(),contentType:'image/png'});
 }finally{await context.close();}
});
