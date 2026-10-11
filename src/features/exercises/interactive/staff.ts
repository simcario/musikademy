import type { Clef, MeasureDifficulty, StaffNotesExercise } from "@/types";
import { ALTERATION, LETTERS, WHITE_KEYS as LETTER_PITCH } from "./pitch";

/** Note scritte sul pentagramma e generazione di note e battute a caso: funzioni pure. */

export interface StaffNote {
  /** Posizione diatonica: ottava × 7 + nome della nota (Do = 0). Il Do centrale (Do4) è 28. */
  step: number;
  /** -1 bemolle, 0 naturale, 1 diesis. */
  alter: number;
}

export const midiOf = (note: StaffNote) => 12 * (Math.floor(note.step / 7) + 1) + LETTER_PITCH[note.step % 7] + note.alter;

export const pitchClassOfNote = (note: StaffNote) => ((midiOf(note) % 12) + 12) % 12;

export const noteLabel = (note: StaffNote) => LETTERS[note.step % 7] + ALTERATION[note.alter];

/** Nota sulla riga più bassa del pentagramma: Mi4 in chiave di violino, Sol2 in chiave di basso. */
const BOTTOM_LINE: Record<Clef, number> = { treble: 30, bass: 18 };

export const CLEF_LABEL: Record<Clef, string> = { treble: "Chiave di violino", bass: "Chiave di basso" };

/** Posizione sul pentagramma: 0 = prima riga in basso, 1 = primo spazio … 8 = quinta riga. */
export const staffPosition = (note: StaffNote, clef: Clef) => note.step - BOTTOM_LINE[clef];

const noteAt = (position: number, clef: Clef, alter = 0): StaffNote => ({ step: BOTTOM_LINE[clef] + position, alter });

const randomInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];

/** Posizioni estreme: dentro il pentagramma (con gli spazi appena fuori) o fino a due tagli addizionali. */
const RANGE: Record<StaffNotesExercise["range"], [number, number]> = { staff: [-1, 9], ledger: [-4, 12] };
/** Quota di note alterate quando l'esercizio le prevede. */
const ALTERED_RATE = 0.35;

export interface StaffTarget {
  clef: Clef;
  note: StaffNote;
}

/** Nota a caso per l'esercizio, diversa dalla precedente. */
export function drawStaffNote(exercise: Pick<StaffNotesExercise, "clef" | "range" | "accidentals">, previous?: StaffTarget | null): StaffTarget {
  const [min, max] = RANGE[exercise.range];
  for (;;) {
    const clef = exercise.clef === "mixed" ? pick<Clef>(["treble", "bass"]) : exercise.clef;
    const note = noteAt(randomInt(min, max), clef);
    if (exercise.accidentals && Math.random() < ALTERED_RATE) {
      const letter = note.step % 7;
      // Niente Mi♯, Si♯, Do♭ e Fa♭: sono tasti bianchi scritti in modo insolito.
      const sharp = letter !== 2 && letter !== 6;
      const flat = letter !== 0 && letter !== 3;
      note.alter = sharp && flat ? pick([1, -1]) : sharp ? 1 : -1;
    }
    if (!previous || midiOf(note) !== midiOf(previous.note)) return { clef, note };
  }
}

export interface MeasureNote {
  note: StaffNote;
  /** Durata in quarti: 2 = minima, 1 = semiminima, 0.5 = croma. */
  beats: number;
  /** Quarto della battuta su cui cade la nota (0 = primo). */
  start: number;
}

export const BEATS_PER_MEASURE = 4;

/** Ritmi possibili (durate in quarti) e ampiezza dei salti tra una nota e l'altra, per difficoltà. */
const RHYTHMS: Record<MeasureDifficulty, number[][]> = {
  easy: [[1, 1, 1, 1]],
  medium: [[1, 1, 1, 1], [2, 1, 1], [1, 1, 2], [1, 2, 1], [2, 2]],
  hard: [
    [0.5, 0.5, 1, 1, 1],
    [1, 0.5, 0.5, 1, 1],
    [1, 1, 0.5, 0.5, 1],
    [1, 1, 1, 0.5, 0.5],
    [0.5, 0.5, 1, 0.5, 0.5, 1],
    [2, 0.5, 0.5, 1],
    [1, 0.5, 0.5, 2],
  ],
};
const LEAPS: Record<MeasureDifficulty, number[]> = { easy: [1], medium: [1, 1, 2], hard: [1, 2, 2, 3, 4] };
/** Le battute difficili escono dal pentagramma di un taglio addizionale. */
const MEASURE_RANGE: Record<MeasureDifficulty, [number, number]> = { easy: [0, 8], medium: [0, 8], hard: [-2, 10] };

/**
 * Battuta in 4/4 a caso. Due note consecutive non sono mai uguali: il microfono riconosce
 * l'altezza, non il riattacco della stessa nota.
 */
export function generateMeasure(clef: Clef, difficulty: MeasureDifficulty): MeasureNote[] {
  const [min, max] = MEASURE_RANGE[difficulty];
  let position = randomInt(min + 1, max - 1);
  let start = 0;
  return pick(RHYTHMS[difficulty]).map((beats, i) => {
    if (i > 0) {
      const leap = pick(LEAPS[difficulty]) * pick([1, -1]);
      position += position + leap < min || position + leap > max ? -leap : leap;
    }
    const note = { note: noteAt(position, clef), beats, start };
    start += beats;
    return note;
  });
}
