// Seek math for the transport (audio-controls, R-505): slider on every clip > 30 s, clamped
// seeks, m:ss clock, and resume position kept per clip (bound to the clip hash, C-09 spirit).

export const SLIDER_MIN_SEC = 30;

/** R-505: a seek slider on every clip longer than 30 s. */
export function sliderVisible(durationSec: number): boolean {
  return Number.isFinite(durationSec) && durationSec > SLIDER_MIN_SEC;
}

export function clampSeek(t: number, durationSec: number): number {
  if (!Number.isFinite(t) || t < 0) return 0;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return Math.min(t, durationSec);
}

/** Slider fraction (0..1) → seconds. RTL is a CSS concern (fill right→left), not a math one. */
export function fractionToSec(f: number, durationSec: number): number {
  return clampSeek(f * durationSec, durationSec);
}

export function secToFraction(t: number, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return clampSeek(t, durationSec) / durationSec;
}

/** `m:ss`, or `h:mm:ss` from one hour. */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Within this many seconds of the end a clip counts as finished; resume starts over. */
export const FINISH_WINDOW_SEC = 2;

export type ResumeMap = Record<string, number>;

export const resumeKey = (clipId: string, sha256?: string) =>
  sha256 ? `${clipId}@${sha256}` : clipId;

/** Remember a position (immutable). Near-start and finished positions are dropped. */
export function rememberPosition(
  map: ResumeMap,
  key: string,
  t: number,
  durationSec: number,
): ResumeMap {
  const next = { ...map };
  const c = clampSeek(t, durationSec);
  if (c < 1 || c >= durationSec - FINISH_WINDOW_SEC) delete next[key];
  else next[key] = c;
  return next;
}

/** Resume position for a clip; never autoplays (the caller only seeks). */
export function resumePosition(map: ResumeMap, key: string, durationSec: number): number {
  const t = map[key];
  return t === undefined ? 0 : clampSeek(t, durationSec);
}

/** Primary-button phase for a transport (spec 08/10 states). */
export type PlayPhase = 'idle' | 'playing' | 'paused' | 'finished';

export function playPhase(playing: boolean, t: number, durationSec: number): PlayPhase {
  if (playing) return 'playing';
  if (durationSec > 0 && t >= durationSec - 0.25) return 'finished';
  return t > 0 ? 'paused' : 'idle';
}
