import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContext, VIEW_SCHEMA, ACTION_SCHEMA} from '../../packages/views/contracts/host.mjs';
import {createSession, reduceSession} from '../../apps/web/src/lib/engine.js';
import {restoreProgress, saveProgress} from '../../apps/web/src/lib/session-store.js';

const binding = (name, parameters = {}, requires = []) => ({name, parameters, requires});
const view = (overrides = {}) => ({schema: VIEW_SCHEMA, contextId: 'fixture-context', packId: 'fixture-pack',
  packRevision: 'fixture-revision', activityId: 'intro', phaseId: null, clientRevision: 0,
  capabilities: {text: true, audio: true, image: true, video: false, offline: false, persistence: false},
  allowedActions: [binding('play', {}, ['audio']), binding('pause'), binding('continue'), binding('explore', {assetId: 'map'}, ['image'])], ...overrides});
const action = (v, name = 'continue', actionId = 'a1', parameters = {}) => ({schema: ACTION_SCHEMA,
  ...Object.fromEntries(['contextId', 'packId', 'packRevision', 'activityId', 'phaseId', 'clientRevision'].map(key => [key, v[key]])),
  actionId, name, parameters});

test('strict versions, shape, parameter and capability declarations fail closed', () => {
  const v = view(), context = createHostContext(v), a = action(v);
  for (const bad of [{...a, extra: true}, {...a, clientRevision: -1}, {...a, phaseId: ''}, {...a, parameters: {assetId: 'map'}}, {...a, actionId: ''}]) {
    assert.equal(context.accept(bad).code, 'invalid-action');
  }
  assert.equal(context.accept({...a, schema: 'unknown'}).code, 'unsupported-version');
  assert.throws(() => createHostContext({...v, schema: 'unknown'}), /invalid-view/);
  assert.throws(() => createHostContext({...v, capabilities: {...v.capabilities, telepathy: true}}), /invalid-view/);
  assert.throws(() => createHostContext({...v, allowedActions: [binding('play', {}, ['unknown'])]}), /invalid-view/);
  assert.throws(() => createHostContext({...v, allowedActions: [binding('play'), binding('play')]}), /invalid-view/);
  assert.throws(() => createHostContext({...v, allowedActions: Array(1)}), /invalid-view/);
  assert.throws(() => createHostContext({...v, allowedActions: [binding('play', {}, Array(1))]}), /invalid-view/);
  const accessorList = [binding('play')]; Object.defineProperty(accessorList, '0', {get() {throw Error('must not execute');}});
  assert.throws(() => createHostContext({...v, allowedActions: accessorList}), /invalid-view/);
  const accessor = {...a}; Object.defineProperty(accessor, 'name', {get() {throw Error('must not execute');}});
  assert.equal(context.accept(accessor).code, 'invalid-action');
  assert.equal(context.accept({...a, [Symbol('hidden')]: true}).code, 'invalid-action');
  assert.equal(context.accept(a).status, 'accepted');
});

test('exact binding and required media capability constrain explicit play and exploration', () => {
  const v = view(); v.capabilities.audio = false;
  const context = createHostContext(v);
  assert.equal(context.accept(action(v, 'play')).code, 'unsupported-capability');
  assert.equal(context.accept(action(v, 'explore', 'e', {assetId: 'unadvertised'})).code, 'action-not-allowed');
  assert.equal(context.accept(action(v, 'return')).code, 'action-not-allowed');
  assert.equal(context.accept(action(v, 'explore', 'e', {assetId: 'map'})).status, 'accepted');
});

test('every stale identity refuses without an intent', () => {
  const v = view(), context = createHostContext(v);
  for (const key of ['contextId', 'packId', 'packRevision', 'activityId', 'phaseId', 'clientRevision']) {
    const result = context.accept({...action(v), [key]: key === 'clientRevision' ? 1 : 'different'});
    assert.equal(result.code, 'stale-action', key); assert.equal(result.intent, undefined);
  }
});

