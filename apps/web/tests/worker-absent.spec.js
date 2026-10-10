// R5: with no deadline, a check must end when its answer is known. When the page's own
// registration shows no service worker is on its way, waiting requests end now with the
// not-ready answer instead of after the 10 s ready timeout.
import {it,expect,vi,afterEach,beforeEach} from 'vitest';
const NOT_READY='Download storage is not ready. Reload the published Site and try again.';
const pack={id:'eng.MRK-1-1-13',revision:'a'.repeat(64)};
let library,channel;
beforeEach(async()=>{vi.resetModules();library=await import('../src/lib/library.js');});
afterEach(()=>vi.unstubAllGlobals());
const never=()=>new Promise(()=>{});
// Settles within a short real window or reports that it is still waiting.
const within=(promise,ms=300)=>Promise.race([promise.then(value=>({value}),error=>({error:error.message})),new Promise(r=>setTimeout(()=>r('still waiting'),ms))]);
function answering(){
 vi.stubGlobal('MessageChannel',class{constructor(){channel=this;this.port1={close:vi.fn()};this.port2={};}});
 return {active:{postMessage:()=>queueMicrotask(()=>channel.port1.onmessage({data:{ok:true,files:[],savedFiles:[],deliveryRevision:null}}))}};
}
function worker(container){vi.stubGlobal('navigator',{serviceWorker:{ready:never(),getRegistration:async()=>undefined,...container}});}

it('a blocked registration (no registration object) ends a waiting check at once',async()=>{
 worker({register:async()=>undefined});
 const check=library.libraryAdapter.mediaStatus(pack);await library.registerWorker('/sw.js');
 expect(await within(check)).toEqual({error:NOT_READY});
 // Later checks answer at once too.
 expect(await within(library.libraryAdapter.downloadStatus(pack))).toEqual({error:NOT_READY});
});

it('a rejected registration with no active worker ends a waiting check at once',async()=>{
 worker({register:async()=>{throw Error('SecurityError');}});
 const check=library.libraryAdapter.mediaStatus(pack);
 await expect(library.registerWorker('/sw.js')).rejects.toThrow('SecurityError');
 expect(await within(check)).toEqual({error:NOT_READY});
});

it('an install that fails with none active ends a waiting check once the worker is redundant',async()=>{
 const installing=new EventTarget();installing.state='installing';const registration=Object.assign(new EventTarget(),{installing,waiting:null,active:null});
 worker({register:async()=>registration});
 const check=library.libraryAdapter.mediaStatus(pack);await library.registerWorker('/sw.js');
 expect(await within(check,100)).toBe('still waiting');
 registration.installing=null;installing.state='redundant';installing.dispatchEvent(new Event('statechange'));
 expect(await within(check)).toEqual({error:NOT_READY});
});

it('a failed update beside an active worker keeps waiting for that worker, which answers',async()=>{
 let ready;const registration=answering();
 worker({ready:new Promise(r=>ready=r),register:async()=>{throw Error('update failed');},getRegistration:async()=>registration});
 const check=library.libraryAdapter.mediaStatus(pack);
 await expect(library.registerWorker('/sw.js')).rejects.toThrow('update failed');
 expect(await within(check,100)).toBe('still waiting');
 ready(registration);
 expect((await within(check)).value).toMatchObject({ok:true});
});

it('an install that activates is waited for and answers',async()=>{
 let ready;const installing=new EventTarget();installing.state='installing';const registration=Object.assign(new EventTarget(),{installing,waiting:null,active:null});
 worker({ready:new Promise(r=>ready=r),register:async()=>registration});
 const check=library.libraryAdapter.mediaStatus(pack);await library.registerWorker('/sw.js');
 const active=answering().active;installing.state='activated';registration.installing=null;registration.active=active;installing.dispatchEvent(new Event('statechange'));
 ready(registration);
 expect((await within(check)).value).toMatchObject({ok:true});
});

// The Service Worker spec queues the failed worker's 'redundant' statechange before the task that
// clears registration.installing, so the handler can still see the failed worker there.
it('an install that fails, seen in the spec\'s order (statechange before installing clears), ends a waiting check at once',async()=>{
 const installing=new EventTarget();installing.state='installing';const registration=Object.assign(new EventTarget(),{installing,waiting:null,active:null});
 worker({register:async()=>registration});
 const check=library.libraryAdapter.mediaStatus(pack);await library.registerWorker('/sw.js');
 expect(await within(check,100)).toBe('still waiting');
 installing.state='redundant';installing.dispatchEvent(new Event('statechange'));registration.installing=null;
 expect(await within(check)).toEqual({error:NOT_READY});
});

it('a newer worker that replaces the pending one is waited for; when it fails too, the check ends at once',async()=>{
 const first=new EventTarget();first.state='installing';const registration=Object.assign(new EventTarget(),{installing:first,waiting:null,active:null});
 worker({register:async()=>registration});
 const check=library.libraryAdapter.mediaStatus(pack);await library.registerWorker('/sw.js');
 const second=new EventTarget();second.state='installing';registration.installing=second;registration.dispatchEvent(new Event('updatefound'));
 first.state='redundant';first.dispatchEvent(new Event('statechange'));
 expect(await within(check,100)).toBe('still waiting');
 second.state='redundant';second.dispatchEvent(new Event('statechange'));registration.installing=null;
 expect(await within(check)).toEqual({error:NOT_READY});
});

it('a failed install beside another pending worker keeps waiting for that worker; when it fails too, the check ends at once',async()=>{
 const first=new EventTarget();first.state='installing';const second=new EventTarget();second.state='installed';
 const registration=Object.assign(new EventTarget(),{installing:first,waiting:second,active:null});
 worker({register:async()=>registration});
 const check=library.libraryAdapter.mediaStatus(pack);await library.registerWorker('/sw.js');
 first.state='redundant';first.dispatchEvent(new Event('statechange'));registration.installing=null;
 expect(await within(check,100)).toBe('still waiting');
 second.state='redundant';second.dispatchEvent(new Event('statechange'));registration.waiting=null;
 expect(await within(check)).toEqual({error:NOT_READY});
});
