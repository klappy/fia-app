import {fields,bounded} from '../jobs/codec.mjs';
export function authorize(operator, capability) {
  bounded(operator,'operator');
  fields(capability,['operator','permission','mode','monetaryCap','externalCalls','attemptsPerJob']);
  if (capability.operator !== operator || capability.permission !== 'prepare-fixture' || capability.mode !== 'fixture-only' || capability.monetaryCap !== '0' || capability.externalCalls !== '0' || capability.attemptsPerJob !== '1') throw Error('fixture-capability-refused');
}
export const localFixtureCapability = operator => ({operator, permission:'prepare-fixture',mode:'fixture-only',monetaryCap:'0',externalCalls:'0',attemptsPerJob:'1'});
