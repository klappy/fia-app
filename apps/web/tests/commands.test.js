import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../src/lib/commands.js';

test('negated immediate content commands cannot open the content', () => {
  for (const text of ["don't read passage", "don't show map", 'do not show the map', 'don’t read the passage', 'please do not open the video', 'show no image', 'avoid showing the map', "don't show map but show image"]) {
    assert.equal(parseCommand(text).event, null, text);
  }
});

test('supported negative preferences still disable the correct behavior', () => {
  for (const text of ["don't always read passages", 'do not automatically read Scripture', 'never read passages', 'don’t always read passages']) {
    assert.deepEqual(parseCommand(text).event, { type: 'SET_PREFERENCE', key: 'readScripture', value: false }, text);
  }
  for (const text of ["don't always describe images", 'never describe images', 'do not automatically describe images']) {
    assert.deepEqual(parseCommand(text).event, { type: 'SET_PREFERENCE', key: 'describeImages', value: false }, text);
  }
  for (const text of ["don't autoplay videos", 'do not automatically play videos', 'turn autoplay videos off']) {
    assert.deepEqual(parseCommand(text).event, { type: 'SET_PREFERENCE', key: 'autoplayVideo', value: false }, text);
  }
});

test('positive commands remain supported and play response does not claim success', () => {
  assert.deepEqual(parseCommand('show the map').event, { type: 'DETOUR', assetId: 'map' });
  assert.deepEqual(parseCommand('always read passages').event, { type: 'SET_PREFERENCE', key: 'readScripture', value: true });
  for (const text of ['play', 'resume']) {
    assert.deepEqual(parseCommand(text).event, { type: 'PLAY' });
    assert.match(parseCommand(text).response, /requested/);
  }
  assert.deepEqual(parseCommand('stop').event, { type: 'PAUSE' });
});
