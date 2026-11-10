// CONTROLLER layer (separate from the player). It owns the stage script, each file's sidecar word map and navigation order.
// It tells the player what to play and when, and it survives screen navigation (it is created once, above the screens).
// It never touches the DOM or media elements; the player (src/lib/audio.js, a pool of one persistent engine per file) never
// knows about screens, pericope order or the journey. Contract with the player:
//   player.play(text, src, rate, {startSeconds,endSeconds}, fileIdentity)   player.seek(seconds)   player.stop()
//   the player reports state {src, playing, elapsed, ...} to controller.onPlayerState and completion to controller.onPlayerEnd.
// Audio is the player and the pages turn to the audio (captain, 2026-11-09): a RUN (playRun) keeps several screens on one
// media session, turns the page by the clock, seeks over the gaps between clips and lets a page jump seek the session.
import { wordIndexAt, seekMsForWord, activityWords } from './transcript.js';
// A page turn whose clock is further than this past the span's start re-anchors the audio at that start.
export const REANCHOR_SECONDS = 0.25;
/**
 * script: ordered spans [{id, text, fileKey, src, startMs, endMs}] covering the whole stage, screen to screen.
 * transcripts: Map fileKey -> sidecar (fia-word-transcript@1), the single source of truth for words and milliseconds.
 */
