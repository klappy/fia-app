import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createValidator, type ContractSchema } from '../src/contracts/validate';

// contracts/README.md § Testing — `contracts.schema.test`: every file parses as draft 2020-12,
// has $id, version, contract, examples[0], and examples[0] validates against its own schema.
const dir = join(process.cwd(), 'contracts');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.schema.json'))
  .sort();
const schemas = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as ContractSchema);
const validator = createValidator(schemas);

describe('contracts', () => {
  it('has all 18 schemas', () => {
    expect(files).toHaveLength(18);
  });
  for (const [i, s] of schemas.entries()) {
    it(`${files[i]}: shape, then examples[0] validates`, () => {
      expect(s.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(s.$id).toMatch(
        /^https:\/\/fia\.klappy\.dev\/contracts\/c\d{2}-[a-z-]+\.schema\.json$/,
      );
      expect(s.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(s.contract).toMatch(/^c\d{2}$/);
      expect(Array.isArray(s.examples) && s.examples.length > 0).toBe(true);
      for (const ex of s.examples!) {
        const r = validator.validate(s.$id, ex);
        expect(r.errors, JSON.stringify(r.errors, null, 2)).toEqual([]);
        expect(r.ok).toBe(true);
      }
    });
  }
  it('rejects an instance that breaks a pattern', () => {
    const r = validator.validate('https://fia.klappy.dev/contracts/c10-settings.schema.json', {
      schemaVersion: 'nope',
    });
    expect(r.ok).toBe(false);
  });
});