test('consume before return prevents duplicate or reentrant double advance', () => {
  const v = view(), context = createHostContext(v), first = action(v);
  assert.equal(context.accept(first).nextRevision, 1);
  assert.equal(context.accept(first).status, 'duplicate');
  assert.equal(context.accept({...first, name: 'pause'}).code, 'action-conflict');
  assert.equal(context.accept(action(v, 'continue', 'other')).code, 'stale-action');
  assert.equal(context.accept(action({...v, clientRevision: 1}, 'continue', 'reentrant')).code, 'view-refresh-required');
  assert.equal(context.refresh({...v, clientRevision: 1, activityId: 'next'}).status, 'ready');
  assert.equal(context.accept(first).status, 'duplicate');
  assert.equal(context.accept(action(context.snapshot(), 'continue', 'next')).status, 'accepted');
});

test('failed refresh cannot reset receipts or allow wrong context revision', () => {
  const v = view(), context = createHostContext(v), a = action(v);
  context.accept(a);
  assert.equal(context.refresh(v).code, 'stale-view');
  assert.equal(context.refresh({...v, clientRevision: 1, packRevision: 'other'}).code, 'context-mismatch');
  assert.equal(context.refresh({...v, clientRevision: 1, extra: true}).code, 'invalid-view');
  assert.equal(context.accept(a).status, 'duplicate');
  context.refresh({...v, clientRevision: 1});
  assert.equal(context.refresh({...v, clientRevision: 1}).code, 'stale-view');
  assert.equal(context.refresh({...v, clientRevision: 3}).status, 'ready');
  assert.equal(context.accept(action({...v, clientRevision: 1}, 'continue', 'old')).code, 'stale-action');
});

test('receipt capacity retains replay protection and revision exhaustion refuses', () => {
  const v = view(), context = createHostContext(v, {capacity: 1}), a = action(v);
  context.accept(a); context.refresh({...v, clientRevision: 1});
  assert.equal(context.accept(action(context.snapshot(), 'continue', 'new')).code, 'receipt-capacity');
  assert.equal(context.accept(a).status, 'duplicate');
  const max = view({clientRevision: Number.MAX_SAFE_INTEGER});
  assert.equal(createHostContext(max).accept(action(max)).code, 'revision-exhausted');
  assert.throws(() => createHostContext(v, {capacity: 0}), /invalid-capacity/);
});

test('copies are immutable and dispose invalidates even duplicate actions', () => {
  const v = view(), context = createHostContext(v), a = action(v, 'explore', 'e', {assetId: 'map'});
  v.allowedActions.length = 0; v.capabilities.image = false;
  assert.deepEqual(context.hydrate().intents, []);
  const accepted = context.accept(a); a.parameters.assetId = 'changed';
  assert.equal(accepted.intent.parameters.assetId, 'map');
  assert.throws(() => {accepted.intent.parameters.assetId = 'changed';}, TypeError);
  assert.throws(() => {context.snapshot().capabilities.audio = false;}, TypeError);
  assert.deepEqual(context.dispose(), {status: 'disposed', intent: {name: 'stop', parameters: {}}});
  assert.equal(context.accept(action(view(), 'explore', 'e', {assetId: 'map'})).code, 'disposed-context');
  assert.equal(context.hydrate().code, 'disposed-context');
  assert.equal(context.refresh(view({clientRevision: 1})).code, 'disposed-context');
  assert.equal(context.dispose().code, 'disposed-context');
  const restored = createHostContext(view({contextId: 'new-context'}));
  assert.equal(restored.accept(action(view())).code, 'stale-action');
});

