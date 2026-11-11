// Transport-neutral intent validation. No reducer, media, storage or network access.
export const VIEW_SCHEMA = 'fia.host-view@1';
export const ACTION_SCHEMA = 'fia.host-action@1';
const CAPABILITIES = ['text', 'audio', 'image', 'video', 'offline', 'persistence'];
const NAMES = ['play', 'pause', 'continue', 'explore', 'return'];
const IDENTITY = ['contextId', 'packId', 'packRevision', 'activityId', 'phaseId', 'clientRevision'];
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value;
const revision = value => Number.isSafeInteger(value) && value >= 0;
function fields(value, names) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Object.keys(descriptors).length === names.length && names.every(name =>
    Object.hasOwn(descriptors, name) && Object.hasOwn(descriptors[name], 'value') && descriptors[name].enumerable);
}
function identity(value) {
  return IDENTITY.filter(key => !['phaseId', 'clientRevision'].includes(key)).every(key => id(value[key])) &&
    (value.phaseId === null || id(value.phaseId)) && revision(value.clientRevision);
}
function parameters(name, value) {
  return name === 'explore' ? fields(value, ['assetId']) && id(value.assetId) : fields(value, []);
}
function list(value, max) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max || Object.getOwnPropertySymbols(value).length) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Object.keys(descriptors).length === value.length + 1 && Array.from({length: value.length}, (_, index) => index).every(index =>
    Object.hasOwn(descriptors, index) && Object.hasOwn(descriptors[index], 'value') && descriptors[index].enumerable);
}
function validView(value) {
  if (!fields(value, ['schema', ...IDENTITY, 'capabilities', 'allowedActions']) || value.schema !== VIEW_SCHEMA || !identity(value)) return false;
  if (!fields(value.capabilities, CAPABILITIES) || !CAPABILITIES.every(key => typeof value.capabilities[key] === 'boolean')) return false;
  if (!list(value.allowedActions, 64)) return false;
  const bindings = new Set();
  return value.allowedActions.every(action => {
    if (!fields(action, ['name', 'parameters', 'requires']) || !NAMES.includes(action.name) || !parameters(action.name, action.parameters) ||
        !list(action.requires, CAPABILITIES.length) ||
        !action.requires.every(capability => CAPABILITIES.includes(capability)) || new Set(action.requires).size !== action.requires.length) return false;
    const binding = JSON.stringify([action.name, action.parameters.assetId ?? null]);
    if (bindings.has(binding)) return false;
    bindings.add(binding);
    return true;
  });
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const copy = value => freeze(structuredClone(value));
const refused = code => copy({status: 'refused', code});
function fingerprint(action) {
  return JSON.stringify([...IDENTITY.map(key => action[key]), action.name, action.parameters.assetId ?? null]);
}

/** A single live context; caller serializes accepted intent application and refresh.
 * Successful validation consumes a revision before returning an intent. Until
 * refresh(view), no second new action can run, including a reentrant callback.
 */
export function createHostContext(initialView, {capacity = 256} = {}) {
  if (!validView(initialView)) throw new TypeError('invalid-view');
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 4096) throw new TypeError('invalid-capacity');
  let view = copy(initialView), currentRevision = view.clientRevision, pending = false, disposed = false;
  const receipts = new Map();
  return Object.freeze({
    snapshot() { return view; },
    hydrate() {
      return disposed ? refused('disposed-context') : copy({status: 'ready', view, intents: []});
    },
    accept(action) {
      if (disposed) return refused('disposed-context');
      if (!fields(action, ['schema', ...IDENTITY, 'actionId', 'name', 'parameters'])) return refused('invalid-action');
      if (action.schema !== ACTION_SCHEMA) return refused('unsupported-version');
      if (!identity(action) || !id(action.actionId) || !NAMES.includes(action.name) || !parameters(action.name, action.parameters)) return refused('invalid-action');
      const payload = fingerprint(action), prior = receipts.get(action.actionId);
      if (prior) return prior.payload === payload
        ? copy({status: 'duplicate', actionId: action.actionId, consumedRevision: prior.consumedRevision, nextRevision: prior.nextRevision})
        : refused('action-conflict');
      if (IDENTITY.some(key => action[key] !== (key === 'clientRevision' ? currentRevision : view[key]))) return refused('stale-action');
      if (pending) return refused('view-refresh-required');
      const binding = view.allowedActions.find(candidate => candidate.name === action.name &&
        candidate.parameters.assetId === action.parameters.assetId);
      if (!binding) return refused('action-not-allowed');
      if (binding.requires.some(capability => !view.capabilities[capability])) return refused('unsupported-capability');
      if (receipts.size >= capacity) return refused('receipt-capacity');
      if (currentRevision === Number.MAX_SAFE_INTEGER) return refused('revision-exhausted');
      const consumedRevision = currentRevision;
      currentRevision++;
      pending = true;
      receipts.set(action.actionId, {payload, consumedRevision, nextRevision: currentRevision});
      return copy({status: 'accepted', actionId: action.actionId, consumedRevision, nextRevision: currentRevision,
        intent: {name: action.name, parameters: action.parameters}});
    },
    // Host-derived next view, after applying an accepted intent. External host
    // changes must advance the revision, invalidating prior outstanding actions.
    refresh(nextView) {
      if (disposed) return refused('disposed-context');
      if (!validView(nextView)) return refused('invalid-view');
      if (['contextId', 'packId', 'packRevision'].some(key => nextView[key] !== view[key])) return refused('context-mismatch');
      if (pending ? nextView.clientRevision !== currentRevision : nextView.clientRevision <= currentRevision) return refused('stale-view');
      view = copy(nextView);
      currentRevision = view.clientRevision;
      pending = false;
      return copy({status: 'ready', view, intents: []});
    },
    dispose() {
      if (disposed) return refused('disposed-context');
      disposed = true;
      return copy({status: 'disposed', intent: {name: 'stop', parameters: {}}});
    },
  });
}
