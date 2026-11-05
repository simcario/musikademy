"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CircleCheckBig, CircleX, Ear, RotateCcw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EarNotesExercise } from "@/types";
import { Confetti } from "./confetti";
import { GameHeader, GameIntro, GameStage, GameSummary, ListenFooter } from "./game-ui";
import { drawEarNotes, type EarNotesQuestion } from "./ear";
import { usePlayback, type PlaybackEvent } from "./use-playback";

/** Props dei giochi d'ascolto: niente microfono. */
export interface ListenGameProps<E> {
  exercise: E;
  onComplete?: () => void;
  onClose: () => void;
}

const STEP = 0.55;
const NOTE = 0.5;
/** Pausa tra la scala e la nota da indovinare. */
const GAP = 0.8;
const SUCCESS_MS = 1600;

const TARGET = "target";

function scaleEvents(q: EarNotesQuestion): PlaybackEvent[] {
  return q.notes.map((n, i) => ({ at: i * STEP, duration: NOTE, notes: [n.midi], mark: i }));
}

const targetEvent = (q: EarNotesQuestion, at = 0): PlaybackEvent => ({
  at,
  duration: 1.1,
  notes: [q.notes[q.answer].midi],
  mark: TARGET,
});

/**
 * Indovina la nota: il sistema suona le prime cinque note di una scala, poi una di esse;
 * lo studente sceglie quale ha sentito.
 */
export function EarNotesGame({ exercise, onComplete, onClose }: ListenGameProps<EarNotesExercise>) {
  const { rounds } = exercise;
  const playback = usePlayback();
  const [phase, setPhase] = useState<"idle" | "listening" | "answering" | "feedback" | "done">("idle");
  const [question, setQuestion] = useState<EarNotesQuestion | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const correct = results.filter(Boolean).length;
  const lastOk = results.at(-1);

  /** `replay`: lo studente riascolta, la fase non cambia. */
  const listen = (q: EarNotesQuestion, replay = false) => {
    if (!replay) setPhase("listening");
    playback.play([...scaleEvents(q), targetEvent(q, q.notes.length * STEP + GAP)], replay ? undefined : () => setPhase("answering"));
  };

  const ask = (fresh: boolean) => {
    const q = drawEarNotes(exercise, fresh ? null : question);
    setQuestion(q);
    setChosen(null);
    listen(q);
  };

  const start = () => {
    setResults([]);
    ask(true);
  };

  const answer = (i: number) => {
    if (!question || phase !== "answering") return;
    playback.stop();
    setChosen(i);
    setResults((r) => [...r, i === question.answer]);
    setPhase("feedback");
  };

  const next = () => {
    if (results.length >= rounds) {
      playback.stop();
      setPhase("done");
    } else ask(false);
  };

  // Risposta giusta: si prosegue da soli; dopo un errore lo studente può riascoltare e poi va avanti.
  const latestNext = useRef(next);
  useEffect(() => {
    latestNext.current = next;
  });
  useEffect(() => {
    if (phase !== "feedback" || !lastOk) return;
    const timer = window.setTimeout(() => latestNext.current(), SUCCESS_MS);
    return () => window.clearTimeout(timer);
  }, [phase, lastOk, results.length]);

  if (phase === "idle") {
    return (
      <GameIntro onStart={start}>
        Ascolta le prime cinque note di una scala, poi una di esse: scegli quale hai sentito. Puoi riascoltare quante volte vuoi. {rounds}{" "}
        domande.
      </GameIntro>
    );
  }
  if (phase === "done") {
    return <GameSummary correct={correct} total={rounds} caption="note riconosciute" onRetry={start} onComplete={onComplete} onClose={onClose} />;
  }
  if (!question) return null;

  const feedback = phase === "feedback";
  const round = results.length + (feedback ? 0 : 1);
  return (
    <div className="space-y-4">
      <GameHeader label={`Domanda ${round} di ${rounds}`} correct={correct} />

      <GameStage>
        {feedback && lastOk && <Confetti />}
        <p className="section-label">{question.scaleName}</p>
        {feedback ? (
          <p className={cn("flex items-center gap-2 text-xl font-bold", lastOk ? "text-success" : "text-danger")}>
            {lastOk ? <CircleCheckBig className="size-7" aria-hidden /> : <CircleX className="size-7" aria-hidden />}
            {lastOk ? "Corretto!" : `Era ${question.notes[question.answer].label}`}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-xl font-bold">
            <Ear className="size-7 text-brand-ink" aria-hidden />
            {playback.current === TARGET ? "Quale nota è questa?" : phase === "listening" ? "Ascolta la scala…" : "Quale nota hai sentito?"}
          </p>
        )}
      </GameStage>

      <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Le cinque note">
        {question.notes.map((n, i) => {
          const isAnswer = feedback && i === question.answer;
          const isWrong = feedback && i === chosen && i !== question.answer;
          return (
            <button
              key={n.degree}
              type="button"
              disabled={phase !== "answering"}
              onClick={() => answer(i)}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center rounded-xl border text-sm font-bold transition-all active:scale-95 disabled:cursor-default",
                isAnswer
                  ? "border-success bg-success-soft text-success"
                  : isWrong
                    ? "border-danger bg-danger-soft text-danger"
                    : playback.current === i
                      ? "border-primary bg-indigo-soft text-brand-ink"
                      : "border-border bg-card hover:bg-muted",
              )}
            >
              <span className="text-base">{n.label}</span>
              <span className="text-[11px] font-semibold text-muted-foreground">{n.degree}°</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={phase === "listening"} onClick={() => listen(question, true)}>
          <RotateCcw aria-hidden /> Riascolta tutto
        </Button>
        <Button
          variant="outline"
          disabled={phase === "listening"}
          onClick={() => playback.play([targetEvent(question)])}
        >
          <Volume2 aria-hidden /> Solo la nota
        </Button>
      </div>

      {feedback && !lastOk && (
        <Button className="w-full" onClick={next}>
          {results.length >= rounds ? "Vedi il risultato" : "Prossima domanda"} <ArrowRight aria-hidden />
        </Button>
      )}

      <ListenFooter onClose={onClose} />
    </div>
  );
}
