"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import type { IntervalsExercise } from "@/types";
import { drawInterval, type IntervalQuestion } from "./intervals";
import { NoteQuizGame, type GameProps } from "./note-quiz-game";

/** Intervalli: data una nota di partenza e un intervallo, lo studente suona la nota di arrivo. */
export function IntervalsGame({ exercise, ...game }: GameProps<IntervalsExercise>) {
  const { timeLimit, rounds } = exercise;
  return (
    <NoteQuizGame<IntervalQuestion>
      {...game}
      rounds={rounds}
      timeLimit={timeLimit}
      unit="Intervallo"
      caption="intervalli corretti"
      intro={
        <>
          Dopo il 3-2-1 compaiono una nota di partenza e un intervallo: suona la nota di arrivo, in qualunque ottava. Per esempio, per
          una 3ª maggiore sopra Do devi suonare Mi. {rounds} intervalli,{" "}
          {timeLimit ? `${timeLimit} secondi per ciascuno` : "senza limite di tempo"}.
        </>
      }
      draw={(previous) => drawInterval(exercise, previous)}
      isCorrect={(question, heard) => heard.pitchClass === question.answer.pitchClass}
      renderPrompt={({ interval, direction, start }) => (
        <>
          <p className="text-3xl leading-tight font-bold">{interval}</p>
          <p className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
            {direction === "up" ? <ArrowUp className="size-4" aria-hidden /> : <ArrowDown className="size-4" aria-hidden />}
            {direction === "up" ? "sopra" : "sotto"}
          </p>
          <p className="text-5xl leading-none font-bold text-brand-ink">{start.label}</p>
        </>
      )}
      solution={(question) => question.answer.label}
      keyboard={(question) => ({ correct: [question.answer.pitchClass], marked: question.start.pitchClass })}
    />
  );
}
