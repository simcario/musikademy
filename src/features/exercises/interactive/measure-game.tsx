"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ArrowRight, CircleCheckBig, CircleX, TimerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scheduleClick } from "@/features/tools/use-metronome";
import { cn } from "@/lib/utils";
import type { StaffMeasureExercise } from "@/types";
import { Confetti } from "./confetti";
import { Countdown, GameFooter, GameHeader, GameIntro, GameStage, GameSummary } from "./game-ui";
import type { GameProps } from "./note-quiz-game";
import { CORRECT_FRAMES, WRONG_FRAMES, createNoteTracker, noteName } from "./pitch";
import { BEATS_PER_MEASURE, generateMeasure, noteLabel, pitchClassOfNote, type MeasureNote } from "./staff";
import { StaffView } from "./staff-view";
import { usePitchListener } from "./use-microphone";

/** Il metronomo batte una battuta a vuoto prima di quella da suonare. */
const COUNT_IN = BEATS_PER_MEASURE;
/** Quarti di tolleranza dopo la fine della battuta per chiudere l'ultima nota. */
const GRACE_BEATS = 1;
const LAST_BEAT = COUNT_IN + BEATS_PER_MEASURE + GRACE_BEATS;
/** Il clic del metronomo entra nel microfono: per questi secondi dopo ogni clic le letture non contano. */
const CLICK_MASK = 0.09;
const CLICK_VOLUME = 0.6;
/** Quanto resta a video la battuta riuscita prima della successiva; dopo un errore si prosegue a mano. */
const SUCCESS_MS = 2200;

/** Perché la battuta non è riuscita: nota sbagliata (`played`) o battuta finita prima dell'ultima nota. */
type Failure = { reason: "wrong"; played: number } | { reason: "late" };

interface State {
  phase: "idle" | "counting" | "playing" | "feedback" | "done";
  measure: MeasureNote[];
  /** Quarti trascorsi dal primo clic: i primi `COUNT_IN` sono la battuta a vuoto. */
  beat: number;
  /** Quante note della battuta sono già state suonate. */
  step: number;
  failure: Failure | null;
  results: boolean[];
}

type Action =
  | { type: "round"; measure: MeasureNote[]; fresh: boolean }
  | { type: "beat"; index: number }
  | { type: "hit"; step: number }
  | { type: "fail"; played: number }
  | { type: "done" };

const INITIAL: State = { phase: "idle", measure: [], beat: 0, step: 0, failure: null, results: [] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "round":
      return { ...INITIAL, phase: "counting", measure: action.measure, results: action.fresh ? [] : state.results };
    case "beat":
      if (state.phase === "counting") {
        return { ...state, beat: action.index, phase: action.index >= COUNT_IN ? "playing" : "counting" };
      }
      if (state.phase !== "playing") return state;
      return action.index >= LAST_BEAT
        ? { ...state, phase: "feedback", failure: { reason: "late" }, results: [...state.results, false] }
        : { ...state, beat: action.index };
    case "hit": {
      // La stessa nota resta rilevata per più letture: conta solo quella del passo corrente.
      if (state.phase !== "playing" || action.step !== state.step) return state;
      const step = state.step + 1;
      return step < state.measure.length ? { ...state, step } : { ...state, step, phase: "feedback", results: [...state.results, true] };
    }
    case "fail":
      if (state.phase !== "playing") return state;
      return { ...state, phase: "feedback", failure: { reason: "wrong", played: action.played }, results: [...state.results, false] };
    case "done":
      return { ...state, phase: "done" };
  }
}

/**
 * Battuta sul pentagramma: compare una battuta in 4/4, il metronomo batte una battuta a vuoto
 * e lo studente suona le note in ordine entro la battuta successiva.
 */
