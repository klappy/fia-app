// One audio owner for prepared narration, browser speech and video.
// A start that has not reached sound by this bound is handed back to a tap: iOS can leave a start
// it does not allow pending forever, with neither sound nor a rejection.
export const START_BOUND_MS = 1500;
const CLOCK_REPORT_MS = 50;
export function createAudioController(onState, onEnd, onError, { allowSpeechFallback = true } = {}) {
  // Native media clocks can round a completed seek just below the requested start.
  const seekToleranceSeconds = 0.001;
  const beforeRangeStart = owner => !Number.isFinite(owner.currentTime) || range.startSeconds - owner.currentTime > seekToleranceSeconds;
  let source = null, range = null, deadline = null, frame = null, prepareRange = null, boundaryEpoch = 0;
  function clearBoundary() { boundaryEpoch++; clearTimeout(deadline); deadline = null; if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame); frame = null; }
  let audio = null, utterance = null, generation = 0, speaking = false, paused = false;
  // One persistent element per distinct audio FILE (identity), never more, never recreated while the app lives.
  // A file needed again is an instant seek on its own loaded element, not a source reload. iOS lets an element
  // start without a tap only once a tap has started that same element, so every pooled element is unlocked by a tap (unlock()).
  const pool = new Map();
  let startBound = null, attempt = 0;
  // The clip has reached sound: its own 'playing' or a resolved play(). A timeupdate alone is not sound, since the
  // element keeps the previous clip and the next source swap queues one before any sound.
  let sounding = false;
  function entryFor(identity) {
    let entry = pool.get(identity);
    if (!entry) { entry = { element: new Audio(), unlocked: false, heldSource: null }; pool.set(identity, entry); }
    return entry;
  }
  function clearStartBound() { clearTimeout(startBound); startBound = null; }
  function boundStart(owner, gen, message) {
    clearStartBound();
    startBound = setTimeout(() => {
      startBound = null;
      if (gen !== generation || audio !== owner || speaking || paused) return;
      // Keep the verified bytes and owner paused, so the next tap's resume() starts it inside the tap.
      attempt++; clearBoundary(); paused = true; owner.pause(); speaking = false; state();
      onError(message);
    }, START_BOUND_MS);
  }
  const pauseVideos = () => document.querySelectorAll('video').forEach(video => video.pause());
  const state = () => {
    if (speaking) clearStartBound();
    const elapsed = audio?.currentTime || 0, duration = Number.isFinite(audio?.duration) ? audio.duration : 0;
    // Keep absolute media time for alignment; the circle measures only this excerpt.
    const progress = range ? { progressElapsed: Math.max(0, Math.min(range.endSeconds - range.startSeconds, elapsed - range.startSeconds)), progressDuration: range.endSeconds - range.startSeconds } : {};
    onState({ src: source, playing: speaking, elapsed, duration, ...progress });
  };
  function releaseAudio() {
    clearBoundary(); clearStartBound(); range = null; prepareRange = null; sounding = false;
    const old = audio;
    audio = null; source = null;
    // Pause only: emptying the shared element's source and calling load() can return it to locked on
    // iOS, and the next clip's source swap reloads it anyway (see sounding for the timeupdate it queues).
    if (old) old.pause();
  }
  function stop() {
    generation++;
    releaseAudio();
    utterance = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    speaking = false; paused = false; state();
  }
  function fail(message) {
    stop();
    onError(message);
  }
  function finish() {
    // Invalidate queued browser callbacks and release ended owners before notifying UI.
    stop();
    onEnd();
  }
  function playbackRejected(error, owner, gen, message) {
    if (gen !== generation || audio !== owner) return;
    if (error?.name === 'NotAllowedError') {
      // Keep verified bytes and the same owner for a synchronous explicit retry.
      clearBoundary(); clearStartBound(); owner.pause(); paused = true; speaking = false; state();
      onError(message);
    } else fail(message);
  }
  function startAudio(owner, gen, message) {
    if (range?.ready) {
      if (!Number.isFinite(owner.duration) || range.endSeconds > owner.duration || beforeRangeStart(owner)) { fail('The recording range is unavailable.'); return; }
      if (owner.currentTime >= range.endSeconds) { finish(); return; }
    }
    try {
      // A start superseded by a pause (or by the start bound) no longer speaks for the owner.
      const current = ++attempt;
      const started = owner.play();
      if (range) armBoundary(owner, gen);
      boundStart(owner, gen, message);
      Promise.resolve(started).then(() => {
        if (current !== attempt || gen !== generation || audio !== owner) return;
        sounding = true; speaking = !paused && !owner.paused;
        state();
        if (range) armBoundary(owner, gen);
      }).catch(error => { if (current === attempt) playbackRejected(error, owner, gen, message); });
    } catch (error) {
      playbackRejected(error, owner, gen, message);
    }
  }
  function armBoundary(owner, gen) {
    clearBoundary();
    const epoch = boundaryEpoch;
    const current = () => epoch === boundaryEpoch && gen === generation && audio === owner && range?.ready && !paused && !owner.paused;
    if (!current()) return;
    const check = () => {
      if (!current()) return;
      if (beforeRangeStart(owner) || !Number.isFinite(owner.duration) || range.endSeconds > owner.duration) {
        fail('The recording range is unavailable.'); return;
      }
      if (owner.currentTime >= range.endSeconds) { finish(); return; }
      return true;
    };
    if (!check()) return;
    const schedule = () => {
      const speed = owner.playbackRate;
      if (!Number.isFinite(speed) || speed <= 0) { fail('The recording playback rate is unavailable.'); return; }
      deadline = setTimeout(() => { if (epoch !== boundaryEpoch) return; deadline = null; if (check()) schedule(); }, Math.max(4, (range.endSeconds - owner.currentTime) * 1000 / speed));
    };
    schedule();
    if (typeof requestAnimationFrame === 'function') {
      const inspect = () => { if (epoch !== boundaryEpoch) return; frame = null; if (check()) frame = requestAnimationFrame(inspect); };
      frame = requestAnimationFrame(inspect);
    }
  }
  function speak(text, gen, rate) {
    if (!allowSpeechFallback) { fail('The source recording is unavailable. Read the words or try Play again.'); return; }
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      fail('Speech is unavailable in this browser. Read the words and use Continue.');
      return;
    }
    try {
      const owner = new SpeechSynthesisUtterance(text);
      utterance = owner;
      owner.lang = 'en-US'; owner.rate = rate;
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.lang === 'en-US' && /Samantha|Google US|Natural/.test(v.name)) || voices.find(v => v.lang.startsWith('en'));
      if (voice) owner.voice = voice;
      const current = () => gen === generation && utterance === owner;
      owner.onstart = () => { if (current()) { speaking = !paused; state(); } };
      owner.onend = () => { if (current()) finish(); };
      owner.onerror = event => {
        if (!current()) return;
        if (['interrupted', 'canceled'].includes(event.error)) stop();
        else fail('The voice stopped. You can replay or continue by reading.');
      };
      window.speechSynthesis.speak(owner);
      if (paused) window.speechSynthesis.pause();
    } catch {
      if (gen === generation) fail('The voice stopped. You can replay or continue by reading.');
    }
  }
  function play(text, src, rate = 1, playbackRange, fileIdentity) {
    stop(); pauseVideos();
    const gen = generation;
    if (playbackRange !== undefined) {
      if (!playbackRange || Object.getPrototypeOf(playbackRange) !== Object.prototype || Object.keys(playbackRange).length !== 2 || !Object.hasOwn(playbackRange,'startSeconds') || !Object.hasOwn(playbackRange,'endSeconds')) { fail('The recording range is unavailable.'); return; }
      const start = playbackRange.startSeconds, end = playbackRange.endSeconds;
      if (!src || typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= end || !Number.isFinite(rate) || rate <= 0) { fail('The recording range is unavailable.'); return; }
      range = {startSeconds:start,endSeconds:end,ready:false};
    }
    if (!src) { speak(text, gen, rate); return; }
    const entry = entryFor(fileIdentity ?? src), owner = entry.element;
    // The same file already loaded on its own element is reused as is: no src write, no reload, no re-decode.
    const sameSource = entry.heldSource === src, loaded = sameSource && owner.readyState >= 1;
    if (!loaded) { owner.src = src; entry.heldSource = src; }
    audio = owner; source = src; owner.playbackRate = rate;
    const current = () => gen === generation && audio === owner;
    // 'timeupdate' fires about four times a second (less when Safari throttles it), so a word highlight driven by it
    // trails the voice by up to a quarter second. While sound plays, also report the media clock every animation frame (20 Hz).
    let reporter = null, lastReport = 0;
    const report = now => {
      reporter = null;
      if (!current() || !speaking) return;
      if (now - lastReport >= CLOCK_REPORT_MS) { lastReport = now; state(); }
      reporter = requestAnimationFrame(report);
    };
    const update = () => {
      if (!current()) return;
      speaking = sounding && !paused && !owner.paused; state();
      if (speaking && reporter === null && typeof requestAnimationFrame === 'function') reporter = requestAnimationFrame(report);
      if (range?.ready) armBoundary(owner, gen);
    };
    owner.ontimeupdate = update;
    owner.onplaying = () => { if (current()) sounding = true; update(); };
    owner.onratechange = update;
    owner.ondurationchange = () => { if (current() && range?.ready) armBoundary(owner, gen); };
    owner.onended = () => {
      if (!current() || range && paused) return;
      if (range && (!range.ready || owner.currentTime < range.endSeconds)) { fail('The recording range is unavailable.'); return; }
      finish();
    };
    owner.onerror = () => {
      if (!current()) return;
      if (range) { fail('The source recording range is unavailable.'); return; }
      releaseAudio(); speaking = false; state();
      speak(text, gen, rate);
    };
    const message = 'Tap Play to hear the narration. Your browser paused automatic audio.';
    boundStart(owner, gen, message);
    if (!range) {
      owner.onloadedmetadata = update; owner.onseeked = null;
      // The spec reloads on a same-value source set (Chromium does); a browser that does not would resume mid-file.
      if (sameSource) { try { owner.currentTime = 0; } catch {} }
      startAudio(owner, gen, message);
      return;
    }
    let seekingStart = false;
    const ready = () => {
      if (!current() || !range || !seekingStart || owner.seeking) return;
      if (!Number.isFinite(owner.currentTime) || Math.abs(owner.currentTime - range.startSeconds) > seekToleranceSeconds) { fail('The recording range could not be reached.'); return; }
      range.ready = true; seekingStart = false; state();
      if (!paused) startAudio(owner, gen, message);
    };
    prepareRange = () => {
      if (!current() || !range || range.ready || seekingStart) return;
      if (!Number.isFinite(owner.duration) || range.endSeconds > owner.duration) { fail('The recording range is unavailable.'); return; }
      seekingStart = true;
      try { owner.currentTime = range.startSeconds; } catch { fail('The recording range could not be reached.'); return; }
      ready();
    };
    owner.onseeked = ready;
    owner.onloadedmetadata = prepareRange;
    if (owner.readyState >= 1) prepareRange();
  }

  function pause() {
    clearBoundary(); clearStartBound(); attempt++;
    paused = true;
    if (audio) audio.pause();
    if (utterance && 'speechSynthesis' in window) window.speechSynthesis.pause();
    speaking = false; state();
  }
  // Inside a tap: start and at once pause the element, so it may later start without one (iOS).
  function startInTap(owner) {
    try { const started = owner.play(); owner.pause(); Promise.resolve(started).catch(() => {}); } catch {}
  }
  // Called from a tap before its action: the idle element is unlocked once. An element holding a
  // clip is left alone; that clip's own Play (resume) starts it inside the tap.
  function unlock() {
    for (const entry of pool.values()) {
      if (entry.unlocked || entry.element === audio) continue;
      entry.unlocked = true; startInTap(entry.element);
    }
  }
  // Create the idle element for a file before it is needed, so the next tap can unlock it.
  function reserve(identities) { for (const identity of identities) entryFor(identity); }
  function evict(identity) {
    const entry = pool.get(identity);
    if (!entry) return;
    if (entry.element === audio) stop();
    entry.element.pause(); pool.delete(identity);
  }
  // Seek the active ranged clip to an absolute media time (seconds); never outside its accepted range.
  function seek(seconds) {
    if (!audio || !range?.ready || !Number.isFinite(seconds) || seconds < range.startSeconds || seconds >= range.endSeconds) return false;
    try { audio.currentTime = seconds; } catch { return false; }
    state(); if (!paused && !audio.paused) armBoundary(audio, generation);
    return true;
  }
  function resume() {
    if (!audio && !utterance) return false;
    pauseVideos(); paused = false;
    if (audio) {
      const message = 'Tap Play to resume.';
      if (!range || range.ready) startAudio(audio, generation, message);
      else { boundStart(audio, generation, message); startInTap(audio); if (audio.readyState >= 1) prepareRange?.(); }
    }
    else {
      try { window.speechSynthesis.resume(); speaking = true; state(); }
      catch { fail('The voice stopped. You can replay or continue by reading.'); return false; }
    }
    return true;
  }
  return { play, pause, resume, stop, unlock, reserve, evict, seek, get poolSize() { return pool.size; }, get active() { return !!audio || !!utterance; }, get playing() { return speaking; } };
}
