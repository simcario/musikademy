"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AudioState {
  playing: boolean;
  loading: boolean;
  error: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  rate: number;
  loop: boolean;
}

const INITIAL: AudioState = {
  playing: false,
  loading: false,
  error: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  muted: false,
  rate: 1,
  loop: false,
};

export const PLAYBACK_RATES = [0.75, 1, 1.25] as const;

/**
 * Motore del player: un unico HTMLAudioElement controllato da React.
 * Estensioni previste (§12): playlist e A/B repeat si innestano qui
 * (es. `abRange` controllato in `onTimeUpdate`), senza toccare la UI.
 */
export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<AudioState>(INITIAL);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;
    const sync = (patch: Partial<AudioState>) => setState((s) => ({ ...s, ...patch }));
    const handlers: Record<string, () => void> = {
      play: () => sync({ playing: true }),
      pause: () => sync({ playing: false }),
      ended: () => sync({ playing: false }),
      waiting: () => sync({ loading: true }),
      canplay: () => sync({ loading: false }),
      playing: () => sync({ loading: false, playing: true }),
      timeupdate: () => sync({ currentTime: audio.currentTime }),
      durationchange: () => sync({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 }),
      loadedmetadata: () => sync({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 }),
      volumechange: () => sync({ volume: audio.volume, muted: audio.muted }),
      ratechange: () => sync({ rate: audio.playbackRate }),
      error: () => sync({ error: true, loading: false, playing: false }),
    };
    Object.entries(handlers).forEach(([e, h]) => audio.addEventListener(e, h));
    return () => {
      Object.entries(handlers).forEach(([e, h]) => audio.removeEventListener(e, h));
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  const load = useCallback(async (src: string, autoplay = true) => {
    const audio = audioRef.current;
    if (!audio) return;
    setState((s) => ({ ...INITIAL, volume: s.volume, muted: s.muted, rate: s.rate, loop: s.loop, loading: true }));
    audio.src = src;
    audio.load();
    if (autoplay) await audio.play().catch(() => setState((s) => ({ ...s, loading: false })));
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio?.src) return;
    if (audio.paused) audio.play().catch(() => undefined);
    else audio.pause();
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(Math.max(0, time), audio.duration);
  }, []);

  const skip = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (audio) seek(audio.currentTime + delta);
  }, [seek]);

  const setVolume = useCallback((v: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.min(Math.max(0, v), 1);
    if (audio.volume > 0) audio.muted = false;
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.muted = !audio.muted;
  }, []);

  const cycleRate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const i = PLAYBACK_RATES.indexOf(audio.playbackRate as (typeof PLAYBACK_RATES)[number]);
    audio.playbackRate = PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length];
  }, []);

  const toggleLoop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = !audio.loop;
    setState((s) => ({ ...s, loop: audio.loop }));
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    setState((s) => ({ ...INITIAL, volume: s.volume, muted: s.muted, rate: s.rate }));
  }, []);

  return { state, load, toggle, seek, skip, setVolume, toggleMute, cycleRate, toggleLoop, stop };
}

export type AudioControls = ReturnType<typeof useAudioPlayer>;
