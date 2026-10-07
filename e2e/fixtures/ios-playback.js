/** iOS playback rules for Chromium e2e (WebKit is not installed where these specs run).
 *
 * WebKit on iPhone lets an audio element with sound start only inside a user gesture, or later on an
 * element that a gesture has already started; until then it loads no data for that element. A start
 * it does not allow may be rejected with NotAllowedError ('reject'), or stay pending with neither sound
 * nor a rejection ('hang', the captain's iPhone on DEV). This emulates those rules for audio elements.
 * Video is not emulated, and muted audio is never gated.
 *
 * A gesture is a trusted click, pointerup, touchend or keydown. Its permission carries into the work
 * the tap starts (fetches, timers) for `windowMs`: 5000 ms by default, about a browser's transient
 * user activation, which lets a first screen whose clip arrives soon after the tap play, as it did on
 * the captain's iPhone; 0 keeps only the task that dispatched the event (and its microtasks), stricter
 * than any iOS. Chromium's own user activation is ignored on purpose, because page.evaluate grants it
 * and would unlock an element the test means to keep locked.
 *
 * Install before navigation: await page.addInitScript(iosPlayback, {start: 'hang'}).
 * Options: start 'hang' | 'reject'; windowMs; primeSourceless (whether a play() on an element with
 * no source counts as the gesture's start, as WebKit does); rate (playback speed for every clip, to
 * keep walks short). playbackLog(page) reads each clip handed to an element (sources: when, and
 * whether its loading was held), each play() and its outcome, and each 'playing'.
 */
export function iosPlayback({start = 'hang', windowMs = 5000, primeSourceless = true, rate = 1} = {}) {
 if (window.__iosPlayback) return;
 const log = window.__iosPlayback = {sources: [], plays: [], playing: [], elements: 0};
 const now = () => Math.round(performance.now());
 let gestureAt = -Infinity, inGestureTask = false;
 for (const type of ['click', 'pointerup', 'touchend', 'keydown']) window.addEventListener(type, event => {
  if (!event.isTrusted) return;
  gestureAt = performance.now(); inGestureTask = true; setTimeout(() => { inGestureTask = false; }, 0);
 }, true);
 const gesture = () => inGestureTask || performance.now() - gestureAt <= windowMs;
 const unlocked = new WeakSet(), held = new WeakMap(), ids = new WeakMap();
 const media = HTMLMediaElement.prototype;
 const srcProperty = Object.getOwnPropertyDescriptor(media, 'src'), rateProperty = Object.getOwnPropertyDescriptor(media, 'playbackRate');
 const nativePlay = media.play, nativeRemoveAttribute = Element.prototype.removeAttribute;
 const gated = el => el.localName === 'audio' && !el.muted && !unlocked.has(el);
 const id = el => {
  if (!ids.has(el)) {
   ids.set(el, ++log.elements);
   el.addEventListener('playing', () => log.playing.push({t: now(), el: ids.get(el)}));
   if (rate !== 1) el.addEventListener('play', () => rateProperty.set.call(el, rate));
  }
  return ids.get(el);
 };
 // No data loads for a gated element until a gesture starts it.
 Object.defineProperty(media, 'src', {configurable: true, enumerable: true,
  get() { return held.has(this) ? held.get(this) : srcProperty.get.call(this); },
  set(value) {
   const entry = {t: now(), el: id(this), held: false};
   if (value) log.sources.push(entry);
   if (value && gated(this) && !gesture()) { entry.held = true; held.set(this, String(value)); return; }
   held.delete(this); srcProperty.set.call(this, value);
  }});
 Element.prototype.removeAttribute = function (name) { if (this instanceof HTMLMediaElement && name === 'src') held.delete(this); return nativeRemoveAttribute.call(this, name); };
 // new Audio(src) sets its source natively, so route it through the setter above.
 const NativeAudio = window.Audio;
 window.Audio = class Audio extends NativeAudio { constructor(...args) { super(); id(this); if (args.length && args[0] !== undefined) this.src = args[0]; } };
 media.play = function () {
  const entry = {t: now(), el: id(this), gesture: gesture(), unlocked: unlocked.has(this), outcome: 'started'};
  log.plays.push(entry);
  if (gated(this) && !entry.gesture) {
   if (start === 'hang') { entry.outcome = 'pending (never settles)'; return new Promise(() => {}); }
   entry.outcome = 'rejected NotAllowedError';
   return Promise.reject(new DOMException('The request is not allowed by the user agent.', 'NotAllowedError'));
  }
  const sourceless = !held.has(this) && !(this.currentSrc || this.getAttribute('src'));
  if (entry.gesture && (primeSourceless || !sourceless)) unlocked.add(this);
  if (held.has(this) && unlocked.has(this)) { const value = held.get(this); held.delete(this); srcProperty.set.call(this, value); }
  return nativePlay.call(this);
 };
}

export const playbackLog = page => page.evaluate(() => window.__iosPlayback);
