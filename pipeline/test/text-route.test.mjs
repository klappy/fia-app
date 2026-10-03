// BL4c text route: runs with no key and no network (mocked client). Gate: one test call returns {text, model}.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { textRoute, hasKey, costUsd, TEXT_MODEL, KEY_ENV, RATE_USD_PER_1K, TextRouteError } from '../src/text-route.mjs';

function mockClient(reply) {
  const calls = [];
  return {
    calls,
    messages: {
      async create(params) {
        calls.push(params);
        return { model: TEXT_MODEL, stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 100 }, ...reply };
      },
    },
  };
}

test('one call returns {text, model} on the pinned model', async () => {
  const client = mockClient({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"subtitle":"Jesus is baptized"}' }] });
  const out = await textRoute({ system: 'SYS', prompt: 'USER', client });
  assert.equal(out.text, '{"subtitle":"Jesus is baptized"}');
  assert.equal(out.model, TEXT_MODEL);
  assert.equal(client.calls.length, 1);
  const p = client.calls[0];
  assert.equal(p.model, TEXT_MODEL);
  assert.equal(p.system, 'SYS');
  assert.deepEqual(p.messages, [{ role: 'user', content: 'USER' }]);
  assert.equal(p.output_config.effort, 'medium');
  assert.equal('temperature' in p, false, 'pinned model rejects sampling params');
});

test('cost uses the per-1K rate written in the PR', () => {
  assert.deepEqual({ ...RATE_USD_PER_1K }, { input: 0.004, output: 0.02 });
  assert.equal(costUsd({ input_tokens: 1000, output_tokens: 100 }).toFixed(4), '0.0060');
});

test('no key: named error, value never echoed', async () => {
  assert.equal(hasKey({}), false);
  assert.equal(hasKey({ [KEY_ENV]: '' }), false);
  await assert.rejects(textRoute({ prompt: 'x', env: {} }), (e) => e instanceof TextRouteError && e.code === 'no-key');
});

test('refusal and max_tokens raise instead of returning partial text', async () => {
  const refused = mockClient({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] });
  await assert.rejects(textRoute({ prompt: 'x', client: refused }), (e) => e.code === 'refusal');
  const cut = mockClient({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"sub' }] });
  await assert.rejects(textRoute({ prompt: 'x', client: cut }), (e) => e.code === 'max-tokens');
});

test('secret slot: workflow references the secret by name only', () => {
  const wf = readFileSync(new URL('../../.github/workflows/text-route-smoke.yml', import.meta.url), 'utf8');
  assert.match(wf, /\$\{\{ secrets\.ANTHROPIC_API_KEY \}\}/);
  assert.doesNotMatch(wf, /sk-ant-/);
  assert.doesNotMatch(readFileSync(new URL('../src/text-route.mjs', import.meta.url), 'utf8'), /sk-ant-/);
});