export function MeasureGame({ exercise, stream, onComplete, onClose }: GameProps<StaffMeasureExercise>) {
  const { clef, difficulty, bpm, rounds } = exercise;
  const beatLength = 60 / bpm;
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [tracker] = useState(createNoteTracker);
  const [level, setLevel] = useState(0);
  const { phase, measure, beat, step, failure, results } = state;
  const lastOk = results[results.length - 1];
  const correct = results.filter(Boolean).length;
  const running = phase === "counting" || phase === "playing";

  const clicks = useRef<AudioContext | null>(null);
  const clickOut = useRef<GainNode | null>(null);
  /** Istante (clock audio) del primo clic del turno. */
  const roundStart = useRef(0);

  /** Nuova battuta: i clic del turno sono programmati subito sul clock audio, come nel metronomo. */
  const beginRound = useCallback(
    (fresh: boolean) => {
      const ctx = (clicks.current ??= new AudioContext());
      void ctx.resume();
      const out = ctx.createGain();
      out.gain.value = CLICK_VOLUME;
      out.connect(ctx.destination);
      clickOut.current = out;
      const start = ctx.currentTime + 0.2;
      for (let i = 0; i < COUNT_IN + BEATS_PER_MEASURE; i++) {
        scheduleClick(ctx, out, start + i * beatLength, i % BEATS_PER_MEASURE === 0 ? "accent" : "beat");
      }
      roundStart.current = start;
      dispatch({ type: "round", measure: generateMeasure(clef, difficulty), fresh });
    },
    [beatLength, clef, difficulty],
  );

  const next = useCallback(() => {
    if (results.length >= rounds) dispatch({ type: "done" });
    else beginRound(false);
  }, [results.length, rounds, beginRound]);

  const resumeAudio = usePitchListener(stream, (reading, lvl) => {
    setLevel(lvl);
    const ctx = clicks.current;
    if (ctx && running) {
      const elapsed = ctx.currentTime - roundStart.current;
      const clicking = elapsed >= 0 && elapsed < (COUNT_IN + BEATS_PER_MEASURE) * beatLength;
      if (clicking && elapsed % beatLength < CLICK_MASK) return;
    }
    const heard = tracker.push(reading);
    if (phase !== "playing" || !heard) return;
    if (heard.pitchClass === pitchClassOfNote(measure[step].note)) {
      if (heard.frames >= CORRECT_FRAMES) dispatch({ type: "hit", step });
      // La nota appena suonata continua a risuonare mentre si passa alla successiva: non è un errore.
    } else if (
      (step === 0 || heard.pitchClass !== pitchClassOfNote(measure[step - 1].note)) &&
      heard.frames >= WRONG_FRAMES
    ) {
      dispatch({ type: "fail", played: heard.pitchClass });
    }
  });

  // I quarti seguono il clock audio, non un timer: così il conteggio a video resta sul clic.
  useEffect(() => {
    const ctx = clicks.current;
    if (!running || !ctx) return;
    let frame = 0;
    let last = -1;
    const loop = () => {
      const index = Math.floor((ctx.currentTime - roundStart.current) / beatLength);
      if (index >= 0 && index !== last) {
        last = index;
        if (index === COUNT_IN) tracker.reset();
        dispatch({ type: "beat", index });
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running, phase, beatLength, tracker]);

  useEffect(() => {
    if (phase !== "feedback") return;
    // A turno finito i clic già programmati non devono più suonare.
    clickOut.current?.disconnect();
    if (!lastOk) return;
    const timer = window.setTimeout(next, SUCCESS_MS);
    return () => window.clearTimeout(timer);
  }, [phase, lastOk, next]);

  useEffect(
    () => () => {
      void clicks.current?.close();
      clicks.current = null;
    },
    [],
  );

  const start = () => {
    resumeAudio();
    beginRound(true);
  };

  if (phase === "idle") {
    return (
      <GameIntro onStart={start}>
        Compare una battuta in 4/4: il metronomo ({bpm} BPM) batte quattro quarti a vuoto per darti il tempo di leggerla, poi suonala a
        tempo, una nota dopo l&apos;altra, entro la battuta successiva. {rounds} battute. Tieni il volume del dispositivo moderato.
      </GameIntro>
    );
  }

  if (phase === "done") {
    return (
      <GameSummary correct={correct} total={rounds} caption="battute corrette" onRetry={start} onComplete={onComplete} onClose={onClose} />
    );
  }

  const feedback = phase === "feedback";
  const round = results.length + (feedback ? 0 : 1);
  const ResultIcon = lastOk ? CircleCheckBig : failure?.reason === "late" ? TimerOff : CircleX;
  return (
    <div className="space-y-4">
      <GameHeader label={`Battuta ${round} di ${rounds} · ${bpm} BPM`} correct={correct} />

      <GameStage>
        {feedback && lastOk && <Confetti />}
        {phase === "counting" && (
          <>
            <p className="section-label">Leggi la battuta, poi suona</p>
            <Countdown count={Math.min(beat, COUNT_IN - 1) + 1} />
          </>
        )}
        {phase === "playing" && (
          <>
            <p className="section-label">Suona!</p>
            <div className="flex h-[72px] items-center gap-3" aria-hidden>
              {Array.from({ length: BEATS_PER_MEASURE }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full text-base font-bold tabular-nums",
                    beat - COUNT_IN === i ? "bg-primary text-primary-foreground" : "bg-surface-highest text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
              ))}
            </div>
          </>
        )}
        {feedback && (
          <p className={cn("flex items-center gap-2 text-xl font-bold", lastOk ? "text-success" : "text-danger")}>
            <ResultIcon className="size-7 shrink-0" aria-hidden />
            {lastOk
              ? "Corretto!"
              : failure?.reason === "wrong"
                ? `Hai suonato ${noteName(failure.played)} al posto di ${noteLabel(measure[step].note)}`
                : "Battuta finita: non hai suonato tutte le note"}
          </p>
        )}
        <StaffView
          clef={clef}
          timeSignature
          className="max-w-md"
          items={measure.map((m, i) => ({
            ...m,
            tone: i < step ? "done" : feedback && failure?.reason === "wrong" && i === step ? "wrong" : undefined,
          }))}
        />
        {feedback && <p className="text-sm font-medium">{measure.map((m) => noteLabel(m.note)).join(" – ")}</p>}
      </GameStage>

      {feedback && !lastOk && (
        <Button className="w-full" onClick={next}>
          {results.length >= rounds ? "Vedi il risultato" : "Prossima battuta"} <ArrowRight aria-hidden />
        </Button>
      )}

      <GameFooter level={level} onClose={onClose} />
    </div>
  );
}
