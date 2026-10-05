import {load, save} from './storage.js';

const audio = document.getElementById('audio');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const events = [];
const log = (type, detail = {}) => {
  const e = {t: Math.round(performance.now()), type, ...detail};
  events.push(e);
  logEl.textContent += JSON.stringify(e) + '\n';
};

const sample = await (await fetch('./sample.json')).json();
const restored = load(localStorage, sample.sha256);
let record = restored.record;
log('storage', {status: restored.status, position: record.position});
statusEl.textContent = `Storage: ${restored.status}`;

// No save may run until the restore has finished, or an early background
// would write 0 over the stored position.
let restoredReady = false;
audio.src = sample.url;
audio.addEventListener('loadedmetadata', () => {
  if (record.position > 0 && record.position < audio.duration) audio.currentTime = record.position;
  restoredReady = true;
  log('loadedmetadata', {duration: audio.duration, restoredTo: audio.currentTime});
}, {once: true});
for (const type of ['play', 'pause', 'seeked', 'ended', 'error']) audio.addEventListener(type, () => log(type, {at: audio.currentTime}));

const persist = reason => {
  if (!restoredReady) return log('save-skipped', {reason});
  record = {...record, position: audio.currentTime, savedAt: new Date().toISOString()};
  log('save', {reason, ok: save(localStorage, record), position: record.position});
};
document.getElementById('play').onclick = () => audio.play().catch(err => log('play-refused', {name: err.name}));
document.getElementById('pause').onclick = () => audio.pause();
document.getElementById('seek').onclick = () => { audio.currentTime = Math.min((audio.duration || 0), audio.currentTime + 5); };
document.getElementById('save').onclick = () => persist('manual');
audio.addEventListener('pause', () => persist('pause'));
document.addEventListener('visibilitychange', () => { log('visibility', {state: document.visibilityState}); if (document.visibilityState === 'hidden') persist('hidden'); });
addEventListener('pagehide', e => { log('pagehide', {persisted: e.persisted}); persist('pagehide'); });
addEventListener('pageshow', e => log('pageshow', {persisted: e.persisted}));

window.__probe = {events, sample, audio, get record() { return record; }, ready: true};
