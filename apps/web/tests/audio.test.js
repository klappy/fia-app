import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioController } from '../src/lib/audio.js';

function setup() {
  const originals = Object.fromEntries(['Audio', 'window', 'document', 'SpeechSynthesisUtterance'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const audio = [], speech = [], states = [], errors = [];
  let ends = 0, videoPauses = 0, speechPauses = 0, speechResumes = 0;
  class FakeAudio {
    constructor(src) { this.src = src; this.paused = true; this.currentTime = 3; this.duration = 40; audio.push(this); }
    play() { if (this.reject) return Promise.reject(Error('blocked')); this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute() { this.src = ''; }
    load() { this.loaded = true; }
  }
  globalThis.Audio = FakeAudio;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  globalThis.document = { querySelectorAll: () => [{ pause() { videoPauses++; } }] };
  globalThis.window = { speechSynthesis: {
    getVoices: () => [], cancel() {}, speak(owner) { speech.push(owner); },
    pause() { speechPauses++; }, resume() { speechResumes++; },
  } };
  const controller = createAudioController(value => states.push(value), () => ends++, value => errors.push(value));
  return { controller, audio, speech, states, errors, get ends() { return ends; }, get videoPauses() { return videoPauses; }, get speechPauses() { return speechPauses; }, get speechResumes() { return speechResumes; },
    restore() { for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } },
  };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const run = (name, fn) => test(name, async () => { const env = setup(); try { await fn(env); } finally { env.restore(); } });

run('stale audio and speech completion after stop cannot advance flow', async e => {
  e.controller.play('hello', '/audio.mp3'); const old = e.audio[0];
  e.controller.stop(); old.onended(); old.onerror(); await tick();
  assert.equal(e.ends, 0); assert.equal(e.controller.active, false); assert.equal(e.controller.playing, false);
  e.controller.play('hello'); const voice = e.speech[0];
  e.controller.stop(); voice.onend(); voice.onstart();
  assert.equal(e.ends, 0); assert.equal(e.controller.playing, false);
});
run('audio pause and resume preserve position; metadata cannot falsely report playing', async e => {
  e.controller.play('hello', '/audio.mp3'); await tick();
  assert.equal(e.controller.playing, true);
  e.controller.pause(); e.audio[0].onloadedmetadata();
  assert.equal(e.controller.playing, false); assert.equal(e.states.at(-1).playing, false);
  assert.equal(e.states.at(-1).elapsed, 3);
  assert.equal(e.controller.resume(), true); await tick(); assert.equal(e.controller.playing, true);
});
run('speech pause/resume works and completed speech cannot be resumed', async e => {
  e.controller.play('hello'); const owner = e.speech[0]; owner.onstart();
  e.controller.pause(); owner.onstart(); assert.equal(e.controller.playing, false);
  assert.equal(e.controller.resume(), true); assert.equal(e.speechResumes, 1);
  owner.onend(); assert.equal(e.ends, 1); assert.equal(e.controller.active, false);
  assert.equal(e.controller.resume(), false); assert.equal(e.controller.playing, false);
});
run('ended audio is released and resume cannot restart stale owner', async e => {
  e.controller.play('hello', '/audio.mp3'); await tick(); e.audio[0].onended();
  assert.equal(e.ends, 1); assert.equal(e.controller.active, false); assert.equal(e.controller.resume(), false);
});
run('audio error falls back to speech and stale audio callbacks are ignored', async e => {
  e.controller.play('hello', '/audio.mp3'); const old = e.audio[0]; old.onerror(); await tick();
  assert.equal(e.speech.length, 1); assert.equal(e.speech[0].text, 'hello');
  old.onended(); old.onloadedmetadata(); assert.equal(e.ends, 0);
  e.speech[0].onstart(); assert.equal(e.controller.playing, true);
  e.speech[0].onend(); assert.equal(e.ends, 1);
});
run('starting or resuming narration pauses competing video', async e => {
  e.controller.play('hello', '/audio.mp3'); await tick();
  assert.equal(e.videoPauses, 1); e.controller.pause(); e.controller.resume(); await tick();
  assert.equal(e.videoPauses, 2);
});
run('rejected playback and rejected resume clear active and playing state', async e => {
  Audio.prototype.play = function () { return Promise.reject(Error('blocked')); };
  e.controller.play('hello', '/audio.mp3'); await tick();
  assert.equal(e.controller.active, false); assert.equal(e.controller.playing, false); assert.equal(e.errors.length, 1);
  Audio.prototype.play = function () { this.paused = false; return Promise.resolve(); };
  e.controller.play('hello', '/audio.mp3'); await tick(); e.controller.pause();
  e.audio.at(-1).reject = true;
  e.audio.at(-1).play = () => Promise.reject(Error('blocked'));
  e.controller.resume(); await tick();
  assert.equal(e.controller.active, false); assert.equal(e.controller.playing, false); assert.equal(e.errors.length, 2);
});
run('speech errors and unavailable speech leave no falsely active owner', async e => {
  e.controller.play('hello'); e.speech[0].onstart(); e.speech[0].onerror({ error: 'network' });
  assert.equal(e.controller.active, false); assert.equal(e.controller.playing, false); assert.equal(e.errors.length, 1);
  delete window.speechSynthesis; e.controller.play('hello');
  assert.equal(e.controller.active, false); assert.equal(e.controller.playing, false); assert.equal(e.errors.length, 2);
});
run('pause while play promise pending cannot be undone by its resolution', async e => {
  let resolve;
  Audio.prototype.play = function () { this.paused = false; return new Promise(done => { resolve = done; }); };
  e.controller.play('hello', '/audio.mp3'); e.controller.pause(); resolve(); await tick();
  assert.equal(e.controller.playing, false); assert.equal(e.states.at(-1).playing, false);
});
run('source-only mode reports unavailable recording without inventing browser speech',async e=>{
 const sourceOnly=createAudioController(()=>{},()=>{},text=>e.errors.push(text),{allowSpeechFallback:false});
 sourceOnly.play('authored source','/missing.mp3');e.audio.at(-1).onerror();await tick();
 assert.equal(e.speech.length,0);assert.match(e.errors.at(-1),/source recording is unavailable/);assert.equal(sourceOnly.active,false);
});
run('playback state identifies the exact source during updates, pause and owner changes',async e=>{
 e.controller.play('first','/first.mp3');await tick();e.audio[0].currentTime=19;e.audio[0].ontimeupdate();assert.equal(e.states.at(-1).src,'/first.mp3');assert.equal(e.states.at(-1).elapsed,19);
 e.controller.pause();assert.equal(e.states.at(-1).src,'/first.mp3');assert.equal(e.states.at(-1).playing,false);
 e.controller.play('second','/second.mp3');await tick();e.audio[0].ontimeupdate();assert.equal(e.states.at(-1).src,'/second.mp3');e.controller.stop();assert.equal(e.states.at(-1).src,null);
});
