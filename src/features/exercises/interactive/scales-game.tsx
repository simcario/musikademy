"use client";

import { useEffect, useReducer, useState } from "react";
import { ArrowRight, CircleCheckBig, CircleX, Eye, TimerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScalesExercise } from "@/types";
import { Confetti } from "./confetti";
import { COUNTDOWN_FROM, Countdown, GameFooter, GameHeader, GameIntro, GameStage, GameSummary } from "./game-ui";
import { PianoKeyboard } from "./piano-keyboard";
import { CORRECT_FRAMES, WRONG_FRAMES, createNoteTracker, noteName } from "./pitch";
import type { GameProps } from "./note-quiz-game";
import { drawScale, type Scale } from "./scales";
import { usePitchListener } from "./use-microphone";

/** Quanto resta a video la scala riuscita prima della successiva; dopo un errore si prosegue a mano, per studiare la soluzione. */
const SUCCESS_MS = 2200;

/** Perché la scala non è riuscita: nota sbagliata (`played`), tempo scaduto o soluzione richiesta. */
type Failure = { reason: "wrong"; played: number } | { reason: "timeout" } | { reason: "revealed" };

interface State {
  phase: "idle" | "countdown" | "playing" | "feedback" | "done";
  count: number;
  scale: Scale | null;
  /** Quante note della scala sono già state suonate. */
  step: number;
  failure: Failure | null;
  results: boolean[];
}

type Action =
  | { type: "start" }
  | { type: "tick" }
  | { type: "play"; scale: Scale }
  | { type: "hit"; step: number }
  | { type: "fail"; failure: Failure }
  | { type: "next"; rounds: number };

const INITIAL: State = { phase: "idle", count: COUNTDOWN_FROM, scale: null, step: 0, failure: null, results: [] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "start":
      return { ...INITIAL, phase: "countdown" };
    case "tick":
      return { ...state, count: state.count - 1 };
    case "play":
      return { ...state, phase: "playing", scale: action.scale, step: 0, failure: null };
    case "hit": {
      // La stessa nota resta rilevata per più letture: conta solo quella del passo corrente.
      if (state.phase !== "playing" || !state.scale || action.step !== state.step) return state;
      const step = state.step + 1;
      return step < state.scale.notes.length
        ? { ...state, step }
        : { ...state, step, phase: "feedback", results: [...state.results, true] };
    }
    case "fail":
      if (state.phase !== "playing") return state;
      return { ...state, phase: "feedback", failure: action.failure, results: [...state.results, false] };
    case "next":
      return state.results.length >= action.rounds
        ? { ...state, phase: "done" }
        : { ...state, phase: "countdown", count: COUNTDOWN_FROM };
  }
}

