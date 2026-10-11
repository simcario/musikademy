import type { IntervalsExercise } from "@/types";
import { ALTERATION, LETTERS, WHITE_KEYS as LETTER_PITCH } from "./pitch";

/** Intervalli: nota di arrivo con la grafia corretta (3ª maggiore sopra Do = Mi, 3ª minore = Mi♭). Funzioni pure. */

interface Interval {
  semitones: number;
  /** Numero dell'intervallo: quanti nomi di nota abbraccia (2 = seconda, 3 = terza…). */
  degree: number;
  label: string;
}

export const INTERVALS: Interval[] = [
  { semitones: 1, degree: 2, label: "2ª minore" },
  { semitones: 2, degree: 2, label: "2ª maggiore" },
  { semitones: 3, degree: 3, label: "3ª minore" },
  { semitones: 4, degree: 3, label: "3ª maggiore" },
  { semitones: 5, degree: 4, label: "4ª giusta" },
  { semitones: 6, degree: 4, label: "4ª aumentata" },
  { semitones: 7, degree: 5, label: "5ª giusta" },
  { semitones: 8, degree: 6, label: "6ª minore" },
  { semitones: 9, degree: 6, label: "6ª maggiore" },
  { semitones: 10, degree: 7, label: "7ª minore" },
  { semitones: 11, degree: 7, label: "7ª maggiore" },
];

/** Intervalli (in semitoni) richiesti a ogni livello. */
const LEVEL_SEMITONES: Record<IntervalsExercise["level"], number[]> = {
  seconds_thirds: [1, 2, 3, 4],
  up_to_fifth: [1, 2, 3, 4, 5, 7],
  all: INTERVALS.map((i) => i.semitones),
};

export const LEVEL_LABEL: Record<IntervalsExercise["level"], string> = {
  seconds_thirds: "Seconde e terze",
  up_to_fifth: "Fino alla 5ª giusta",
  all: "Tutti, fino alla 7ª maggiore",
};

/** Note di partenza: nome (0 = Do … 6 = Si) e alterazione. Quelle alterate solo se l'esercizio le prevede. */
const NATURAL_STARTS = LETTERS.map((_, letter): [number, number] => [letter, 0]);
const ALTERED_STARTS: [number, number][] = [[6, -1], [2, -1], [5, -1], [3, 1], [0, 1]];

export interface IntervalNote {
  pitchClass: number;
  label: string;
}

export interface IntervalQuestion {
  start: IntervalNote;
  /** Es. "3ª maggiore". */
  interval: string;
  direction: "up" | "down";
  answer: IntervalNote;
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

export function buildInterval([letter, alter]: [number, number], interval: Interval, direction: "up" | "down"): IntervalQuestion {
  const sign = direction === "up" ? 1 : -1;
  const startPitch = mod(LETTER_PITCH[letter] + alter, 12);
  const answerLetter = mod(letter + sign * (interval.degree - 1), 7);
  const answerPitch = mod(startPitch + sign * interval.semitones, 12);
  const shift = mod(answerPitch - LETTER_PITCH[answerLetter] + 6, 12) - 6;
  return {
    start: { pitchClass: startPitch, label: LETTERS[letter] + ALTERATION[alter] },
    interval: interval.label,
    direction,
    answer: { pitchClass: answerPitch, label: LETTERS[answerLetter] + ALTERATION[shift] },
  };
}

const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];

const sameQuestion = (a: IntervalQuestion, b: IntervalQuestion) =>
  a.start.label === b.start.label && a.interval === b.interval && a.direction === b.direction;

/** Domanda a caso tra quelle previste dall'esercizio, diversa dalla precedente. */
export function drawInterval(
  exercise: Pick<IntervalsExercise, "level" | "direction" | "accidentals">,
  previous?: IntervalQuestion | null,
): IntervalQuestion {
  const intervals = INTERVALS.filter((i) => LEVEL_SEMITONES[exercise.level].includes(i.semitones));
  const starts = exercise.accidentals ? [...NATURAL_STARTS, ...ALTERED_STARTS] : NATURAL_STARTS;
  for (;;) {
    const direction = exercise.direction === "mixed" ? pick<"up" | "down">(["up", "down"]) : exercise.direction;
    const question = buildInterval(pick(starts), pick(intervals), direction);
    if (!previous || !sameQuestion(question, previous)) return question;
  }
}