export function createScriptController({ player, script, transcripts, rate = () => 1, onHighlight = () => {}, onAdvance = () => {}, onSpan = () => {} }) {
  script = [...script];
  const index = new Map(script.map((span, i) => [span.id, i]));
  let current = null, lastWord = undefined, ended = false, continuous = null, gaps = 'play', seeking = false, stopAt = null;
  const span = id => script[index.get(id)];
  // An activity's own word map wins; a sidecar that carries only top-level `words` (a whole Scripture passage) covers every span of its file.
  const words = s => { const t = transcripts.get(s.fileKey); return t?.activities && Object.hasOwn(t.activities, s.id) ? activityWords(t.activities[s.id], s.range || {startSeconds:s.startMs/1000,endSeconds:s.endMs/1000}) : (t?.words?.length ? t.words : null); };
  function play(id) {
    const s = span(id); if (!s) return false;
    continuous = null; stopAt = null; current = s; lastWord = null; ended = false; onHighlight(s.id, null);
    player.play(s.text, s.src, rate(), s.range || { startSeconds: s.startMs / 1000, endSeconds: s.endMs / 1000 }, s.fileKey);
    return true;
  }
  // One media session may cover several consecutive spans of one file. Row changes follow the same media clock;
  // they never invoke play, pause or reload. gaps:'play' is the authored together-list (its approved outer bounds
  // include the recording's internal pauses, so nothing is seeked); gaps:'seek' is a run (playRun).
  function playContinuous(spans, { gaps: mode = 'play' } = {}) {
    if (!Array.isArray(spans) || spans.length < 2) return false;
    const first = spans[0], last = spans.at(-1);
    if (!first.src || !first.fileKey || spans.some((s,i) => !s.id || s.src !== first.src || s.fileKey !== first.fileKey || !Number.isFinite(s.range?.startSeconds) || !Number.isFinite(s.range?.endSeconds) || s.range.startSeconds >= s.range.endSeconds || i && s.range.startSeconds < spans[i-1].range.endSeconds)) return false;
    spans.forEach(register); continuous = [...spans]; stopAt = null; gaps = mode === 'seek' ? 'seek' : 'play'; current = first; lastWord = null; ended = false;
    onHighlight(first.id, null);
    player.play(first.text, first.src, rate(), {startSeconds:first.range.startSeconds,endSeconds:last.range.endSeconds}, first.fileKey);
    return true;
  }
  const playRun = spans => playContinuous(spans, { gaps: 'seek' });
  // The player reports its clock synchronously inside seek(); that report describes the seek itself, not a crossing.
  function seekTo(seconds) { seeking = true; try { return player.seek(seconds) === true; } finally { seeking = false; } }
  // The page turns to the clock: custody moves to `next`, and the app may refuse (it then owns the stop).
  function cross(next) {
    const prior = current; current = next; lastWord = null;
    if (onSpan(next.id, prior.id) === false) { continuous = null; current = null; player.stop(); return false; }
    onHighlight(next.id, null); return true;
  }
  const spanAt = elapsed => [...continuous].reverse().find(s => elapsed >= s.range.startSeconds) || continuous[0];
  // Player clock -> screen and highlighted word, from the sidecar only.
  function onPlayerState(state) {
    if (seeking || !current || state.src !== current.src && state.src !== null) return;
    if (continuous && state.src === null) return; // player completion clears its source before onPlayerEnd
    if (continuous && Number.isFinite(state.elapsed)) {
      const after = continuous[continuous.indexOf(current) + 1];
      let next = spanAt(state.elapsed);
      if (gaps === 'seek' && after && state.elapsed >= current.range.endSeconds) {
        if (state.elapsed < after.range.startSeconds) {
          // The gap between two clips (a spoken question number, a pause cue) is never voiced. A refused seek
          // (the range not yet ready) leaves the clock rule in charge until the next report.
          if (seekTo(after.range.startSeconds)) next = after;
        } else if (next === after && state.elapsed - after.range.startSeconds > REANCHOR_SECONDS) {
          // A late boundary (a stalled timer, a throttled clock) re-anchors the audio at the span's start.
          seekTo(after.range.startSeconds);
        }
      }
      if (next !== current && !cross(next)) return;
      if (stopAt !== null && current === continuous.at(-1) && state.elapsed >= stopAt) { stopAt = null; player.stop(); onPlayerEnd(); return; }
    }
    const w = words(current); if (!w || !Number.isFinite(state.elapsed)) return;
    const word = wordIndexAt(w, Math.round(state.elapsed * 1000));
    if (word !== lastWord) { lastWord = word; onHighlight(current.id, word); }
  }
  // End of a span drives the next navigation/action exactly once. A run's last span (the confirmation stop, or the
  // last clip before a file change) ends with the player's own range stop and waits here.
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
  // A page jump inside the active run seeks the running session to that span's start and keeps the play/pause state
  // the person had (the player's seek moves the clock without starting or stopping). The app moves the session itself.
  function jumpTo(id) {
    if (!continuous || !current || ended) return false;
    const target = continuous.find(s => s.id === id); if (!target) return false;
    if (!seekTo(target.range.startSeconds)) return false;
    current = target; lastWord = null; onHighlight(target.id, null);
    return true;
  }
  const inRun = id => !!continuous && !ended && continuous.some(s => s.id === id);
  // Replanning a running session: the run now ends before `id` (a stop the app's rules added mid-run). The span before
  // it becomes the last one; at its authored end the player is stopped and the run ends as at a planned stop.
  function endBefore(id) {
    if (!continuous || !current || ended) return false;
    const k = continuous.findIndex(s => s.id === id);
    if (k <= continuous.indexOf(current)) return false;
    continuous = continuous.slice(0, k); stopAt = continuous.at(-1).range.endSeconds;
    return true;
  }
  function seekWord(id, wordIndex) {
    const s = span(id), w = s && words(s), ms = w ? seekMsForWord(w, wordIndex) : null;
    if (ms === null) return false;
    if (current?.id !== id) play(id);
    return player.seek(ms / 1000);
  }
  // The script grows as the stage resolves each file's bytes/blob; an id already present is replaced in place (same position).
  function register(s) { const i = index.get(s.id); if (i === undefined) { index.set(s.id, script.length); script.push(s); } else script[i] = s; return s.id; }
  return { play, playContinuous, playRun, jumpTo, inRun, endBefore, register, seekWord, onPlayerState, onPlayerEnd, stop() { continuous = null; current = null; player.stop(); }, get currentRange() { return current?.range || (current && {startSeconds:current.startMs/1000,endSeconds:current.endMs/1000}); }, get current() { return current?.id ?? null; }, get run() { return continuous && !ended ? continuous.map(s => s.id) : null; }, next: id => script[index.get(id) + 1]?.id ?? null };
}