/** Scale musicali: 3-2-1, compare il nome di una scala, lo studente la suona ascendente per un'ottava. */
export function ScalesGame({ exercise, stream, onComplete, onClose }: GameProps<ScalesExercise>) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [tracker] = useState(createNoteTracker);
  const [level, setLevel] = useState(0);
  const { phase, count, scale, step, failure, results } = state;
  const lastOk = results[results.length - 1];
  const correct = results.filter(Boolean).length;
  const { rounds, scale: scaleType, accidentals, timeLimit } = exercise;
  const limitMs = timeLimit ? timeLimit * 1000 : null;

  const resumeAudio = usePitchListener(stream, (reading, lvl) => {
    setLevel(lvl);
    const heard = tracker.push(reading);
    if (phase !== "playing" || !heard || !scale) return;
    if (heard.pitchClass === scale.notes[step].pitchClass) {
      if (heard.frames >= CORRECT_FRAMES) dispatch({ type: "hit", step });
      // La nota appena suonata continua a risuonare mentre si passa alla successiva: non è un errore.
    } else if (heard.pitchClass !== scale.notes[step - 1]?.pitchClass && heard.frames >= WRONG_FRAMES) {
      dispatch({ type: "fail", failure: { reason: "wrong", played: heard.pitchClass } });
    }
  });

  useEffect(() => {
    let delay: number;
    let advance: () => void;
    if (phase === "countdown") {
      delay = 1000;
      advance = () => {
        if (count > 1) return dispatch({ type: "tick" });
        tracker.reset();
        dispatch({ type: "play", scale: drawScale({ scale: scaleType, accidentals }, scale?.name) });
      };
    } else if (phase === "playing" && limitMs) {
      delay = limitMs;
      advance = () => dispatch({ type: "fail", failure: { reason: "timeout" } });
    } else if (phase === "feedback" && lastOk) {
      delay = SUCCESS_MS;
      advance = () => dispatch({ type: "next", rounds });
    } else return;
    const timer = window.setTimeout(advance, delay);
    return () => window.clearTimeout(timer);
    // `step` non è tra le dipendenze: il tempo vale per l'intera scala, non riparte a ogni nota.
  }, [phase, count, scale, lastOk, limitMs, tracker, rounds, scaleType, accidentals]);

  const start = () => {
    resumeAudio();
    dispatch({ type: "start" });
  };

  if (phase === "idle") {
    return (
      <GameIntro onStart={start}>
        Dopo il 3-2-1 compare il nome di una scala: suonala in senso ascendente per un&apos;ottava, dalla tonica alla tonica, una nota
        alla volta. {rounds} scale, {timeLimit ? `${timeLimit} secondi per ciascuna` : "senza limite di tempo"}.
      </GameIntro>
    );
  }

  if (phase === "done") {
    return (
      <GameSummary
        correct={correct}
        total={rounds}
        caption="scale corrette"
        onRetry={start}
        onComplete={onComplete}
        onClose={onClose}
      />
    );
  }

  const feedback = phase === "feedback";
  const round = results.length + (feedback ? 0 : 1);
  const last = results.length >= rounds;
  return (
    <div className="space-y-4">
      <GameHeader label={`Scala ${round} di ${rounds}`} correct={correct} />

      <GameStage timerMs={phase === "playing" ? limitMs : null} timerKey={results.length}>
        {phase === "countdown" && <Countdown count={count} />}
        {phase !== "countdown" && scale && (
          <>
            {feedback && lastOk && <Confetti />}
            {feedback ? (
              <p className={cn("flex items-center gap-2 text-xl font-bold", lastOk ? "text-success" : "text-danger")}>
                {lastOk ? (
                  <CircleCheckBig className="size-7 shrink-0" aria-hidden />
                ) : failure?.reason === "timeout" ? (
                  <TimerOff className="size-7 shrink-0" aria-hidden />
                ) : (
                  <CircleX className="size-7 shrink-0" aria-hidden />
                )}
                {lastOk
                  ? "Corretto!"
                  : failure?.reason === "wrong"
                    ? `Hai suonato ${noteName(failure.played)} al posto di ${scale.notes[step].label}`
                    : failure?.reason === "timeout"
                      ? "Tempo scaduto"
                      : "Ecco la soluzione"}
              </p>
            ) : (
              <p className="section-label">Suona la scala ascendente</p>
            )}
            <p className="text-4xl leading-tight font-bold">{scale.name}</p>
            {/* Durante l'esecuzione compaiono solo le note già suonate; a fine turno l'intera scala. */}
            <ol className="flex flex-wrap justify-center gap-1.5 pt-1" aria-label="Note della scala">
              {scale.notes.map((note, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex h-8 min-w-9 items-center justify-center rounded-lg px-1.5 text-[13px] font-semibold",
                    i < step
                      ? "bg-success-soft text-success"
                      : feedback
                        ? "bg-card text-foreground"
                        : "bg-surface-highest text-transparent",
                  )}
                >
                  {i < step || feedback ? note.label : "·"}
                </li>
              ))}
            </ol>
          </>
        )}
      </GameStage>

      <PianoKeyboard
        className="mx-auto max-w-sm"
        correct={feedback && scale ? scale.notes.map((n) => n.pitchClass) : []}
        wrong={feedback && failure?.reason === "wrong" ? failure.played : null}
      />

      {phase === "playing" && (
        <Button variant="outline" className="w-full" onClick={() => dispatch({ type: "fail", failure: { reason: "revealed" } })}>
          <Eye aria-hidden /> Non la ricordo: mostra la soluzione
        </Button>
      )}
      {feedback && !lastOk && (
        <Button className="w-full" onClick={() => dispatch({ type: "next", rounds })}>
          {last ? "Vedi il risultato" : "Prossima scala"} <ArrowRight aria-hidden />
        </Button>
      )}

      <GameFooter level={level} onClose={onClose} />
    </div>
  );
}
