// Lane L5 contract validator: C-03, C-06 (referenced by C-03), C-10, C-13, C-16 from contracts/,
// bundled locally (no network $ref). Code MUST validate what it persists or renders.
import { createValidator, type ContractSchema } from '../contracts/validate';
import c03 from '../../contracts/c03-catalog-manifest.schema.json';
import c06 from '../../contracts/c06-provenance.schema.json';
import c10 from '../../contracts/c10-settings.schema.json';
import c13 from '../../contracts/c13-rights-record.schema.json';
import c16 from '../../contracts/c16-feedback.schema.json';

export const C03 = c03.$id;
export const C10 = c10.$id;
export const C13 = c13.$id;
export const C16 = c16.$id;

let validator: ReturnType<typeof createValidator> | undefined;

/** Lazily built so importing a screen never compiles schemas it does not use. */
export function contracts() {
  validator ??= createValidator([c06, c03, c10, c13, c16] as unknown as ContractSchema[]);
  return validator;
}

export function errorsText(errors: { instancePath?: string; message?: string }[]): string[] {
  return errors.map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`);
}
