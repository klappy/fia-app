// Types for the generated ajv standalone validator (scripts/build-worker-validators.mjs).
export interface StandaloneError {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message?: string;
}
export interface StandaloneValidate {
  (data: unknown): boolean;
  errors?: StandaloneError[] | null;
}
export const validateV1: StandaloneValidate;
