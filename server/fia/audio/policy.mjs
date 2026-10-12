import {fields,bounded,sha256,canonical} from '../../core/jobs/codec.mjs';
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

export const fixtureBytes = request => Buffer.from(canonical({schema:'fia-audio-fixture@1',evidenceClass:'synthetic-fixture',request}));
export const fixtureProvider = async request => ({kind:'output',bytes:fixtureBytes(request)});
export const audioPolicy = {
  id:'fia-audio-fixture-policy@1',
  validateRequest(request) { const {generationConfigSha256}=requestBinding(request);return {generationConfigSha256}; },
  validateOutput(request,bytes,descriptor) {
    return Buffer.isBuffer(bytes) && fixtureBytes(request).equals(bytes) && descriptor?.mime==='application/vnd.fia.fixture+json' && descriptor?.evidenceClass==='synthetic-fixture';
  },
  outputMetadata: {mime:'application/vnd.fia.fixture+json',evidenceClass:'synthetic-fixture'},
  provider:fixtureProvider
};
