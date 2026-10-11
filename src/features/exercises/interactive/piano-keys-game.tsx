"use client";

import { useEffect, useReducer, useState } from "react";
import { CircleCheckBig, CircleX, Mic, Play, RotateCcw, TimerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PianoKeysExercise } from "@/types";
import { Confetti } from "./confetti";
import { LevelMeter } from "./mic-setup";
import { PianoKeyboard } from "./piano-keyboard";
import { NOTE_NAMES_FLAT, NOTE_NAMES_SHARP, WHITE_KEYS, createNoteTracker, noteName } from "./pitch";
import { usePitchListener } from "./use-microphone";

const COUNTDOWN_FROM = 3;
const ANSWER_MS = 5000;
/** Letture consecutive (40 ms l'una) perché una nota valga come risposta: l'errore ne richiede di più, per non punire un falso rilevamento. */
const CORRECT_FRAMES = 3;
const WRONG_FRAMES = 6;
/** Quanto resta a video l'esito prima della nota successiva. */
const FEEDBACK_MS = { ok: 1800, ko: 3500 };

interface Target {
  pitchClass: number;
  label: string;
}

const ALL_KEYS = Array.from({ length: 12 }, (_, i) => i);

/** Nota a caso, mai uguale alla precedente; i tasti neri escono come diesis o come bemolle. */
function drawTarget(accidentals: boolean, previous: number | null): Target {
  const pool = (accidentals ? ALL_KEYS : WHITE_KEYS).filter((pc) => pc !== previous);
  const pitchClass = pool[Math.floor(Math.random() * pool.length)];
  const names = Math.random() < 0.5 ? NOTE_NAMES_SHARP : NOTE_NAMES_FLAT;
  return { pitchClass, label: names[pitchClass] };
}

interface State {
  phase: "idle" | "countdown" | "listening" | "feedback" | "done";
  count: number;
  target: Target | null;
  /** Nota suonata nell'ultimo turno; `null` se il tempo è scaduto. */
  played: number | null;
  results: boolean[];
}

type Action =
  | { type: "start" }
  | { type: "tick" }
  | { type: "listen"; target: Target }
  | { type: "answer"; ok: boolean; played: number | null }
  | { type: "next"; rounds: number };

const INITIAL: State = { phase: "idle", count: COUNTDOWN_FROM, target: null, played: null, results: [] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "start":
      return { ...INITIAL, phase: "countdown" };
    case "tick":
      return { ...state, count: state.count - 1 };
    case "listen":
      return { ...state, phase: "listening", target: action.target, played: null };
    case "answer":
      // Microfono e timer possono rispondere quasi insieme: vale solo il primo.
      if (state.phase !== "listening") return state;
      return { ...state, phase: "feedback", played: action.played, results: [...state.results, action.ok] };
    case "next":
      return state.results.length >= action.rounds
        ? { ...state, phase: "done" }
        : { ...state, phase: "countdown", count: COUNTDOWN_FROM };
  }
}

function verdict(correct: number, rounds: number) {
  const rate = correct / rounds;
  if (rate === 1) return "Perfetto, nessun errore!";
  if (rate >= 0.8) return "Ottimo lavoro!";
  if (rate >= 0.5) return "Buon inizio: riprova per migliorare.";
  return "Continua ad allenarti: la tastiera diventerà familiare.";
}

