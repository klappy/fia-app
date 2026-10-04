import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, reduceSession, currentActivity, presentStage } from '../src/lib/engine.js';
import { parseCommand } from '../src/lib/commands.js';

const activities = [
  { id: 'intro', kind: 'guide', completion: 'auto' },
  { id: 'read', kind: 'scripture', assetId: 'scripture', completion: 'auto' },
  { id: 'discuss', kind: 'image', assetId: 'image', completion: 'confirm' },
  { id: 'locate', kind: 'map', assetId: 'map', completion: 'confirm' },
  { id: 'watch', kind: 'video', assetId: 'video', completion: 'media' },
  { id: 'return', kind: 'guide', completion: 'confirm' },
];
const apply = (state, type, props = {}) => reduceSession(state, { type, ...props }, activities);

test('scripture is a real activity reached after narration and returns to guide sequence', () => {
  let s = createSession(activities);
  s = apply(apply(s, 'PLAY'), 'NARRATION_END');
  assert.equal(currentActivity(s, activities).id, 'read');
  assert.equal(presentStage(s, activities).focal, 'scripture');
  s = apply(apply(s, 'PLAY'), 'NARRATION_END');
  assert.equal(currentActivity(s, activities).id, 'discuss');
  assert.deepEqual(s.completed, ['intro', 'read']);
});

test('required visuals appear immediately and stay through discussion', () => {
  let s = createSession(activities);
  s = apply(apply(s, 'CONTINUE'), 'CONTINUE');
  assert.equal(presentStage(s, activities).focal, 'image');
  s = apply(apply(s, 'PLAY'), 'NARRATION_END');
  assert.equal(s.status, 'waiting');
  assert.equal(s.index, 2);
  assert.equal(presentStage(s, activities).focal, 'image');
  s = apply(s, 'CONTINUE');
  assert.equal(presentStage(s, activities).focal, 'map');
});

test('video introduction does not count as watching video', () => {
  let s = { ...createSession(activities), index: 4 };
  s = apply(apply(s, 'PLAY'), 'NARRATION_END');
  assert.equal(s.index, 4);
  assert.equal(s.status, 'ready');
  assert.deepEqual(s.completed, []);
  s = apply(s, 'MEDIA_END', { activityId: 'watch' });
  assert.equal(s.index, 5);
  assert.deepEqual(s.completed, ['watch']);
});

test('exploration preserves guide position, cannot advance, and returns paused', () => {
  let s = apply(createSession(activities), 'PLAY');
  s = apply(s, 'DETOUR', { assetId: 'map' });
  assert.equal(s.status, 'paused');
  assert.equal(presentStage(s, activities).focal, 'map');
  s = apply(apply(s, 'CONTINUE'), 'NARRATION_END');
  assert.equal(s.index, 0);
  assert.deepEqual(s.completed, []);
  s = apply(s, 'RETURN');
  assert.equal(s.status, 'paused');
  assert.equal(s.detour, null);
  assert.equal(s.index, 0);
});

test('nested detours keep original discussion waiting state', () => {
  let s = { ...createSession(activities), index: 2, status: 'waiting' };
  s = apply(s, 'DETOUR', { assetId: 'map' });
  s = apply(s, 'DETOUR', { assetId: 'scripture' });
  s = apply(s, 'RETURN');
  assert.equal(s.status, 'waiting');
  assert.equal(s.index, 2);
});

test('pinned content survives activity change with maximum two distinct assets', () => {
  let s = { ...createSession(activities), index: 2 };
  s = apply(s, 'PIN');
  assert.equal(presentStage(s, activities).supporting, null);
  s = apply(s, 'CONTINUE');
  assert.deepEqual([presentStage(s, activities).focal, presentStage(s, activities).supporting], ['map', 'image']);
  s = apply(s, 'UNPIN');
  assert.equal(presentStage(s, activities).supporting, null);
});

test('invalid assets, preferences, and modes cannot enter state', () => {
  let s = createSession(activities);
  s = apply(s, 'DETOUR', { assetId: 'javascript:bad' });
  s = apply(s, 'SET_PREFERENCE', { key: '__proto__', value: true });
  s = apply(s, 'SET_MODE', { mode: 'unknown' });
  assert.equal(s.detour, null);
  assert.equal(Object.hasOwn(s.preferences, '__proto__'), false);
  assert.equal(s.mode, 'scripted');
});

test('mode changes preserve progress and preference settings', () => {
  let s = apply(createSession(activities), 'CONTINUE');
  s = apply(s, 'SET_PREFERENCE', { key: 'readScripture', value: false });
  s = apply(s, 'SET_MODE', { mode: 'conversation' });
  assert.equal(s.index, 1);
  assert.equal(s.preferences.readScripture, false);
  assert.deepEqual(s.completed, ['intro']);
});

test('late narration callbacks cannot advance paused or different activity', () => {
  let s = apply(createSession(activities), 'PLAY');
  s = apply(s, 'NARRATION_END', { activityId: 'wrong' });
  assert.equal(s.index, 0);
  s = apply(apply(s, 'PAUSE'), 'NARRATION_END');
  assert.equal(s.index, 0);
});

test('completion is bounded and back reopens final activity', () => {
  let s = { ...createSession(activities), index: 5 };
  s = apply(s, 'CONTINUE');
  assert.equal(s.status, 'complete');
  s = apply(s, 'CONTINUE');
  assert.equal(s.index, 5);
  assert.deepEqual(s.completed, ['return']);
  s = apply(s, 'BACK');
  assert.equal(s.status, 'ready');
  assert.equal(s.index, 5);
});

