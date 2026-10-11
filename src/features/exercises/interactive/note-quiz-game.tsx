"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { CircleCheckBig, CircleX, Eye, TimerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Confetti } from "./confetti";
import { COUNTDOWN_FROM, Countdown, GameFooter, GameHeader, GameIntro, GameStage, GameSummary } from "./game-ui";
import { PianoKeyboard } from "./piano-keyboard";
import { CORRECT_FRAMES, WRONG_FRAMES, createNoteTracker, noteName } from "./pitch";
import { usePitchListener } from "./use-microphone";

/** Quanto resta a video l'esito prima della domanda successiva. */
const FEEDBACK_MS = { ok: 1800, ko: 3500 };

/** Nota suonata: classe di altezza e altezza esatta (numero MIDI). */
export interface Heard {
  pitchClass: number;
  midi: number;
}

interface State<T> {
  phase: "idle" | "countdown" | "listening" | "feedback" | "done";
  count: number;
  target: T | null;
  /** Nota suonata nell'ultimo turno; `null` se non è arrivata una risposta. */
  played: Heard | null;
  results: boolean[];
}

type Action<T> =
  | { type: "start" }
  | { type: "tick" }
  | { type: "listen"; target: T }
  | { type: "answer"; ok: boolean; played: Heard | null }
  | { type: "next"; rounds: number };

const INITIAL: State<never> = { phase: "idle", count: COUNTDOWN_FROM, target: null, played: null, results: [] };

function reducer<T>(state: State<T>, action: Action<T>): State<T> {
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

export interface NoteQuizProps<T> {
  stream: MediaStream;
  rounds: number;
  /** Secondi per rispondere; `null` = senza limite (lo studente può chiedere la soluzione). */
  timeLimit: number | null;
  /** Spiegazione nella schermata iniziale. */
  intro: React.ReactNode;
  /** Nome di una domanda nell'intestazione, es. "Nota". */
  unit: string;
  /** Cosa conta il punteggio, es. "note riconosciute". */
  caption: string;
  /** Nuova domanda a caso, diversa dalla precedente. */
  draw: (previous: T | null) => T;
  isCorrect: (target: T, heard: Heard) => boolean;
  renderPrompt: (target: T) => React.ReactNode;
  /** Nome della nota da suonare, mostrato dopo un errore. */
  solution: (target: T) => string;
  /** Messaggio per la nota sbagliata; di norma "Hai suonato …". */
  describeWrong?: (target: T, played: Heard) => string;
  /** Note da evidenziare sulla tastiera a fine turno: quella corretta ed eventualmente quella di partenza. */
  keyboard: (target: T) => { correct: number[]; marked?: number };
  /** Se presente, a fine sessione lo studente può segnare l'esercizio come completato. */
  onComplete?: () => void;
  onClose: () => void;
}

/** Props comuni ai giochi: le impostazioni dell'esercizio più microfono e chiusura. */
export type GameProps<E> = { exercise: E } & Pick<NoteQuizProps<unknown>, "stream" | "onComplete" | "onClose">;

/**
 * Gioco a domande con una sola nota per risposta: 3-2-1, compare la domanda, lo studente suona.
 * Risposta giusta → coriandoli; sbagliata o fuori tempo → errore e nota corretta sulla tastiera.
 */
export function NoteQuizGame<T>(props: NoteQuizProps<T>) {
  const { stream, rounds, timeLimit, onComplete, onClose } = props;
  const [state, dispatch] = useReducer(reducer<T>, INITIAL as State<T>);
  const [tracker] = useState(createNoteTracker);
  const [level, setLevel] = useState(0);
  const { phase, count, target, played, results } = state;
  const lastOk = results[results.length - 1];
  const correct = results.filter(Boolean).length;
  const limitMs = timeLimit ? timeLimit * 1000 : null;

  // Le funzioni del gioco cambiano identità a ogni render: i timer leggono sempre le più recenti.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  const resumeAudio = usePitchListener(stream, (reading, lvl) => {
    setLevel(lvl);
    // Il tracker ascolta sempre, così a inizio turno sa quale nota sta ancora risuonando.
    const heard = tracker.push(reading);
    if (phase !== "listening" || !heard || target === null) return;
    if (props.isCorrect(target, heard)) {
      if (heard.frames >= CORRECT_FRAMES) dispatch({ type: "answer", ok: true, played: heard });
    } else if (heard.frames >= WRONG_FRAMES) {
      dispatch({ type: "answer", ok: false, played: heard });
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
        dispatch({ type: "listen", target: latest.current.draw(target) });
      };
    } else if (phase === "listening" && limitMs) {
      delay = limitMs;
      advance = () => dispatch({ type: "answer", ok: false, played: null });
    } else if (phase === "feedback") {
      delay = lastOk ? FEEDBACK_MS.ok : FEEDBACK_MS.ko;
      advance = () => dispatch({ type: "next", rounds });
    } else return;
    const timer = window.setTimeout(advance, delay);
    return () => window.clearTimeout(timer);
  }, [phase, count, target, lastOk, limitMs, rounds, tracker]);

  const start = () => {
    resumeAudio();
    dispatch({ type: "start" });
  };

  if (phase === "idle") return <GameIntro onStart={start}>{props.intro}</GameIntro>;
  if (phase === "done") {
    return <GameSummary correct={correct} total={rounds} caption={props.caption} onRetry={start} onComplete={onComplete} onClose={onClose} />;
  }

  const feedback = phase === "feedback";
  const round = results.length + (feedback ? 0 : 1);
  const keys = feedback && target !== null ? props.keyboard(target) : null;
  const ResultIcon = lastOk ? CircleCheckBig : played ? CircleX : TimerOff;
  return (
    <div className="space-y-4">
      <GameHeader label={`${props.unit} ${round} di ${rounds}`} correct={correct} />

      <GameStage timerMs={phase === "listening" ? limitMs : null} timerKey={results.length}>
        {phase === "countdown" && <Countdown count={count} />}
        {phase !== "countdown" && target !== null && (
          <>
            {feedback && lastOk && <Confetti />}
            {feedback && (
              <p className={cn("flex items-center gap-2 text-xl font-bold", lastOk ? "text-success" : "text-danger")}>
                <ResultIcon className="size-7 shrink-0" aria-hidden />
                {lastOk
                  ? "Corretto!"
                  : played
                    ? (props.describeWrong?.(target, played) ?? `Hai suonato ${noteName(played.pitchClass)}`)
                    : limitMs
                      ? "Tempo scaduto"
                      : "Ecco la soluzione"}
              </p>
            )}
            {props.renderPrompt(target)}
            {feedback && (
              <p className="text-sm font-medium">
                {lastOk ? "Hai suonato" : "La nota corretta è"} <span className="font-bold text-success">{props.solution(target)}</span>
              </p>
            )}
          </>
        )}
      </GameStage>

      <PianoKeyboard className="mx-auto max-w-sm" correct={keys?.correct} marked={keys?.marked} wrong={feedback && !lastOk ? played?.pitchClass : null} />

      {phase === "listening" && !limitMs && (
        <Button variant="outline" className="w-full" onClick={() => dispatch({ type: "answer", ok: false, played: null })}>
          <Eye aria-hidden /> Non la so: mostra la soluzione
        </Button>
      )}

      <GameFooter level={level} onClose={onClose} />
    </div>
  );
}
