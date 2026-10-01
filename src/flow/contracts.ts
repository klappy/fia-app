// The flow's contract validator: C-03 catalog, C-04 guide units (+ C-06 they reference),
// C-09 workspace, C-11 completion. Same ajv registry as tests/contracts.test.ts.
import c03 from '../../contracts/c03-catalog-manifest.schema.json';
import c04 from '../../contracts/c04-guide-units.schema.json';
import c06 from '../../contracts/c06-provenance.schema.json';
import c09 from '../../contracts/c09-workspace.schema.json';
import c11 from '../../contracts/c11-completion-record.schema.json';
import { createValidator, type ContractSchema, type Validator } from '../contracts/validate';

export const C03 = c03.$id;
export const C04 = c04.$id;
export const C09 = c09.$id;
export const C11 = c11.$id;

let cached: Validator | undefined;

export function flowValidator(): Validator {
  cached ??= createValidator([c03, c04, c06, c09, c11] as unknown as ContractSchema[]);
  return cached;
}

export function errorText(errors: { instancePath?: string; message?: string }[]): string {
  return errors
    .slice(0, 3)
    .map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim())
    .join('; ');
}
