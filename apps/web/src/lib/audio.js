// One audio owner for prepared narration, browser speech and video.
// A start that has not reached sound by this bound is handed back to a tap: iOS can leave a start
// it does not allow pending forever, with neither sound nor a rejection.
export const START_BOUND_MS = 1500;
export function createAudioController(onState, onEnd, onError, { allowSpeechFallback = true } = {}) {
  // Native media clocks can round a completed seek just below the requested start.
  const seekToleranceSeconds = 0.001;
  const beforeRangeStart = owner => !Number.isFinite(owner.currentTime) || range.startSeconds - owner.currentTime > seekToleranceSeconds;
  let source = null, range = null, deadline = null, frame = null, prepareRange = null, boundaryEpoch = 0;
  function clearBoundary() { boundaryEpoch++; clearTimeout(deadline); deadline = null; if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame); frame = null; }
  let audio = null, utterance = null, generation = 0, speaking = false, paused = false;
  // iOS lets an element start without a tap only once a tap has started that same element, so every
  // clip plays on one element (its source swapped), which the first tap unlocks (unlock()).
  let element = null, unlocked = false, startBound = null, attempt = 0;
  const mediaElement = () => element || (element = new Audio());
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
    clearBoundary(); clearStartBound(); range = null; prepareRange = null;
    const old = audio;
    audio = null; source = null;
    // Pause only: emptying the shared element's source and calling load() can return it to locked on
    // iOS, and the next clip's source swap reloads it anyway.
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
        speaking = !paused && !owner.paused;
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
  function play(text, src, rate = 1, playbackRange) {
    stop(); pauseVideos();
    const gen = generation;
    if (playbackRange !== undefined) {
      if (!playbackRange || Object.getPrototypeOf(playbackRange) !== Object.prototype || Object.keys(playbackRange).length !== 2 || !Object.hasOwn(playbackRange,'startSeconds') || !Object.hasOwn(playbackRange,'endSeconds')) { fail('The recording range is unavailable.'); return; }
      const start = playbackRange.startSeconds, end = playbackRange.endSeconds;
      if (!src || typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= end || !Number.isFinite(rate) || rate <= 0) { fail('The recording range is unavailable.'); return; }
      range = {startSeconds:start,endSeconds:end,ready:false};
    }
    if (!src) { speak(text, gen, rate); return; }
    const owner = mediaElement();
    owner.src = src;
    audio = owner; source = src; owner.playbackRate = rate;
    const current = () => gen === generation && audio === owner;
    const update = () => {
      if (!current()) return;
      speaking = !paused && !owner.paused; state();
      if (range?.ready) armBoundary(owner, gen);
    };
    owner.ontimeupdate = update;
    owner.onplaying = update;
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
    if (unlocked || audio) return;
    unlocked = true; startInTap(mediaElement());
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
  return { play, pause, resume, stop, unlock, get active() { return !!audio || !!utterance; }, get playing() { return speaking; } };
}
