// Node-only consumer of a trusted verified source-stream port. No network client.
import {mkdtemp,open,rm,chmod} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const need=(value,reason)=>{if(!value)throw Error(`source-spool-${reason}`);};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function cancel(stream){try{Promise.resolve(stream?.cancel()).catch(()=>{});}catch{}}
export async function spoolVerifiedSource({source,openSource,workDirectory,maxBytes=2097152,totalMs=120000,signal}){
 const descriptor=structuredClone(source),producer=openSource;
 need(descriptor&&Object.keys(descriptor).sort().join()==='bytes,reference,sha256'&&hash(descriptor.sha256)&&descriptor.reference===`originals/sha256/${descriptor.sha256}.mp3`&&Number.isSafeInteger(descriptor.bytes)&&descriptor.bytes>0,'identity');
 need(typeof producer==='function'&&typeof workDirectory==='string'&&workDirectory.length>0&&Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=16777216&&descriptor.bytes<=maxBytes&&Number.isSafeInteger(totalMs)&&totalMs>0&&totalMs<=120000&&(signal===undefined||signal instanceof AbortSignal),'budget');
 const root=resolve(workDirectory),controller=new AbortController();let expired=false,timer,onAbort,reader,stream,handle,directory,retained=false;
 const interrupted=new Promise((_,reject)=>{onAbort=()=>{expired=true;controller.abort();reject(Error('source-spool-aborted'));};signal?.addEventListener('abort',onAbort,{once:true});timer=setTimeout(()=>{expired=true;controller.abort();reject(Error('source-spool-deadline'));},totalMs);if(signal?.aborted)onAbort();});
 // Observe immediately even if the first operation refuses synchronously.
 interrupted.catch(()=>{});
 const check=()=>need(!expired&&!signal?.aborted,'aborted');
 const wait=promise=>Promise.race([promise,interrupted]);
 try{
  check();
  const opening=Promise.resolve().then(()=>{check();return producer(structuredClone(descriptor),{maxBytes,signal:controller.signal});}).then(result=>{
   // A late producer result must not create a new writer after consumer cancellation.
   const verified=Promise.resolve(result?.verified);verified.catch(()=>{});
   if(expired){cancel(result?.stream);throw Error('source-spool-aborted');}
   return {result,verified};
  });
  const {result,verified}=await wait(opening);check();
  stream=result?.stream;
  need(result&&result.sha256===descriptor.sha256&&result.reference===descriptor.reference&&result.bytes===descriptor.bytes&&result.stream&&typeof result.stream.getReader==='function'&&result.verified&&typeof result.verified.then==='function','producer-binding');
  reader=result.stream.getReader();
  directory=await mkdtemp(join(root,'source-spool-'));await chmod(directory,0o700);check();
  const path=join(directory,'source.mp3');handle=await open(path,'wx',0o600);check();
  const digest=createHash('sha256');let count=0;
  for(;;){const next=await wait(reader.read());check();if(next.done)break;
   need(next.value instanceof Uint8Array&&next.value.length>0&&next.value.length<=65536,'chunk');
   const chunk=new Uint8Array(next.value);count+=chunk.length;need(count<=maxBytes&&count<=descriptor.bytes,'length');digest.update(chunk);
   let offset=0;while(offset<chunk.length){check();const {bytesWritten}=await handle.write(chunk,offset,chunk.length-offset);need(bytesWritten>0,'write');offset+=bytesWritten;}check();
  }
  need(count===descriptor.bytes&&digest.digest('hex')===descriptor.sha256,'integrity');
  await wait(verified);check();await handle.close();handle=null;check();
  retained=true;return Object.freeze({path,sha256:descriptor.sha256,bytes:count,async dispose(){await rm(directory,{recursive:true,force:true});}});
 }finally{
  clearTimeout(timer);signal?.removeEventListener('abort',onAbort);controller.abort();
  if(reader){try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}try{reader.releaseLock();}catch{}}
  if(!reader)cancel(stream);
  if(handle)await handle.close().catch(()=>{});
  if(directory&&!retained)await rm(directory,{recursive:true,force:true});
 }
}
