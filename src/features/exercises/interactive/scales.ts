import { SCALE_TYPES, type ScaleType, type ScalesExercise } from "@/types";
import { ALTERATION, LETTERS, WHITE_KEYS as LETTER_PITCH } from "./pitch";

/** Costruzione delle scale con la grafia corretta delle note: funzioni pure. */

/** Tonica: nome della nota (0 = Do … 6 = Si) e alterazione (-1 bemolle, 1 diesis). */
type Tonic = [letter: number, alter: number];

/** Le dodici tonalità con la grafia d'uso (Si♭ e non La♯, Fa♯ minore e non Sol♭ minore). */
const MAJOR_TONICS: Tonic[] = [[0, 0], [4, 0], [1, 0], [5, 0], [2, 0], [6, 0], [3, 0], [6, -1], [2, -1], [5, -1], [1, -1], [4, -1]];
const MINOR_TONICS: Tonic[] = [[5, 0], [2, 0], [6, 0], [3, 1], [0, 1], [4, 1], [1, 0], [4, 0], [0, 0], [3, 0], [6, -1], [2, -1]];

export const SCALE_META: Record<ScaleType, { label: string; intervals: number[]; tonics: Tonic[] }> = {
  major: { label: "maggiore", intervals: [0, 2, 4, 5, 7, 9, 11], tonics: MAJOR_TONICS },
  natural_minor: { label: "minore naturale", intervals: [0, 2, 3, 5, 7, 8, 10], tonics: MINOR_TONICS },
  harmonic_minor: { label: "minore armonica", intervals: [0, 2, 3, 5, 7, 8, 11], tonics: MINOR_TONICS },
  melodic_minor: { label: "minore melodica", intervals: [0, 2, 3, 5, 7, 9, 11], tonics: MINOR_TONICS },
};

export interface ScaleNote {
  pitchClass: number;
  label: string;
}

export interface Scale {
  /** Es. "Re maggiore". */
  name: string;
  /** Otto note in senso ascendente, dalla tonica alla tonica dell'ottava sopra. */
  notes: ScaleNote[];
}

/** Ogni grado prende il nome di nota successivo: l'alterazione è la distanza dalla nota naturale. */
export function buildScale(type: ScaleType, [letter, alter]: Tonic): Scale {
  const { label, intervals } = SCALE_META[type];
  const tonicPitch = LETTER_PITCH[letter] + alter;
  const notes = Array.from({ length: 8 }, (_, degree) => {
    const name = (letter + degree) % 7;
    const pitchClass = (((tonicPitch + intervals[degree % 7]) % 12) + 12) % 12;
    const shift = ((pitchClass - LETTER_PITCH[name] + 18) % 12) - 6;
    return { pitchClass, label: LETTERS[name] + ALTERATION[shift] };
  });
  return { name: `${notes[0].label} ${label}`, notes };
}

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

/** Scala a caso tra quelle previste dall'esercizio, diversa dalla precedente. */
export function drawScale(exercise: Pick<ScalesExercise, "scale" | "accidentals">, previous?: string): Scale {
  const types = exercise.scale === "mixed" ? [...SCALE_TYPES] : [exercise.scale];
  const pool = types.flatMap((type) =>
    SCALE_META[type].tonics.filter(([, alter]) => exercise.accidentals || alter === 0).map((tonic) => buildScale(type, tonic)),
  );
  return pick(pool.filter((s) => s.name !== previous));
}
