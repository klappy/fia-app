// CONTROLLER layer (separate from the player). It owns the stage script, each file's sidecar word map and navigation order.
// It tells the player what to play and when, and it survives screen navigation (it is created once, above the screens).
// It never touches the DOM or media elements; the player (src/lib/audio.js, a pool of one persistent engine per file) never
// knows about screens, pericope order or the journey. Contract with the player:
//   player.play(text, src, rate, {startSeconds,endSeconds}, fileIdentity)   player.seek(seconds)   player.stop()
//   the player reports state {src, playing, elapsed, ...} to controller.onPlayerState and completion to controller.onPlayerEnd.
import { wordIndexAt, seekMsForWord, activityWords } from './transcript.js';
/**
 * script: ordered spans [{id, text, fileKey, src, startMs, endMs}] covering the whole stage, screen to screen.
 * transcripts: Map fileKey -> sidecar (fia-word-transcript@1), the single source of truth for words and milliseconds.
 */
export function createScriptController({ player, script, transcripts, rate = () => 1, onHighlight = () => {}, onAdvance = () => {}, onSpan = () => {} }) {
  script = [...script];
  const index = new Map(script.map((span, i) => [span.id, i]));
  let current = null, lastWord = undefined, ended = false, continuous = null;
  const span = id => script[index.get(id)];
  // An activity's own word map wins; a sidecar that carries only top-level `words` (a whole Scripture passage) covers every span of its file.
  const words = s => { const t = transcripts.get(s.fileKey); return t?.activities && Object.hasOwn(t.activities, s.id) ? activityWords(t.activities[s.id], s.range || {startSeconds:s.startMs/1000,endSeconds:s.endMs/1000}) : (t?.words?.length ? t.words : null); };
  function play(id) {
    const s = span(id); if (!s) return false;
    continuous = null; current = s; lastWord = null; ended = false; onHighlight(s.id, null);
    player.play(s.text, s.src, rate(), s.range || { startSeconds: s.startMs / 1000, endSeconds: s.endMs / 1000 }, s.fileKey);
    return true;
  }
  // One media session may cover an explicitly qualified authored list. Row changes
  // follow the same media clock; they never invoke play, seek, pause or reload.
  function playContinuous(spans) {
    if (!Array.isArray(spans) || spans.length < 2) return false;
    const first = spans[0], last = spans.at(-1);
    if (!first.src || !first.fileKey || spans.some((s,i) => !s.id || s.src !== first.src || s.fileKey !== first.fileKey || !Number.isFinite(s.range?.startSeconds) || !Number.isFinite(s.range?.endSeconds) || s.range.startSeconds >= s.range.endSeconds || i && s.range.startSeconds < spans[i-1].range.endSeconds)) return false;
    spans.forEach(register); continuous = [...spans]; current = first; lastWord = null; ended = false;
    onHighlight(first.id, null);
    player.play(first.text, first.src, rate(), {startSeconds:first.range.startSeconds,endSeconds:last.range.endSeconds}, first.fileKey);
    return true;
  }
  // Player clock -> highlighted word, from the sidecar only. No sidecar means no highlight, never a guess.
  function onPlayerState(state) {
    if (!current || state.src !== current.src && state.src !== null) return;
    if (continuous && state.src === null) return; // player completion clears its source before onPlayerEnd
    if (continuous && Number.isFinite(state.elapsed)) {
      const next = [...continuous].reverse().find(s => state.elapsed >= s.range.startSeconds) || continuous[0];
      if (next !== current) {
        const prior = current; current = next; lastWord = null;
        if(onSpan(next.id, prior.id)===false){continuous=null;current=null;player.stop();return;} onHighlight(next.id, null);
      }
    }
    const w = words(current); if (!w || !Number.isFinite(state.elapsed)) return;
    const word = wordIndexAt(w, Math.round(state.elapsed * 1000));
    if (word !== lastWord) { lastWord = word; onHighlight(current.id, word); }
  }
  // End of a span drives the next navigation/action exactly once.
  function onPlayerEnd() {
    if (!current || ended) return;
    ended = true;
    // A native end completes the full qualified group, even when no final timeupdate
    // arrived. Internal row custody still changes without a new media action.
    if (continuous && current !== continuous.at(-1)) {
      const prior=current; current=continuous.at(-1); if(onSpan(current.id,prior.id)===false){continuous=null;current=null;player.stop();return;}
    }
    const next = script[index.get(current.id) + 1];
    onAdvance(next?.id ?? null, current.id);
  }
  function seekWord(id, wordIndex) {
    const s = span(id), w = s && words(s), ms = w ? seekMsForWord(w, wordIndex) : null;
    if (ms === null) return false;
    if (current?.id !== id) play(id);
    return player.seek(ms / 1000);
  }
  // The script grows as the stage resolves each file's bytes/blob; an id already present is replaced in place (same position).
  function register(s) { const i = index.get(s.id); if (i === undefined) { index.set(s.id, script.length); script.push(s); } else script[i] = s; return s.id; }
  return { play, playContinuous, register, seekWord, onPlayerState, onPlayerEnd, stop() { continuous = null; current = null; player.stop(); }, get currentRange() { return current?.range || (current && {startSeconds:current.startMs/1000,endSeconds:current.endMs/1000}); }, get current() { return current?.id ?? null; }, next: id => script[index.get(id) + 1]?.id ?? null };
}
