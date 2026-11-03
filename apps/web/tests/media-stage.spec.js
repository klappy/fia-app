import {it,expect,afterEach} from 'vitest';
import {render,screen,cleanup} from '@testing-library/svelte';
import MediaStage from '../src/components/MediaStage.svelte';
afterEach(cleanup);
const video={kind:'video',title:'Clip',downloadRequired:true,videoPrepared:true};
it('keeps Cancel loading when the connection drops while a video is loading',()=>{render(MediaStage,{asset:{...video,videoLoading:true,visualOffline:true}});expect(screen.getByRole('button',{name:'Cancel loading'})).toBeTruthy();expect(screen.queryByText(/not saved on this device/)).toBeNull();});
it('keeps Try again when a video load failed and the connection dropped',()=>{render(MediaStage,{asset:{...video,videoError:'The video could not load.',visualOffline:true}});expect(screen.getByRole('button',{name:'Try again'})).toBeTruthy();});
it('shows the offline note for an unsaved, idle video',()=>{render(MediaStage,{asset:{...video,visualOffline:true}});expect(screen.getByText(/This video is not saved on this device/)).toBeTruthy();});

// PR318 design-lens HOLD (R6/R8/R5): an unavailable picture or map keeps the step's own words on the stage, puts a
// bounded, state-accurate note in the media slot, and shows user-facing collection names. Records are the prepared
// eng.MRK-1-14-20 S02-U008 (a1400) and its derived S02-U008-resource-c4 (c4), which carries the same source prompt.
const prompt='Stop here and look at a map of the Galilee area and a picture of the Sea of Galilee as a group. Pause this audio here.';
const a1400={id:'a1400',kind:'image',title:'Sea of Galilee',source:'FIAImages · CC BY-SA 4.0 license',downloadRequired:true};
const c4={id:'c4',kind:'map',title:'Galilee Area with Caesarea Philippi and Capernaum',source:'FIAMaps · CC BY-SA 4.0 license',downloadRequired:true};
const guideFor=id=>({id,kind:'guide',text:prompt,activeItemId:id});
it('an unavailable picture keeps the step prompt on the stage above a bounded, honest status region',()=>{
 const {container}=render(MediaStage,{asset:a1400,guide:guideFor('S02-U008'),playback:{src:null,elapsed:0,playing:false}});
 expect(container.querySelector('.unavailable-words').textContent).toContain(prompt);
 const status=screen.getByRole('status');expect(status.classList.contains('media-status')).toBe(true);
 expect(status.textContent).toBe('This image is unavailable here. You can continue without it.');
 expect(container.textContent).not.toMatch(/online yet|passage text/);
 expect(screen.getAllByText(prompt)).toHaveLength(1);
 expect(container.querySelector('.media-stage').classList.contains('visual-unavailable')).toBe(true);
});
it('the derived map stop shows its carried source prompt and map wording, not an invented one',()=>{
 const {container}=render(MediaStage,{asset:c4,guide:guideFor('S02-U008-resource-c4'),playback:{src:null,elapsed:0,playing:false}});
 expect(container.querySelector('.unavailable-words').textContent).toContain(prompt);
 expect(screen.getByRole('status').textContent).toBe('This map is unavailable here. You can continue without it.');
});
it('without step words (a resource detour) the unavailable note keeps the existing stage and the new wording',()=>{
 const {container}=render(MediaStage,{asset:a1400,playback:{src:null,elapsed:0,playing:false}});
 expect(container.querySelector('.unavailable-words')).toBeNull();expect(container.querySelector('.media-status')).toBeNull();
 expect(screen.getByText('This image is unavailable here. You can continue without it.')).toBeTruthy();
});
it('keeps the distinct offline, loading and retry states inside the bounded region',()=>{
 for(const [state,text] of [[{visualOffline:true},/not saved on this device/],[{visualPrepared:true,visualLoading:true},/Loading this image/],[{visualPrepared:true,visualError:'This image could not load.'},/could not load/]]){
  const {container,unmount}=render(MediaStage,{asset:{...a1400,...state},guide:guideFor('S02-U008'),playback:{src:null,elapsed:0,playing:false}});
  expect(container.querySelector('.media-status').textContent).toMatch(text);expect(container.querySelector('.unavailable-words').textContent).toContain(prompt);unmount();
 }
});
it('an available picture renders the picture, never the step words or a status region',()=>{
 const {container}=render(MediaStage,{asset:{...a1400,downloadRequired:false,src:'/assets/a1400.webp'},guide:guideFor('S02-U008'),playback:{src:null,elapsed:0,playing:false}});
 expect(container.querySelector('.unavailable-words')).toBeNull();expect(container.querySelector('.media-status')).toBeNull();
});
it('captions show user-facing collection names in the existing format',()=>{
 for(const [source,credit] of [['FIAImages · CC BY-SA 4.0 license','FIA Images · CC BY-SA 4.0'],['FIAMaps · CC BY-SA 4.0 license','FIA Maps · CC BY-SA 4.0'],['Familiarization, Internalization, Articulation (FIA) Images · CC BY-SA 4.0','FIA Images · CC BY-SA 4.0']]){
  const {unmount}=render(MediaStage,{asset:{...a1400,source},playback:{src:null,elapsed:0,playing:false}});
  expect(screen.getByText(credit)).toBeTruthy();expect(screen.queryByText(/FIAImages|FIAMaps|license/)).toBeNull();unmount();
 }
});
// Codex P2 on #321 at 6a61a87: the step words are a keyboard-reachable scroll region (narration tracking does not apply in
// this state: guide units carry no alignment data and the S02-U008 narration is blocked), and the live status region never
// announces "unavailable" while the device check is still running.
it('the step words are a focusable, labelled scroll region',()=>{
 const {container}=render(MediaStage,{asset:a1400,guide:guideFor('S02-U008'),playback:{src:null,elapsed:0,playing:false}});
 const region=screen.getByRole('region',{name:'Step text'});expect(region.getAttribute('tabindex')).toBe('0');expect(region.classList.contains('scripture-scroll')).toBe(true);
 expect(region.textContent).toContain(prompt);expect(container.querySelectorAll('.unavailable-words p')).toHaveLength(1);
});
it('while the device check runs the status region is silent, then announces the settled state once',async()=>{
 const {rerender}=render(MediaStage,{asset:a1400,guide:guideFor('S02-U008'),checking:true,playback:{src:null,elapsed:0,playing:false}});
 const status=screen.getByRole('status');expect(status.textContent).toBe('Checking availability…');
 expect(status.querySelector('[aria-hidden="true"]').textContent).toBe('Checking availability…');expect(screen.queryByText(/is unavailable here/)).toBeNull();
 expect(screen.getByRole('region',{name:'Step text'}).textContent).toContain(prompt);
 await rerender({asset:a1400,guide:guideFor('S02-U008'),checking:false,playback:{src:null,elapsed:0,playing:false}});
 expect(screen.getByRole('status').textContent).toBe('This image is unavailable here. You can continue without it.');expect(screen.getByRole('status').querySelector('[aria-hidden="true"]')).toBeNull();
});
