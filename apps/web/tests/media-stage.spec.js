import {it,expect,afterEach} from 'vitest';
import {render,screen,cleanup} from '@testing-library/svelte';
import MediaStage from '../src/components/MediaStage.svelte';
afterEach(cleanup);
const video={kind:'video',title:'Clip',downloadRequired:true,videoPrepared:true};
it('keeps Cancel loading when the connection drops while a video is loading',()=>{render(MediaStage,{asset:{...video,videoLoading:true,visualOffline:true}});expect(screen.getByRole('button',{name:'Cancel loading'})).toBeTruthy();expect(screen.queryByText(/not saved on this device/)).toBeNull();});
it('keeps Try again when a video load failed and the connection dropped',()=>{render(MediaStage,{asset:{...video,videoError:'The video could not load.',visualOffline:true}});expect(screen.getByRole('button',{name:'Try again'})).toBeTruthy();});
it('shows the offline note for an unsaved, idle video',()=>{render(MediaStage,{asset:{...video,visualOffline:true}});expect(screen.getByText(/This video is not saved on this device/)).toBeTruthy();});