/** Riconoscimento della tastiera: 3-2-1, compare una nota, lo studente la suona entro 5 secondi. */
export function PianoKeysGame({
  exercise,
  stream,
  onComplete,
  onClose,
}: {
  exercise: PianoKeysExercise;
  stream: MediaStream;
  /** Se presente, a fine sessione lo studente può segnare l'esercizio come completato. */
  onComplete?: () => void;
  onClose: () => void;
}) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [tracker] = useState(createNoteTracker);
  const [level, setLevel] = useState(0);
  const { phase, count, target, played, results } = state;
  const lastOk = results[results.length - 1];
  const correct = results.filter(Boolean).length;

  const resumeAudio = usePitchListener(stream, (reading, lvl) => {
    setLevel(lvl);
    // Il tracker ascolta sempre, così a inizio turno sa quale nota sta ancora risuonando.
    const heard = tracker.push(reading);
    if (phase !== "listening" || !heard || !target) return;
    if (heard.pitchClass === target.pitchClass) {
      if (heard.frames >= CORRECT_FRAMES) dispatch({ type: "answer", ok: true, played: heard.pitchClass });
    } else if (heard.frames >= WRONG_FRAMES) {
      dispatch({ type: "answer", ok: false, played: heard.pitchClass });
    }
  });

  useEffect(() => {
    if (phase === "idle" || phase === "done") return;
    const [delay, advance] =
      phase === "countdown"
        ? [
            1000,
            () => {
              if (count > 1) return dispatch({ type: "tick" });
              tracker.reset();
              dispatch({ type: "listen", target: drawTarget(exercise.accidentals, target?.pitchClass ?? null) });
            },
          ]
        : phase === "listening"
          ? [ANSWER_MS, () => dispatch({ type: "answer", ok: false, played: null })]
          : [lastOk ? FEEDBACK_MS.ok : FEEDBACK_MS.ko, () => dispatch({ type: "next", rounds: exercise.rounds })];
    const timer = window.setTimeout(advance, delay);
    return () => window.clearTimeout(timer);
  }, [phase, count, target, lastOk, tracker, exercise.accidentals, exercise.rounds]);

  const start = () => {
    resumeAudio();
    dispatch({ type: "start" });
  };

  if (phase === "idle") {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          Dopo il 3-2-1 compare il nome di una nota: suonala sul pianoforte entro {ANSWER_MS / 1000} secondi, in qualunque ottava.{" "}
          {exercise.rounds} note{exercise.accidentals ? ", tasti neri compresi" : ", solo tasti bianchi"}.
        </p>
        <Button onClick={start} size="lg" className="w-full">
          <Play aria-hidden /> Inizia
        </Button>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="space-y-4 text-center">
        <div>
          <p className="text-5xl leading-tight font-bold tabular-nums">
            {correct}/{exercise.rounds}
          </p>
          <p className="text-sm text-muted-foreground">note riconosciute</p>
        </div>
        <p className="font-semibold">{verdict(correct, exercise.rounds)}</p>
        <div className="flex flex-col gap-2">
          <Button onClick={start}>
            <RotateCcw aria-hidden /> Riprova
          </Button>
          {onComplete && (
            <Button variant="outline" onClick={onComplete}>
              <CircleCheckBig aria-hidden /> Segna come completato
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Chiudi
          </Button>
        </div>
      </div>
    );
  }

  const round = results.length + (phase === "feedback" ? 0 : 1);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>
          Nota {round} di {exercise.rounds}
        </span>
        <span className="flex items-center gap-1 text-success tabular-nums">
          <CircleCheckBig className="size-4" aria-hidden /> {correct}
          <span className="sr-only"> corrette</span>
        </span>
      </div>

      <div className="relative flex min-h-44 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl bg-surface-mid p-4 text-center" aria-live="assertive">
        {phase === "countdown" && (
          <p key={count} className="animate-in text-7xl leading-none font-bold text-brand-ink tabular-nums zoom-in-50 fade-in-0">
            {count}
          </p>
        )}
        {phase === "listening" && target && (
          <>
            <p className="section-label">Suona questa nota</p>
            <p className="text-7xl leading-none font-bold">{target.label}</p>
          </>
        )}
        {phase === "feedback" && target && (
          <>
            {lastOk ? (
              <>
                <Confetti />
                <CircleCheckBig className="size-10 text-success" aria-hidden />
                <p className="text-2xl font-bold text-success">Corretto!</p>
                <p className="text-sm text-muted-foreground">{target.label}</p>
              </>
            ) : (
              <>
                {played === null ? (
                  <TimerOff className="size-10 text-danger" aria-hidden />
                ) : (
                  <CircleX className="size-10 text-danger" aria-hidden />
                )}
                <p className="text-2xl font-bold text-danger">
                  {played === null ? "Tempo scaduto" : `Hai suonato ${noteName(played)}`}
                </p>
                <p className="text-sm font-medium">
                  La nota corretta è <span className="font-bold text-success">{target.label}</span>
                </p>
              </>
            )}
          </>
        )}
        {phase === "listening" && (
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-surface-highest" aria-hidden>
            <div
              key={results.length}
              className="h-full origin-left bg-primary"
              style={{ animation: `countdown-bar ${ANSWER_MS}ms linear forwards` }}
            />
          </div>
        )}
      </div>

      <PianoKeyboard
        className="mx-auto max-w-sm"
        correct={phase === "feedback" ? target?.pitchClass : null}
        wrong={phase === "feedback" && !lastOk ? played : null}
      />

      <div className="flex items-center gap-2 text-muted-foreground">
        <Mic className="size-4 shrink-0" aria-hidden />
        <div className="flex-1">
          <LevelMeter level={level} />
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Termina
        </Button>
      </div>
    </div>
  );
}
