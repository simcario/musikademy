"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface MetronomePosition {
  /** Indice del quarto nella battuta. */
  beat: number;
  /** Indice della suddivisione all'interno del quarto. */
  sub: number;
}

type ClickLevel = "accent" | "beat" | "sub";

const CLICK: Record<ClickLevel, { freq: number; gain: number }> = {
  accent: { freq: 1568, gain: 1 },
  beat: { freq: 1047, gain: 0.8 },
  sub: { freq: 784, gain: 0.35 },
};

/** Ogni quanto gira lo scheduler (ms) e quanto in anticipo programma i click (s). */
const TICK_MS = 25;
const LOOKAHEAD = 0.1;

function scheduleClick(ctx: AudioContext, out: AudioNode, time: number, level: ClickLevel) {
  const { freq, gain } = CLICK[level];
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.frequency.value = freq;
  env.gain.setValueAtTime(gain, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  osc.connect(env).connect(out);
  osc.start(time);
  osc.stop(time + 0.05);
}

/**
 * Motore del metronomo: i click sono programmati sul clock della Web Audio API
 * (non su setInterval), così il tempo resta stabile anche con il main thread occupato.
 * `beats` contiene la suddivisione di ogni quarto (1 = quarto, 2 = ottavi, 4 = sedicesimi…);
 * bpm e suddivisioni si possono cambiare durante la riproduzione.
 */
export function useMetronome(bpm: number, beats: number[]) {
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState<MetronomePosition | null>(null);
  const settingsRef = useRef({ bpm, beats });
  const ctxRef = useRef<AudioContext | null>(null);
  const haltRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    settingsRef.current = { bpm, beats };
  }, [bpm, beats]);

  const stop = useCallback(() => {
    haltRef.current?.();
    haltRef.current = null;
    setPlaying(false);
    setPosition(null);
  }, []);

  const start = useCallback(() => {
    if (haltRef.current) return;
    const ctx = (ctxRef.current ??= new AudioContext());
    void ctx.resume();
    const out = ctx.createGain();
    out.connect(ctx.destination);

    let beat = 0;
    let sub = 0;
    let beatStart = ctx.currentTime + 0.06;
    const queue: (MetronomePosition & { time: number })[] = [];

    const tick = () => {
      for (;;) {
        const { bpm, beats } = settingsRef.current;
        const beatLength = 60 / bpm;
        // Scheda in background: il timer è stato rallentato, si riparte dal presente.
        if (beatStart + beatLength < ctx.currentTime) {
          beatStart = ctx.currentTime + 0.06;
          sub = 0;
        }
        if (beat >= beats.length) beat = 0;
        const division = beats[beat];
        if (sub >= division) {
          sub = 0;
          beat = (beat + 1) % beats.length;
          beatStart += beatLength;
          continue;
        }
        const time = beatStart + (sub * beatLength) / division;
        if (time >= ctx.currentTime + LOOKAHEAD) break;
        scheduleClick(ctx, out, time, sub > 0 ? "sub" : beat === 0 ? "accent" : "beat");
        queue.push({ beat, sub, time });
        sub += 1;
      }
    };

    // L'indicatore visivo segue il clock audio, non il momento in cui il click è stato programmato.
    let frame = 0;
    const draw = () => {
      let current: MetronomePosition | undefined;
      while (queue.length && queue[0].time <= ctx.currentTime) current = queue.shift();
      if (current) setPosition({ beat: current.beat, sub: current.sub });
      frame = requestAnimationFrame(draw);
    };

    tick();
    const timer = window.setInterval(tick, TICK_MS);
    frame = requestAnimationFrame(draw);
    haltRef.current = () => {
      window.clearInterval(timer);
      cancelAnimationFrame(frame);
      out.disconnect();
    };
    setPlaying(true);
  }, []);

  const toggle = useCallback(() => {
    if (haltRef.current) stop();
    else start();
  }, [start, stop]);

  useEffect(
    () => () => {
      haltRef.current?.();
      haltRef.current = null;
      void ctxRef.current?.close();
      ctxRef.current = null;
    },
    [],
  );

  return { playing, position, start, stop, toggle };
}
