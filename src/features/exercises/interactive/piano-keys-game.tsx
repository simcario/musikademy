"use client";

import type { PianoKeysExercise } from "@/types";
import { NoteQuizGame, type GameProps } from "./note-quiz-game";
import { NOTE_NAMES_FLAT, NOTE_NAMES_SHARP, WHITE_KEYS } from "./pitch";

const ANSWER_SECONDS = 5;

interface Target {
  pitchClass: number;
  label: string;
}

const ALL_KEYS = Array.from({ length: 12 }, (_, i) => i);

/** Nota a caso, mai uguale alla precedente; i tasti neri escono come diesis o come bemolle. */
function drawTarget(accidentals: boolean, previous: Target | null): Target {
  const pool = (accidentals ? ALL_KEYS : WHITE_KEYS).filter((pc) => pc !== previous?.pitchClass);
  const pitchClass = pool[Math.floor(Math.random() * pool.length)];
  const names = Math.random() < 0.5 ? NOTE_NAMES_SHARP : NOTE_NAMES_FLAT;
  return { pitchClass, label: names[pitchClass] };
}

/** Riconoscimento della tastiera: compare il nome di una nota, lo studente la suona entro 5 secondi. */
export function PianoKeysGame({ exercise, ...game }: GameProps<PianoKeysExercise>) {
  return (
    <NoteQuizGame<Target>
      {...game}
      rounds={exercise.rounds}
      timeLimit={ANSWER_SECONDS}
      unit="Nota"
      caption="note riconosciute"
      intro={
        <>
          Dopo il 3-2-1 compare il nome di una nota: suonala sul pianoforte entro {ANSWER_SECONDS} secondi, in qualunque ottava.{" "}
          {exercise.rounds} note{exercise.accidentals ? ", tasti neri compresi" : ", solo tasti bianchi"}.
        </>
      }
      draw={(previous) => drawTarget(exercise.accidentals, previous)}
      isCorrect={(target, heard) => heard.pitchClass === target.pitchClass}
      renderPrompt={(target) => (
        <>
          <p className="section-label">Suona questa nota</p>
          <p className="text-7xl leading-none font-bold">{target.label}</p>
        </>
      )}
      solution={(target) => target.label}
      keyboard={(target) => ({ correct: [target.pitchClass] })}
    />
  );
}
