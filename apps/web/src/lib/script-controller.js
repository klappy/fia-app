// CONTROLLER layer (separate from the player). It owns the stage script, each file's sidecar word map and navigation order.
// It tells the player what to play and when, and it survives screen navigation (it is created once, above the screens).
// It never touches the DOM or media elements; the player (src/lib/audio.js, a pool of one persistent engine per file) never
// knows about screens, pericope order or the journey. Contract with the player:
//   player.play(text, src, rate, {startSeconds,endSeconds}, fileIdentity)   player.seek(seconds)   player.stop()
//   the player reports state {src, playing, elapsed, ...} to controller.onPlayerState and completion to controller.onPlayerEnd.
import { wordIndexAt, seekMsForWord } from './transcript.js';
/**
 * script: ordered spans [{id, text, fileKey, src, startMs, endMs}] covering the whole stage, screen to screen.
 * transcripts: Map fileKey -> sidecar (fia-word-transcript@1), the single source of truth for words and milliseconds.
 */
export function createScriptController({ player, script, transcripts, rate = () => 1, onHighlight = () => {}, onAdvance = () => {} }) {
  const index = new Map(script.map((span, i) => [span.id, i]));
  let current = null, lastWord = undefined, ended = false;
  const span = id => script[index.get(id)];
  const words = s => transcripts.get(s.fileKey)?.activities?.[s.id]?.words ?? null;
  function play(id) {
    const s = span(id); if (!s) return false;
    current = s; lastWord = null; ended = false; onHighlight(s.id, null);
    player.play(s.text, s.src, rate(), { startSeconds: s.startMs / 1000, endSeconds: s.endMs / 1000 }, s.fileKey);
    return true;
  }
  // Player clock -> highlighted word, from the sidecar only. No sidecar means no highlight, never a guess.
  function onPlayerState(state) {
    if (!current || state.src !== current.src && state.src !== null) return;
    const w = words(current); if (!w || !Number.isFinite(state.elapsed)) return;
    const word = wordIndexAt(w, Math.round(state.elapsed * 1000));
    if (word !== lastWord) { lastWord = word; onHighlight(current.id, word); }
  }
  // End of a span drives the next navigation/action exactly once.
  function onPlayerEnd() {
    if (!current || ended) return;
    ended = true; const next = script[index.get(current.id) + 1];
    onAdvance(next?.id ?? null, current.id);
  }
  function seekWord(id, wordIndex) {
    const s = span(id), w = s && words(s), ms = w ? seekMsForWord(w, wordIndex) : null;
    if (ms === null) return false;
    if (current?.id !== id) play(id);
    return player.seek(ms / 1000);
  }
  return { play, seekWord, onPlayerState, onPlayerEnd, stop() { current = null; player.stop(); }, get current() { return current?.id ?? null; }, next: id => script[index.get(id) + 1]?.id ?? null };
}