test('engine is immutable, serializable, and bounds event history', () => {
  const original = createSession(activities);
  let s = apply(original, 'CONTINUE');
  assert.deepEqual(original.completed, []);
  for (let i = 0; i < 100; i++) s = apply(s, 'PAUSE');
  assert.equal(s.events.length, 80);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('empty flow completes safely', () => {
  const s = createSession([]);
  assert.equal(s.status, 'complete');
  assert.equal(currentActivity(s, []), null);
  assert.equal(presentStage(s, []).focal, null);
});

test('typed and button controls generate the same transitions', () => {
  const initial = createSession(activities);
  assert.deepEqual(reduceSession(initial, parseCommand('continue').event, activities), apply(initial, 'CONTINUE'));
  assert.deepEqual(parseCommand('show me the map').event, { type: 'DETOUR', assetId: 'map' });
  assert.deepEqual(parseCommand('always read passages aloud').event, { type: 'SET_PREFERENCE', key: 'readScripture', value: true });
  assert.deepEqual(parseCommand('always describe images').event, { type: 'SET_PREFERENCE', key: 'describeImages', value: true });
  assert.equal(parseCommand('Explain an unrelated theological question').event, null);
});

test('explicit outline navigation preserves completions and clears detours', () => {
  let s = apply(createSession(activities), 'CONTINUE');
  s = apply(s, 'DETOUR', { assetId: 'map' });
  s = apply(s, 'SEEK_ACTIVITY', { activityId: 'watch' });
  assert.equal(s.index, 4);
  assert.equal(s.status, 'ready');
  assert.equal(s.detour, null);
  assert.equal(s.detourReturnStatus, null);
  assert.deepEqual(s.completed, ['intro']);
  assert.ok(s.history.includes('map'));
  assert.equal(apply(s, 'SEEK_ACTIVITY', { activityId: 'missing' }), s);
});

test('next passage request is distinct from an immediate detour', () => {
  assert.deepEqual(parseCommand('read the passage next').event, { type: 'QUEUE_NEXT', assetId: 'scripture' });
});

test('queued asset opens after continue without completing upcoming authored activity', () => {
  let s = apply(createSession(activities), 'QUEUE_NEXT', { assetId: 'map' });
  assert.equal(s.queued, 'map');
  assert.equal(s.detour, null);
  s = apply(s, 'CONTINUE');
  assert.equal(s.index, 1);
  assert.equal(s.detour, 'map');
  assert.equal(s.queued, null);
  assert.deepEqual(s.completed, ['intro']);
  s = apply(s, 'RETURN');
  assert.equal(s.index, 1);
  assert.equal(s.status, 'ready');
  assert.equal(presentStage(s, activities).focal, 'scripture');
});

test('queued asset opens after automatic narration while holding next activity', () => {
  let s = apply(createSession(activities), 'QUEUE_NEXT', { assetId: 'image' });
  s = apply(apply(s, 'PLAY'), 'NARRATION_END');
  assert.equal(s.index, 1);
  assert.equal(s.detour, 'image');
  assert.deepEqual(s.completed, ['intro']);
  s = apply(s, 'RETURN');
  assert.equal(s.status, 'ready');
  assert.equal(s.index, 1);
});

test('queued asset does not silently complete discussion or video', () => {
  for (const [index, expectedStatus] of [[2, 'waiting'], [4, 'ready']]) {
    let s = { ...createSession(activities), index };
    s = apply(s, 'QUEUE_NEXT', { assetId: 'scripture' });
    s = apply(apply(s, 'PLAY'), 'NARRATION_END');
    assert.equal(s.index, index);
    assert.equal(s.detour, 'scripture');
    assert.deepEqual(s.completed, []);
    s = apply(s, 'RETURN');
    assert.equal(s.status, expectedStatus);
  }
});

test('queue survives mode/preferences, invalid assets and exploration', () => {
  let s = apply(createSession(activities), 'QUEUE_NEXT', { assetId: 'image' });
  assert.equal(apply(s, 'QUEUE_NEXT', { assetId: 'missing' }), s);
  s = apply(s, 'SET_MODE', { mode: 'conversation' });
  s = apply(s, 'SET_PREFERENCE', { key: 'readScripture', value: false });
  s = apply(s, 'DETOUR', { assetId: 'map' });
  s = apply(s, 'CONTINUE');
  assert.equal(s.queued, 'image');
  assert.equal(s.index, 0);
  s = apply(s, 'RETURN');
  s = apply(s, 'CONTINUE');
  assert.equal(s.detour, 'image');
  assert.equal(s.mode, 'conversation');
  assert.equal(s.preferences.readScripture, false);
});

test('reading groups keep individual narration beats but skip and back navigate whole pages',()=>{
 const flow=[{id:'before',completion:'auto'},...['intro','one','two'].map(id=>({id,completion:'auto',readingGroupId:'intro'})),{id:'after',completion:'confirm'}];
 let state={...createSession(flow),index:1};
 state=reduceSession(state,{type:'PLAY'},flow);
 state=reduceSession(state,{type:'NARRATION_END',activityId:'intro'},flow);
 assert.equal(flow[state.index].id,'one');
 state=reduceSession(state,{type:'CONTINUE'},flow);
 assert.equal(flow[state.index].id,'after');assert.deepEqual(state.completed,['intro','one','two']);
 state=reduceSession(state,{type:'BACK'},flow);assert.equal(flow[state.index].id,'intro');
 state=reduceSession({...state,index:2},{type:'BACK'},flow);assert.equal(flow[state.index].id,'before');
 state=reduceSession({...state,index:2,queued:'map'},{type:'CONTINUE'},flow);
 assert.equal(flow[state.index].id,'after');assert.equal(state.detour,'map');
 state=reduceSession(state,{type:'BACK'},flow);assert.equal(flow[state.index].id,'after');
});