// Synthetic host fixture only: existing production reducer owns journey meaning.
const activities = [
  {id: 'intro', kind: 'guide', completion: 'auto'},
  {id: 'discuss', kind: 'image', assetId: 'image', completion: 'confirm'},
  {id: 'map-step', kind: 'map', assetId: 'map', completion: 'confirm'},
  {id: 'watch', kind: 'video', assetId: 'video', completion: 'media'},
];
function fixture(initial = createSession(activities)) {
  let state = initial, rev = 0, dispatches = 0;
  const project = () => view({activityId: activities[state.index].id, clientRevision: rev,
    allowedActions: state.detour ? [binding('return'), binding('explore', {assetId: 'map'}, ['image'])]
      : [binding('play', {}, ['audio']), binding('pause'), binding('continue'), binding('explore', {assetId: 'map'}, ['image'])]});
  const context = createHostContext(project());
  return {context, get state() {return state;}, get dispatches() {return dispatches;},
    send(a) {
      const result = context.accept(a);
      if (result.status === 'accepted') {
        const names = {play: 'PLAY', pause: 'PAUSE', continue: 'CONTINUE', explore: 'DETOUR', return: 'RETURN'};
        state = reduceSession(state, {type: names[result.intent.name], ...result.intent.parameters}, activities);
        dispatches++; rev = result.nextRevision; assert.equal(context.refresh(project()).status, 'ready');
      }
      return result;
    },
    event(event) {state = reduceSession(state, event, activities); rev++; assert.equal(context.refresh(project()).status, 'ready');},
  };
}

test('fixture: manual play intent with automatic off, confirm holds and one explicit continue', () => {
  const initial = {...createSession(activities), index: 1, preferences: {readScripture: false, describeImages: false, autoplayVideo: false}};
  const f = fixture(initial);
  assert.equal(f.send(action(f.context.snapshot(), 'play', 'play')).intent.name, 'play');
  f.event({type: 'NARRATION_END', activityId: 'discuss'});
  assert.equal(f.state.status, 'waiting'); assert.deepEqual(f.state.completed, []);
  const continueAction = action(f.context.snapshot(), 'continue', 'continue');
  f.send(continueAction); f.send(continueAction);
  assert.equal(f.send({...continueAction, actionId: 'another'}).code, 'stale-action');
  assert.equal(f.state.index, 2); assert.deepEqual(f.state.completed, ['discuss']); assert.equal(f.dispatches, 2);
});

test('fixture: exploration cannot complete held discussion and returns to same waiting state', () => {
  const f = fixture({...createSession(activities), index: 1, status: 'waiting'});
  f.send(action(f.context.snapshot(), 'explore', 'explore', {assetId: 'map'}));
  assert.equal(f.send(action(f.context.snapshot(), 'continue', 'continue')).code, 'action-not-allowed');
  f.send(action(f.context.snapshot(), 'explore', 'nested', {assetId: 'map'}));
  f.send(action(f.context.snapshot(), 'return', 'return'));
  assert.equal(f.state.status, 'waiting'); assert.equal(f.state.index, 1); assert.deepEqual(f.state.completed, []);
});

test('fixture: unchanged reducer distinguishes video narration from media completion and ignores late narration', () => {
  const f = fixture({...createSession(activities), index: 3});
  f.send(action(f.context.snapshot(), 'play', 'play'));
  f.event({type: 'NARRATION_END', activityId: 'wrong'}); assert.equal(f.state.status, 'playing');
  f.event({type: 'NARRATION_END', activityId: 'watch'}); assert.equal(f.state.status, 'ready'); assert.deepEqual(f.state.completed, []);
  f.event({type: 'MEDIA_END', activityId: 'watch'}); assert.deepEqual(f.state.completed, ['watch']);
});

test('fixture: existing host storage restores playing as paused with no emitted playback', () => {
  const data = new Map(), storage = {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value)};
  const pack = {id: 'fixture-pack', revision: 'fixture-revision'};
  saveProgress(storage, pack, activities, {session: {...createSession(activities), index: 1, status: 'playing'}});
  const restored = restoreProgress(storage, pack, activities);
  assert.equal(restored.session.status, 'paused'); assert.equal(restored.session.index, 1);
  const f = fixture(restored.session); assert.deepEqual(f.context.hydrate().intents, []); assert.equal(f.dispatches, 0);
});
