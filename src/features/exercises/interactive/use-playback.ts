"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSynth, type Synth } from "./synth";

/** Un evento da suonare: `notes` (MIDI) a `at` secondi dall'inizio, per `duration` secondi. */
export interface PlaybackEvent {
  at: number;
  duration: number;
  notes: number[];
  /** Cosa evidenziare a video mentre suona (es. l'indice della nota o dell'accordo). */
  mark: number | string;
}

/**
 * Riproduzione per gli esercizi d'ascolto: programma gli eventi sul clock audio e segue a video
 * quale sta suonando. Il sintetizzatore nasce al primo `play`, che va chiamato da un gesto dell'utente.
 */
export function usePlayback() {
  const synth = useRef<Synth | null>(null);
  const frame = useRef(0);
  const [current, setCurrent] = useState<number | string | null>(null);
  const [playing, setPlaying] = useState(false);

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    synth.current?.stop();
    setCurrent(null);
    setPlaying(false);
  }, []);

  const play = useCallback(
    (events: PlaybackEvent[], onEnd?: () => void) => {
      stop();
      const s = (synth.current ??= createSynth());
      s.resume();
      const start = s.now() + 0.1;
      for (const e of events) {
        if (e.notes.length === 1) s.note(e.notes[0], start + e.at, e.duration);
        else s.chord(e.notes, start + e.at, e.duration);
      }
      const end = Math.max(...events.map((e) => e.at + e.duration));
      setPlaying(true);
      const loop = () => {
        const t = s.now() - start;
        if (t >= end) {
          setCurrent(null);
          setPlaying(false);
          onEnd?.();
          return;
        }
        const active = events.filter((e) => t >= e.at && t < e.at + e.duration).at(-1);
        setCurrent(active ? active.mark : null);
        frame.current = requestAnimationFrame(loop);
      };
      frame.current = requestAnimationFrame(loop);
    },
    [stop],
  );

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      synth.current?.close();
      synth.current = null;
    },
    [],
  );

  return { play, stop, current, playing };
}
