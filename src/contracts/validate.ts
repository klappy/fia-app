// Contract validation (contracts/*.schema.json, draft 2020-12) with ajv and a local registry:
// every cross-$ref resolves to a file in contracts/, never over the network.
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export interface ContractSchema {
  $id: string;
  version: string;
  contract: string;
  examples?: unknown[];
  [k: string]: unknown;
}

export function createValidator(schemas: ContractSchema[]) {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
  addFormats(ajv);
  for (const s of schemas) ajv.addSchema(s as object, s.$id);
  const compiled = new Map<string, ValidateFunction>();
  const get = (id: string): ValidateFunction => {
    let v = compiled.get(id);
    if (!v) {
      v = ajv.getSchema(id) ?? ajv.compile(schemas.find((s) => s.$id === id) as object);
      compiled.set(id, v);
    }
    return v;
  };
  return {
    ajv,
    validate(id: string, instance: unknown): { ok: boolean; errors: ErrorObject[] } {
      const v = get(id);
      const ok = v(instance) as boolean;
      return { ok, errors: ok ? [] : (v.errors ?? []) };
    },
  };
}

export type Validator = ReturnType<typeof createValidator>;
