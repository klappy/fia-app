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
it('media and save messages retain projected revision and exact server media binding separately',async()=>{
 const sent=[];let channel;vi.stubGlobal('MessageChannel',class{constructor(){channel=this;this.port1={close:vi.fn()};this.port2={};}});
 vi.stubGlobal('navigator',{serviceWorker:{ready:Promise.resolve({active:{postMessage:message=>{sent.push(message);queueMicrotask(()=>channel.port1.onmessage({data:{ok:true}}));}}})}});
 const pack={id:'eng.MRK-1-14-20',revision:'a'.repeat(64),mediaIdentity:{packId:'eng.MRK-1-14-20',revision:'b'.repeat(64)},mediaAssetsSha256:'c'.repeat(64)};
 await libraryAdapter.mediaStatus(pack);await libraryAdapter.playMedia(pack,'/image.jpg','delivery',new AbortController().signal);await libraryAdapter.download(['images'],()=>{},pack);await libraryAdapter.activate(pack);
 expect(sent.map(m=>m.type)).toEqual(['MEDIA_STATUS','MEDIA_PLAY','DOWNLOAD_START','PACK_SELECT']);
 for(const message of sent){expect(message.revision).toBe(pack.revision);expect(message.mediaIdentity).toEqual(pack.mediaIdentity);expect(message.mediaAssetsSha256).toBe(pack.mediaAssetsSha256);}
});
