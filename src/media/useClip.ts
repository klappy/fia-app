import { useCallback, useEffect, useRef, useState } from 'react';
import { clampSeek, playPhase, rememberPosition, resumePosition, type ResumeMap } from './seek';

// One HTMLAudioElement per screen. Opening never starts audio (R-407); resume position is kept
// per clip for this session (R-505) and restored by seeking only, never by autoplay.
const resumeMap: { current: ResumeMap } = { current: {} };

export interface ClipState {
  elapsed: number;
  duration: number;
  playing: boolean;
  error: boolean;
  phase: ReturnType<typeof playPhase>;
  toggle: () => void;
  seek: (t: number) => void;
  playFrom: (t: number) => void;
}

/** Transport state after the clip changes or unmounts (never still "playing"). */
export function clipReset(knownDuration = 0): { playing: false; elapsed: 0; duration: number } {
  return { playing: false, elapsed: 0, duration: knownDuration };
}

export function useClip(url: string | null | undefined, key: string, knownDuration = 0): ClipState {
  const ref = useRef<HTMLAudioElement | null>(null);
  // A seek asked for before metadata is known (e.g. edition switch by verse) is applied on load.
  const pendingSeek = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(knownDuration);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url) return;
    const a = new Audio();
    a.preload = 'metadata';
    a.src = url;
    ref.current = a;
    setError(false);
    const onMeta = () => {
      setDuration(a.duration);
      const want = pendingSeek.current;
      pendingSeek.current = null;
      const r = want ?? resumePosition(resumeMap.current, key, a.duration);
      if (r > 0) a.currentTime = clampSeek(r, a.duration);
      setElapsed(a.currentTime);
    };
    const onTime = () => {
      setElapsed(a.currentTime);
      resumeMap.current = rememberPosition(resumeMap.current, key, a.currentTime, a.duration);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onErr = () => {
      setError(true);
      setPlaying(false);
    };
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onPause);
    a.addEventListener('error', onErr);
    return () => {
      // The pause event would arrive after its listener is gone: reset the transport here so a
      // clip change (e.g. edition switch while playing) never keeps "playing" or the old clock.
      const reset = clipReset(knownDuration);
      setPlaying(reset.playing);
      setElapsed(reset.elapsed);
      setDuration(reset.duration);
      pendingSeek.current = null;
      a.pause();
      a.removeAttribute('src');
      a.load();
      ref.current = null;
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onPause);
      a.removeEventListener('error', onErr);
    };
    // knownDuration is only the pre-metadata placeholder; it must not re-create the element
  }, [url, key]);

  const seek = useCallback((t: number) => {
    const a = ref.current;
    if (!a) return;
    if (a.readyState < 1) {
      pendingSeek.current = t; // HAVE_NOTHING: duration unknown, apply on loadedmetadata
      setElapsed(t);
      return;
    }
    a.currentTime = clampSeek(t, a.duration || 0);
    setElapsed(a.currentTime);
  }, []);
  const toggle = useCallback(() => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      if (a.ended) a.currentTime = 0;
      void a.play().catch(() => setError(true));
    } else a.pause();
  }, []);
  const playFrom = useCallback(
    (t: number) => {
      seek(t);
      const a = ref.current;
      if (a?.paused) void a.play().catch(() => setError(true));
    },
    [seek],
  );
  return {
    elapsed,
    duration,
    playing,
    error,
    phase: playPhase(playing, elapsed, duration),
    toggle,
    seek,
    playFrom,
  };
}
