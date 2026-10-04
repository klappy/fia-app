// One audio owner for prepared narration, browser speech and video.
export function createAudioController(onState, onEnd, onError, { allowSpeechFallback = true } = {}) {
  let source = null;
  let audio = null, utterance = null, generation = 0, speaking = false, paused = false;
  const pauseVideos = () => document.querySelectorAll('video').forEach(video => video.pause());
  const state = () => onState({ src: source, playing: speaking, elapsed: audio?.currentTime || 0, duration: Number.isFinite(audio?.duration) ? audio.duration : 0 });
  function releaseAudio() {
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
  function startAudio(owner, gen, message) {
    try {
      Promise.resolve(owner.play()).then(() => {
        if (gen !== generation || audio !== owner) return;
        speaking = !paused && !owner.paused;
        state();
      }).catch(() => {
        if (gen === generation && audio === owner) fail(message);
      });
    } catch {
      if (gen === generation && audio === owner) fail(message);
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
  function play(text, src, rate = 1) {
    stop(); pauseVideos();
    const gen = generation;
    if (!src) { speak(text, gen, rate); return; }
    const owner = new Audio(src);
    audio = owner; source = src; owner.playbackRate = rate;
    const current = () => gen === generation && audio === owner;
    owner.onloadedmetadata = owner.ontimeupdate = () => {
      if (current()) { speaking = !paused && !owner.paused; state(); }
    };
    owner.onended = () => { if (current()) finish(); };
    owner.onerror = () => {
      if (!current()) return;
      releaseAudio(); speaking = false; state();
      speak(text, gen, rate);
    };
    startAudio(owner, gen, 'Tap Play to hear the narration. Your browser paused automatic audio.');
  }
  function pause() {
    paused = true;
    if (audio) audio.pause();
    if (utterance && 'speechSynthesis' in window) window.speechSynthesis.pause();
    speaking = false; state();
  }
  function resume() {
    if (!audio && !utterance) return false;
    pauseVideos(); paused = false;
    if (audio) startAudio(audio, generation, 'Tap Play to resume.');
    else {
      try { window.speechSynthesis.resume(); speaking = true; state(); }
      catch { fail('The voice stopped. You can replay or continue by reading.'); return false; }
    }
    return true;
  }
  return { play, pause, resume, stop, get active() { return !!audio || !!utterance; }, get playing() { return speaking; } };
}
