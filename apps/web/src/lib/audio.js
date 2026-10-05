// One audio owner for prepared narration, browser speech and video.
export function createAudioController(onState, onEnd, onError, { allowSpeechFallback = true } = {}) {
  let source = null, range = null, deadline = null, frame = null, prepareRange = null, boundaryEpoch = 0;
  function clearBoundary() { boundaryEpoch++; clearTimeout(deadline); deadline = null; if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame); frame = null; }
  let audio = null, utterance = null, generation = 0, speaking = false, paused = false;
  const pauseVideos = () => document.querySelectorAll('video').forEach(video => video.pause());
  const state = () => onState({ src: source, playing: speaking, elapsed: audio?.currentTime || 0, duration: Number.isFinite(audio?.duration) ? audio.duration : 0 });
  function releaseAudio() {
    clearBoundary(); range = null; prepareRange = null;
    const old = audio;
    audio = null; source = null;
    if (old) { old.pause(); old.removeAttribute('src'); old.load(); }
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
      clearBoundary(); owner.pause(); paused = true; speaking = false; state();
      onError(message);
    } else fail(message);
  }
  function startAudio(owner, gen, message) {
    if (range?.ready) {
      if (!Number.isFinite(owner.duration) || range.endSeconds > owner.duration || owner.currentTime < range.startSeconds) { fail('The recording range is unavailable.'); return; }
      if (owner.currentTime >= range.endSeconds) { finish(); return; }
    }
    try {
      const started = owner.play();
      if (range) armBoundary(owner, gen);
      Promise.resolve(started).then(() => {
        if (gen !== generation || audio !== owner) return;
        speaking = !paused && !owner.paused;
        state();
        if (range) armBoundary(owner, gen);
      }).catch(error => playbackRejected(error, owner, gen, message));
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
      if (!Number.isFinite(owner.currentTime) || owner.currentTime < range.startSeconds || !Number.isFinite(owner.duration) || range.endSeconds > owner.duration) {
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
    const owner = new Audio(src);
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
    if (!range) {
      owner.onloadedmetadata = update;
      startAudio(owner, gen, message);
      return;
    }
    let seekingStart = false;
    const ready = () => {
      if (!current() || !range || !seekingStart || owner.seeking) return;
      if (Math.abs(owner.currentTime - range.startSeconds) > 0.001) { fail('The recording range could not be reached.'); return; }
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
    clearBoundary();
    paused = true;
    if (audio) audio.pause();
    if (utterance && 'speechSynthesis' in window) window.speechSynthesis.pause();
    speaking = false; state();
  }
  function resume() {
    if (!audio && !utterance) return false;
    pauseVideos(); paused = false;
    if (audio) { if (!range || range.ready) startAudio(audio, generation, 'Tap Play to resume.'); else if (audio.readyState >= 1) prepareRange?.(); }
    else {
      try { window.speechSynthesis.resume(); speaking = true; state(); }
      catch { fail('The voice stopped. You can replay or continue by reading.'); return false; }
    }
    return true;
  }
  return { play, pause, resume, stop, get active() { return !!audio || !!utterance; }, get playing() { return speaking; } };
}
