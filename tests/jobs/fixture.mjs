import {sha256} from '../../server/core/jobs/codec.mjs';
export function request(overrides={}) {
  return {schema:'fia-fixture-preparation@1',source:{identity:'fixture-source',revision:'fixture-v1',textSha256:sha256('Fixture text')},portion:'fixture-portion',language:'fixture-language',passage:'fixture-passage',effectiveText:'Fixture text',effectiveTextSha256:sha256('Fixture text'),transformation:{revision:'identity@1',config:{}},normalization:{revision:'none@1',config:{}},pronunciation:{revision:'none@1',config:{}},generation:{provider:'fixture',voice:'fixture-voice',model:'fixture-model',revision:'1',settings:{}},outputRecipe:{revision:'fixture-json@1',config:{}},cookbookRevision:'254864c8f02e31ac6da422146e16ffed231d9e8d',...overrides};
}
