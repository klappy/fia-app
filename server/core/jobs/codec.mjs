import {createHash} from 'node:crypto';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function canonical(value, seen = new Set()) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    if (value.isWellFormed() === false) throw Error('invalid-unicode');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object' || seen.has(value)) throw Error('unsupported-canonical-value');
  const array = Array.isArray(value);
  if (!array && Object.getPrototypeOf(value) !== Object.prototype) throw Error('unsupported-object');
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string')) throw Error('symbol-key');
  for (const key of keys) {
    if (array && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !('value' in descriptor)) throw Error('unsupported-property');
  }
  seen.add(value);
  try {
    if (array) {
      if (keys.length !== value.length + 1 || Array.from({length:value.length}, (_,i)=>String(i)).some(key=>!Object.hasOwn(value,key))) throw Error('sparse-or-extended-array');
      return `[${value.map(item => canonical(item, seen)).join(',')}]`;
    }
    return `{${keys.sort().map(key => `${canonical(key, seen)}:${canonical(value[key], seen)}`).join(',')}}`;
  } finally { seen.delete(value); }
}
export function fields(value, names) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== names.length || names.some(key=>!Object.hasOwn(value,key))) throw Error('invalid-fields');
  canonical(value);
}
export function bounded(value, name = 'identity') {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256 || !value.isWellFormed()) throw Error(`invalid-${name}`);
  return value;
}
export function requestBinding(request) {
  fields(request, ['schema','source','portion','language','passage','effectiveText','effectiveTextSha256','transformation','normalization','pronunciation','generation','outputRecipe','cookbookRevision']);
  if (request.schema !== 'fia-fixture-preparation@1') throw Error('unsupported-request');
  fields(request.source, ['identity','revision','textSha256']);
  for (const key of ['identity','revision']) bounded(request.source[key]);
  for (const hash of [request.source.textSha256,request.effectiveTextSha256]) if (!/^[a-f0-9]{64}$/.test(hash)) throw Error('invalid-hash');
  for (const key of ['portion','language','passage','cookbookRevision']) bounded(request[key]);
  if (typeof request.effectiveText !== 'string' || request.effectiveText.length > 100000 || sha256(request.effectiveText) !== request.effectiveTextSha256) throw Error('text-hash-mismatch');
  for (const key of ['transformation','normalization','pronunciation','outputRecipe']) {
    fields(request[key], ['revision','config']); bounded(request[key].revision);
    if (!request[key].config || Object.getPrototypeOf(request[key].config)!==Object.prototype) throw Error('invalid-config');
  }
  fields(request.generation,['provider','voice','model','revision','settings']);
  for (const key of ['provider','voice','model','revision']) bounded(request.generation[key]);
  if (request.generation.provider !== 'fixture' || !request.generation.settings || Object.getPrototypeOf(request.generation.settings)!==Object.prototype) throw Error('fixture-only');
  if (request.cookbookRevision !== '254864c8f02e31ac6da422146e16ffed231d9e8d') throw Error('unaccepted-recipe');
  return {buildKey:sha256(canonical(request)), generationConfigSha256:sha256(canonical(request.generation))};
}
