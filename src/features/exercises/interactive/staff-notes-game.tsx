"use client";

import type { StaffNotesExercise } from "@/types";
import { NoteQuizGame, type GameProps } from "./note-quiz-game";
import { noteName } from "./pitch";
import { CLEF_LABEL, drawStaffNote, midiOf, noteLabel, pitchClassOfNote, type StaffTarget } from "./staff";
import { StaffView } from "./staff-view";

/** Nota sul pentagramma: compare una nota scritta nella chiave scelta, lo studente la suona. */
export function StaffNotesGame({ exercise, ...game }: GameProps<StaffNotesExercise>) {
  const { strictOctave, timeLimit, rounds } = exercise;
  return (
    <NoteQuizGame<StaffTarget>
      {...game}
      rounds={rounds}
      timeLimit={timeLimit}
      unit="Nota"
      caption="note lette correttamente"
      intro={
        <>
          Dopo il 3-2-1 compare una nota sul pentagramma: suonala sul pianoforte
          {strictOctave ? ", nell'ottava in cui è scritta" : ", in qualunque ottava"}. {rounds} note,{" "}
          {timeLimit ? `${timeLimit} secondi per ciascuna` : "senza limite di tempo"}.
        </>
      }
      draw={(previous) => drawStaffNote(exercise, previous)}
      isCorrect={({ note }, heard) => (strictOctave ? heard.midi === midiOf(note) : heard.pitchClass === pitchClassOfNote(note))}
      renderPrompt={({ clef, note }) => (
        <>
          <p className="section-label">{CLEF_LABEL[clef]}</p>
          <StaffView clef={clef} items={[{ note, beats: 4 }]} className="max-w-56" />
        </>
      )}
      solution={({ note }) => noteLabel(note)}
      describeWrong={({ note }, played) =>
        played.pitchClass === pitchClassOfNote(note)
          ? `Nota giusta, ma ${played.midi > midiOf(note) ? "più in alto" : "più in basso"} di quella scritta`
          : `Hai suonato ${noteName(played.pitchClass)}`
      }
      keyboard={({ note }) => ({ correct: [pitchClassOfNote(note)] })}
    />
  );
}
