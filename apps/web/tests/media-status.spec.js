import {it,expect,vi,afterEach} from 'vitest';
import {libraryAdapter} from '../src/lib/library.js';
afterEach(()=>vi.unstubAllGlobals());
function transport(code){
 let channel;
 vi.stubGlobal('MessageChannel',class{constructor(){channel=this;this.port1={close:vi.fn()};this.port2={};}});
 vi.stubGlobal('navigator',{serviceWorker:{ready:Promise.resolve({active:{postMessage:()=>queueMicrotask(()=>channel.port1.onmessage({data:{ok:false,error:'Media availability could not be verified.',code}}))}})}});
}
it.each(['media-status-transient','media-status-invalid','unrecognized',undefined])('MEDIA_STATUS preserves only allowlisted code %s',async code=>{
 transport(code);await expect(libraryAdapter.mediaStatus({id:'eng.MRK-1-14-20',revision:'a'.repeat(64)})).rejects.toMatchObject({code:code==='media-status-transient'?code:'media-status-invalid'});
});
it('typed status envelope does not change download error semantics',async()=>{
 transport('media-status-transient');try{await libraryAdapter.downloadStatus({id:'eng.MRK-1-14-20'});throw Error('unexpected');}catch(error){expect(error.code).toBeUndefined();}
});
