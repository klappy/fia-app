import test from 'node:test';
import assert from 'node:assert/strict';
import {noticeKind,noticeScope,noticeEnded} from '../src/lib/notice-scope.js';

const spanish={id:'spa.MRK-1-14-20',revision:'r-spa'},english={id:'eng.MRK-1-14-20',revision:'r-eng'};
const raisedOn=(pack,activityId,more={})=>noticeScope('No recording is available for this Scripture passage. You can read it and continue.',{pack,activityId,...more});

test('a notice records its passage revision, screen, sheet and kind when it is raised',()=>{
 assert.deepEqual(raisedOn(spanish,'S01-U002-reading-1'),{text:'No recording is available for this Scripture passage. You can read it and continue.',kind:'unavailable',packId:'spa.MRK-1-14-20',revision:'r-spa',activityId:'S01-U002-reading-1',sheet:null,playing:false});
 assert.equal(noticeScope('Language choice could not be saved on this device.',{pack:english,activityId:'S01-U001',sheet:'languages'}).sheet,'languages');
});

test('a passage change, a new revision or a new screen ends the notice; its own scope keeps it',()=>{
 const scope=raisedOn(spanish,'S01-U002-reading-1'),here={pack:spanish,activityId:'S01-U002-reading-1',sheet:null,playing:false};
 assert.equal(noticeEnded(scope,here),false);
 assert.equal(noticeEnded(scope,{...here,pack:english}),true);
 assert.equal(noticeEnded(scope,{...here,pack:{...spanish,revision:'r-spa-2'}}),true);
 assert.equal(noticeEnded(scope,{...here,activityId:'S01-U003'}),true);
 assert.equal(noticeEnded(scope,{...here,sheet:'menu'}),false,'a sheet opening over the screen does not end its notice');
});

test('a notice raised in a sheet ends when the sheet closes, not when it changes view',()=>{
 const scope=raisedOn(english,'S01-U001',{sheet:'languages'}),here={pack:english,activityId:'S01-U001',sheet:'languages',playing:false};
 assert.equal(noticeEnded(scope,{...here,sheet:'passages'}),false);
 assert.equal(noticeEnded(scope,{...here,sheet:null}),true);
});

test('a notice raised while nothing played ends once playback starts; one raised during playback does not',()=>{
 const paused=noticeScope('Tap Play to hear the narration. Your browser paused automatic audio.',{pack:english,activityId:'S01-U001',playing:false});
 assert.equal(noticeEnded(paused,{pack:english,activityId:'S01-U001',sheet:null,playing:true}),true);
 const during=noticeScope('Video unavailable. Try again or continue without it.',{pack:english,activityId:'S01-U001',playing:true});
 assert.equal(noticeEnded(during,{pack:english,activityId:'S01-U001',sheet:null,playing:false}),false);
 assert.equal(noticeEnded(during,{pack:english,activityId:'S01-U001',sheet:null,playing:true}),false);
});

test('kind is error, unavailable or info, read from the app wording',()=>{
 for(const text of ['No recording is available for this Scripture passage. You can read it and continue.','This recording is unavailable. You can continue.','No source recording is available for this resource.','This passage could not be loaded. Your current passage stays open.','This passage is not available yet. Your current passage stays open.','Connect to prepare or play this recording. You can continue without it.','Download this resource before playback.','Video unavailable. Try again or continue without it.','The recording range is unavailable.'])assert.equal(noticeKind(text),'unavailable',text);
 for(const text of ['The server catalog is invalid.','Your browser could not save your place. This session still works.','Language choice could not be saved on this device.','This instruction text could not be verified.','Recording integrity failed.','The voice stopped. You can replay or continue by reading.','This passage changed. Your previous place could not be matched; starting at the beginning.','Scripture playback binding changed.'])assert.equal(noticeKind(text),'error',text);
 for(const text of ['Tap Play to hear the narration. Your browser paused automatic audio.','Playback canceled.','Using the last verified saved passage while offline.','The passage is ready for you to read. Continue when you’re ready.','Recording ready. Press Play to listen.','Preparing this recording. You can continue without waiting.','You’re offline','Offline · session saved','I haven’t changed the activity. For this prototype, use a positive navigation command or change a playback preference in Settings.'])assert.equal(noticeKind(text),'info',text);
});
