"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CircleCheckBig, CircleX, Ear, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProgressionsExercise } from "@/types";
import { voiceChord } from "./chords";
import { Confetti } from "./confetti";
import { drawProgression, progressionLabel, progressionNumerals, type Progression, type ProgressionQuestion } from "./ear";
import type { ListenGameProps } from "./ear-notes-game";
import { GameHeader, GameIntro, GameStage, GameSummary, ListenFooter } from "./game-ui";
import { usePlayback, type PlaybackEvent } from "./use-playback";

const CHORD_STEP = 1.2;
const CHORD_LENGTH = 1.1;
const SUCCESS_MS = 1800;

const events = (p: Progression, tag = ""): PlaybackEvent[] =>
  p.chords.map((c, i) => ({ at: i * CHORD_STEP, duration: CHORD_LENGTH, notes: voiceChord(c), mark: `${tag}${i}` }));

/**
 * Indovina la progressione: il sistema suona una progressione di accordi nella tonalità indicata
 * e propone quattro progressioni; lo studente sceglie quella che ha sentito.
 */
export function ProgressionsGame({ exercise, onComplete, onClose }: ListenGameProps<ProgressionsExercise>) {
  const { rounds } = exercise;
  const playback = usePlayback();
  const [phase, setPhase] = useState<"idle" | "listening" | "answering" | "feedback" | "done">("idle");
  const [question, setQuestion] = useState<ProgressionQuestion | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const correct = results.filter(Boolean).length;
  const lastOk = results.at(-1);

  const listen = (q: ProgressionQuestion, replay = false) => {
    if (!replay) setPhase("listening");
    playback.play(events(q.options[q.answer]), replay ? undefined : () => setPhase("answering"));
  };

  const ask = () => {
    const q = drawProgression(exercise);
    setQuestion(q);
    setChosen(null);
    listen(q);
  };

  const start = () => {
    setResults([]);
    ask();
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
    } else ask();
  };
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
        Ascolta una progressione di {exercise.length} accordi, poi scegli quella giusta tra le quattro proposte. Puoi riascoltarla quante
        volte vuoi; dopo la risposta puoi ascoltare anche le altre. {rounds} progressioni.
      </GameIntro>
    );
  }
  if (phase === "done") {
    return (
      <GameSummary correct={correct} total={rounds} caption="progressioni riconosciute" onRetry={start} onComplete={onComplete} onClose={onClose} />
    );
  }
  if (!question) return null;

  const feedback = phase === "feedback";
  const round = results.length + (feedback ? 0 : 1);
  const playingIndex = typeof playback.current === "string" && !playback.current.includes(":") ? Number(playback.current) : null;
  return (
    <div className="space-y-4">
      <GameHeader label={`Progressione ${round} di ${rounds}`} correct={correct} />

      <GameStage>
        {feedback && lastOk && <Confetti />}
        <p className="section-label">Tonalità di {question.keyName}</p>
        {feedback ? (
          <p className={cn("flex items-center gap-2 text-xl font-bold", lastOk ? "text-success" : "text-danger")}>
            {lastOk ? <CircleCheckBig className="size-7" aria-hidden /> : <CircleX className="size-7" aria-hidden />}
            {lastOk ? "Corretto!" : "Non era questa"}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-xl font-bold">
            <Ear className="size-7 text-brand-ink" aria-hidden />
            {phase === "listening" ? "Ascolta…" : "Quale progressione hai sentito?"}
          </p>
        )}
        <div className="flex gap-2" aria-hidden>
          {Array.from({ length: exercise.length }, (_, i) => (
            <span key={i} className={cn("size-3 rounded-full", playingIndex === i ? "bg-primary" : "bg-surface-highest")} />
          ))}
        </div>
      </GameStage>

      <ul className="grid gap-2" aria-label="Progressioni proposte">
        {question.options.map((p, i) => {
          const isAnswer = feedback && i === question.answer;
          const isWrong = feedback && i === chosen && i !== question.answer;
          return (
            <li key={i} className="flex items-stretch gap-2">
              <button
                type="button"
                disabled={phase !== "answering"}
                onClick={() => answer(i)}
                className={cn(
                  "min-h-14 flex-1 rounded-xl border px-3 py-2 text-left transition-all active:scale-[0.99] disabled:cursor-default",
                  isAnswer ? "border-success bg-success-soft" : isWrong ? "border-danger bg-danger-soft" : "border-border bg-card hover:bg-muted",
                )}
              >
                <span className="block font-bold">{progressionNumerals(p)}</span>
                <span className="block text-sm text-muted-foreground">{progressionLabel(p)}</span>
              </button>
              {feedback && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-auto w-12"
                  aria-label={`Ascolta ${progressionLabel(p)}`}
                  onClick={() => playback.play(events(p, `${i}:`))}
                >
                  <Play aria-hidden />
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <Button variant="outline" className="w-full" disabled={phase === "listening"} onClick={() => listen(question, true)}>
        <RotateCcw aria-hidden /> Riascolta la progressione
      </Button>

      {feedback && !lastOk && (
        <Button className="w-full" onClick={next}>
          {results.length >= rounds ? "Vedi il risultato" : "Prossima progressione"} <ArrowRight aria-hidden />
        </Button>
      )}

      <ListenFooter onClose={onClose} />
    </div>
  );
}
