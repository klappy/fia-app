// BL4c text route: the one server-side LLM call path for the pipeline (later the API server's core).
// Ticket: cookbook work/active/2026-10-02-fia-pericope-subtitles/TICKET.md § 8 BL4c; § 3/§ 4 "one pinned model id".
//
// Rules this module keeps:
// - The key comes from the host/CI environment only (ANTHROPIC_API_KEY). It is never logged,
//   never written to a record, never read from a file or a CLI profile.
// - One pinned model id. Every answer carries the model that actually served it, so a caller
//   (BL4d) can refuse any answer whose model is not TEXT_MODEL.
// - Runtime-neutral: pass `env` (a Worker's env object) or let it default to process.env.
import Anthropic from '@anthropic-ai/sdk';

/** The pinned model id. Changing it changes every subtitle key (TICKET.md § 5 "Model change"). */
export const TEXT_MODEL = 'claude-opus-5-5';

/** Name of the host/CI secret. The value is set by the captain/Otto, never in git. */
export const KEY_ENV = 'ANTHROPIC_API_KEY';

/**
 * Rate in USD per 1K tokens for TEXT_MODEL (Anthropic first-party API, standard tier).
 * $4.00 / MTok input, $20.00 / MTok output. Source: https://platform.claude.com/docs/en/about-claude/pricing
 */
export const RATE_USD_PER_1K = Object.freeze({ input: 0.004, output: 0.02 });

export class TextRouteError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'TextRouteError';
    this.code = code;
    Object.assign(this, extra);
  }
}

/** True when the secret slot is filled. Never returns or prints the value. */
export function hasKey(env = process.env) {
  return typeof env?.[KEY_ENV] === 'string' && env[KEY_ENV].length > 0;
}

/** USD cost of one call's usage at RATE_USD_PER_1K (input + output; thinking bills as output). */
export function costUsd(usage) {
  const input = usage?.input_tokens ?? 0;
  const output = usage?.output_tokens ?? 0;
  return (input / 1000) * RATE_USD_PER_1K.input + (output / 1000) * RATE_USD_PER_1K.output;
}

function makeClient(env) {
  if (!hasKey(env)) {
    throw new TextRouteError('no-key', `${KEY_ENV} is not set (host/CI secret; captain/Otto sets it)`);
  }
  // Explicit apiKey so the SDK never falls back to a local CLI profile: env secret only.
  return new Anthropic({ apiKey: env[KEY_ENV] });
}

/**
 * One text call on the pinned model.
 * @param {object} o
 * @param {string} o.prompt   user message text
 * @param {string} [o.system] system prompt (e.g. prompts/subtitle-v1.txt body)
 * @param {number} [o.maxTokens] cap on output (thinking counts toward it)
 * @param {'low'|'medium'|'high'|'xhigh'|'max'} [o.effort] set explicitly; this model's default is medium
 * @param {object} [o.env]    where the key lives (Worker env or process.env)
 * @param {object} [o.client] injected client (tests); skips the key read
 * @returns {Promise<{text: string, model: string, usage: object, costUsd: number, stopReason: string}>}
 */
export async function textRoute({ prompt, system, maxTokens = 8000, effort = 'medium', env = process.env, client } = {}) {
  if (typeof prompt !== 'string' || !prompt) throw new TextRouteError('bad-input', 'prompt is required');
  const c = client ?? makeClient(env);
  // No temperature: claude-opus-5-5 rejects sampling parameters (400). Determinism comes from the
  // content-keyed cache (TICKET.md § 5): a key with any prior attempt is never re-called.
  const params = {
    model: TEXT_MODEL,
    max_tokens: maxTokens,
    output_config: { effort },
    messages: [{ role: 'user', content: prompt }],
  };
  if (system) params.system = system;
  const res = await c.messages.create(params);
  if (res.stop_reason === 'refusal') {
    throw new TextRouteError('refusal', `model declined (${res.stop_details?.category ?? 'no category'})`, {
      model: res.model,
      usage: res.usage,
    });
  }
  if (res.stop_reason === 'max_tokens') {
    throw new TextRouteError('max-tokens', `output hit max_tokens=${maxTokens}`, { model: res.model, usage: res.usage });
  }
  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return { text, model: res.model, usage: res.usage, costUsd: costUsd(res.usage), stopReason: res.stop_reason };
}
