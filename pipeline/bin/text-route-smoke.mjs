#!/usr/bin/env node
// BL4c live smoke: one short call on the pinned model; prints {model, stopReason, tokens, costUsd}, never the key.
// Needs ANTHROPIC_API_KEY in the environment (host/CI secret). Exits 0 with a notice when the slot is empty.
import { textRoute, hasKey, KEY_ENV, TEXT_MODEL } from '../src/text-route.mjs';

if (!hasKey()) {
  console.log(`::notice::${KEY_ENV} not set; skipping live call (captain/Otto sets secret ${KEY_ENV})`);
  process.exit(0);
}
const out = await textRoute({ prompt: 'Reply with exactly: OK', maxTokens: 2000, effort: 'low' });
console.log(JSON.stringify({ model: out.model, text: out.text.trim(), stopReason: out.stopReason, usage: out.usage, costUsd: out.costUsd }));
if (out.model !== TEXT_MODEL) {
  console.error(`served by ${out.model}, pinned ${TEXT_MODEL}`);
  process.exit(1);
}
