import {it,expect,vi,afterEach} from 'vitest';
import {libraryAdapter} from '../src/lib/library.js';
import {reactiveWorkerInput} from './helpers/reactive-worker-input.svelte.js';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('sends real Svelte state bindings through the structured clone boundary for media, Save and activation',async()=>{
 vi.useFakeTimers();const sent=[];let channel;
 vi.stubGlobal('MessageChannel',class{constructor(){channel=this;this.port1={close:vi.fn()};this.port2={};}});
 vi.stubGlobal('navigator',{serviceWorker:{ready:Promise.resolve({active:{postMessage:message=>{const cloned=structuredClone(message);sent.push(cloned);Promise.resolve().then(()=>channel.port1.onmessage({data:{ok:true}}));}}})}});
 const {pack,sizes}=reactiveWorkerInput();
 expect(()=>structuredClone(pack.mediaIdentity)).toThrow();expect(()=>structuredClone(sizes)).toThrow();
 await libraryAdapter.mediaStatus(pack);
 await libraryAdapter.playMedia(pack,'/verified-original.mp3','delivery',new AbortController().signal,'medium');
 await libraryAdapter.download('audio',()=>{},pack,sizes);
 await libraryAdapter.activate(pack);
 expect(sent.map(m=>m.type)).toEqual(['MEDIA_STATUS','MEDIA_PLAY','DOWNLOAD_START','PACK_SELECT']);
 for(const message of sent){expect(message.mediaIdentity).toEqual({packId:pack.id,revision:'b'.repeat(64)});expect(message.revision).toBe(pack.revision);expect(message.mediaAssetsSha256).toBe(pack.mediaAssetsSha256);}
 expect(sent[2].sizes).toEqual({image:'small',audio:'medium',video:'prepared'});
 expect(vi.getTimerCount()).toBe(0);
});
it('closes both channel ends and clears the timeout when postMessage rejects, preserving the exact error',async()=>{
 vi.useFakeTimers();const close1=vi.fn(),close2=vi.fn(),failure=new DOMException('Uncloneable payload','DataCloneError');
 vi.stubGlobal('MessageChannel',class{constructor(){this.port1={close:close1};this.port2={close:close2};}});
 vi.stubGlobal('navigator',{serviceWorker:{ready:Promise.resolve({active:{postMessage(){throw failure;}}})}});
 await expect(libraryAdapter.mediaStatus(reactiveWorkerInput().pack)).rejects.toBe(failure);
 expect(close1).toHaveBeenCalledOnce();expect(close2).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
