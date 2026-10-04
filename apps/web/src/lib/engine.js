/** Pure, serializable session engine. Activities are supplied by the content layer.
 * Transition events never mutate the incoming session or activities.
 * CONTINUE is an explicit user decision to finish/skip the current activity.
 */
const preferences = { readScripture: true, describeImages: false, autoplayVideo: false };
const MODES = new Set(['scripted', 'conversation']);
const PREF_KEYS = new Set(Object.keys(preferences));
const EVENT_LIMIT = 80;

export function createSession(activities = []) {
  return {
    index: 0, status: activities.length ? 'ready' : 'complete', completed: [],
    mode: 'scripted', preferences: { ...preferences }, detour: null,
    detourReturnStatus: null, queued: null, pinned: null, history: [], events: [],
  };
}

export function currentActivity(state, activities = []) {
  return activities[state.index] ?? null;
}

/** A stage has at most one focal asset and one distinct pinned supporting asset. */
export function presentStage(state, activities = []) {
  const activity = currentActivity(state, activities);
  const focal = state.detour || activity?.assetId || null;
  return {
    focal,
    supporting: state.pinned && state.pinned !== focal ? state.pinned : null,
    activity,
    detour: Boolean(state.detour),
  };
}

function recordHistory(state, activities) {
  const assetId = state.detour || currentActivity(state, activities)?.assetId;
  if (!assetId) return;
  state.history = [...state.history.filter(id => id !== assetId), assetId].slice(-12);
}

function advance(state, activities) {
  const activity = currentActivity(state, activities);
  if (!activity || state.status === 'complete') return;
  recordHistory(state, activities);
  if (!state.completed.includes(activity.id)) state.completed.push(activity.id);
  if (state.index + 1 < activities.length) {
    state.index += 1;
    state.status = 'ready';
  } else {
    state.status = 'complete';
  }
}

function openQueued(state, activities) {
  if (!state.queued || state.detour) return;
  recordHistory(state, activities);
  state.detourReturnStatus = state.status === 'playing' ? 'paused' : state.status;
  state.detour = state.queued;
  state.queued = null;
  if (state.status === 'playing') state.status = 'paused';
}

/** Supported events: START/PLAY/PAUSE, NARRATION_END/MEDIA_END, CONTINUE/BACK,
 * DETOUR {assetId}, RETURN, PIN {assetId?}, UNPIN, SET_MODE {mode},
 * SET_PREFERENCE {key,value}, SEEK_ACTIVITY {activityId}, QUEUE_NEXT {assetId}, RESET.
 * QUEUE_NEXT opens one asset at the next narration/media completion or explicit
 * continuation. It never completes an upcoming authored activity. Discussion
 * remains waiting until explicitly continued; RETURN restores that held state.
 * SEEK_ACTIVITY is explicit prototype outline navigation, not implicit completion.
 * Unknown/invalid requests are no-ops.
 * Asset requests are restricted to assets referenced in the authored activities.
 */
export function reduceSession(previous, event, activities = []) {
  if (!event || typeof event.type !== 'string') return previous;
  if (event.type === 'RESET') return createSession(activities);
  if (event.type === 'SEEK_ACTIVITY' && !activities.some(a => a.id === event.activityId)) return previous;
  if (event.type === 'QUEUE_NEXT' && !activities.some(a => a.assetId === event.assetId || a.availableAssetIds?.includes(event.assetId))) return previous;
  const state = {
    ...previous, preferences: { ...previous.preferences },
    completed: [...previous.completed], history: [...previous.history],
    events: [...previous.events],
  };
  const activity = currentActivity(state, activities);
  const validAsset = assetId => typeof assetId === 'string' && activities.some(a => a.assetId === assetId || a.availableAssetIds?.includes(assetId));
  switch (event.type) {
    case 'QUEUE_NEXT':
      state.queued = event.assetId;
      break;
    case 'SEEK_ACTIVITY':
      recordHistory(state, activities);
      state.index = activities.findIndex(a => a.id === event.activityId);
      state.status = 'ready';
      state.detour = null;
      state.detourReturnStatus = null;
      break;
    case 'START':
    case 'PLAY':
      if (activity && state.status !== 'complete' && !state.detour) state.status = 'playing';
      break;
    case 'PAUSE':
      if (state.status === 'playing') state.status = 'paused';
      break;
    case 'NARRATION_END':
      // A late browser callback must not advance after pause, detour, or navigation.
      if (!activity || state.detour || state.status !== 'playing') break;
      if (event.activityId && event.activityId !== activity.id) break;
      if (activity.completion === 'auto') advance(state, activities);
      else state.status = activity.completion === 'media' ? 'ready' : 'waiting';
      openQueued(state, activities);
      break;
    case 'MEDIA_END':
      if (!activity || state.detour || activity.completion !== 'media' || state.status === 'complete') break;
      if (event.activityId && event.activityId !== activity.id) break;
      advance(state, activities);
      openQueued(state, activities);
      break;
    case 'CONTINUE':
      // Exploration must be closed deliberately before advancing the guide.
      if (!state.detour) {
        const group=activity?.readingGroupId;
        do { advance(state, activities); }
        while(group && state.status!=='complete' && currentActivity(state,activities)?.readingGroupId===group);
        openQueued(state, activities);
      }
      break;
    case 'BACK':
      if (state.detour) {
        recordHistory(state, activities);
        state.detour = null;
        state.status = state.detourReturnStatus || 'ready';
        state.detourReturnStatus = null;
      } else if (state.status === 'complete' && activity) {
        state.status = 'ready';
      } else if (state.index > 0) {
        recordHistory(state, activities);
        const group=activity?.readingGroupId;
        while(group && state.index>0 && activities[state.index-1].readingGroupId===group)state.index--;
        if(state.index>0)state.index--;
        const previousGroup=activities[state.index]?.readingGroupId;
        while(previousGroup && state.index>0 && activities[state.index-1].readingGroupId===previousGroup)state.index--;
        state.status = 'ready';
      }
      break;
    case 'DETOUR':
      if (!validAsset(event.assetId)) break;
      recordHistory(state, activities);
      if (!state.detour) state.detourReturnStatus = state.status === 'playing' ? 'paused' : state.status;
      state.detour = event.assetId;
      if (state.status === 'playing') state.status = 'paused';
      break;
    case 'RETURN':
      if (!state.detour) break;
      recordHistory(state, activities);
      state.detour = null;
      state.status = state.detourReturnStatus || 'ready';
      state.detourReturnStatus = null;
      break;
    case 'PIN': {
      const assetId = event.assetId || state.detour || activity?.assetId;
      if (validAsset(assetId)) state.pinned = assetId;
      break;
    }
    case 'UNPIN': state.pinned = null; break;
    case 'SET_MODE': if (MODES.has(event.mode)) state.mode = event.mode; break;
    case 'SET_PREFERENCE':
      if (PREF_KEYS.has(event.key) && typeof event.value === 'boolean') state.preferences[event.key] = event.value;
      break;
    default: return previous;
  }
  state.events = [...state.events, { type: event.type, activityId: activity?.id || null }].slice(-EVENT_LIMIT);
  return state;
}
