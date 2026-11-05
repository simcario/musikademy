import type { Chord, ChordQuality, EarNotesExercise, ProgressionsExercise } from "@/types";
import { ROOT_NAMES, chordLabel, sameChord } from "./chords";
import { SCALE_META, buildScale } from "./scales";

/** Esercizi d'ascolto: domande a caso. Funzioni pure (`random` sostituibile nei test). */

type Random = () => number;
const pick = <T>(items: readonly T[], random: Random) => items[Math.floor(random() * items.length)];

// ─────────────── Indovina la nota ───────────────

export interface EarNote {
  midi: number;
  label: string;
  /** Grado nella scala (1–5). */
  degree: number;
}

export interface EarNotesQuestion {
  /** Es. "Re maggiore". */
  scaleName: string;
  notes: EarNote[];
  /** Indice in `notes` della nota da indovinare. */
  answer: number;
}

/** Tonica: [nome della nota (0 = Do … 6 = Si), alterazione]. Con tonica a caso solo quelle di uso comune. */
const FIXED_TONIC: [number, number] = [0, 0];

/** Le prime cinque note della scala, dalla tonica in su (tra Sol3 e Fa♯4, per restare in un registro comodo). */
export function pentachord(type: "major" | "minor", tonic: [number, number]) {
  const scale = buildScale(type === "major" ? "major" : "natural_minor", tonic);
  const first = scale.notes[0].pitchClass;
  const base = 60 + first - (first > 6 ? 12 : 0);
  const notes = scale.notes.slice(0, 5).map((n, i) => {
    const up = (n.pitchClass - first + 12) % 12;
    return { midi: base + up, label: n.label, degree: i + 1 };
  });
  return { name: scale.name, notes };
}

export function drawEarNotes(
  exercise: Pick<EarNotesExercise, "scale" | "tonic">,
  previous?: EarNotesQuestion | null,
  random: Random = Math.random,
): EarNotesQuestion {
  for (;;) {
    const type = exercise.scale === "mixed" ? pick(["major", "minor"] as const, random) : exercise.scale;
    const tonics = SCALE_META[type === "major" ? "major" : "natural_minor"].tonics;
    const tonic = exercise.tonic === "fixed" ? FIXED_TONIC : pick(tonics, random);
    const { name, notes } = pentachord(type, tonic);
    const answer = Math.floor(random() * notes.length);
    // Due domande di fila sulla stessa nota della stessa scala annoiano.
    if (!previous || previous.scaleName !== name || previous.answer !== answer) return { scaleName: name, notes, answer };
  }
}

// ─────────────── Indovina la progressione ───────────────

/** Grado della tonalità maggiore: semitoni dalla tonica, qualità e numero romano. */
export interface Degree {
  numeral: string;
  offset: number;
  quality: ChordQuality;
}

const DEGREES: Record<string, Degree> = {
  I: { numeral: "I", offset: 0, quality: "major" },
  ii: { numeral: "ii", offset: 2, quality: "minor" },
  iii: { numeral: "iii", offset: 4, quality: "minor" },
  IV: { numeral: "IV", offset: 5, quality: "major" },
  V: { numeral: "V", offset: 7, quality: "major" },
  V7: { numeral: "V7", offset: 7, quality: "dom7" },
  vi: { numeral: "vi", offset: 9, quality: "minor" },
  vii: { numeral: "vii°", offset: 11, quality: "dim" },
};

export const PROGRESSION_LEVELS: Record<ProgressionsExercise["level"], { label: string; hint: string; degrees: string[] }> = {
  basic: { label: "Base", hint: "I, IV, V e vi: i quattro accordi del pop.", degrees: ["I", "IV", "V", "vi"] },
  intermediate: { label: "Intermedio", hint: "Anche ii e iii.", degrees: ["I", "ii", "iii", "IV", "V", "vi"] },
  advanced: { label: "Avanzato", hint: "Tutti i gradi, con vii° e V7.", degrees: ["I", "ii", "iii", "IV", "V", "V7", "vi", "vii"] },
};

/** Tonalità maggiori proposte con la tonalità a caso (le più usate). */
const KEYS = [0, 2, 4, 5, 7, 9, 10, 3];

export interface Progression {
  /** Gradi, es. ["I", "vi", "IV", "V"]. */
  degrees: string[];
  chords: Chord[];
}

export interface ProgressionQuestion {
  /** Tonica della tonalità maggiore. */
  key: number;
  keyName: string;
  /** Quattro opzioni, una sola corretta. */
  options: Progression[];
  answer: number;
}

export const degreeChord = (key: number, degree: string): Chord => {
  const d = DEGREES[degree];
  return { root: (key + d.offset) % 12, quality: d.quality };
};

export const numeralOf = (degree: string) => DEGREES[degree].numeral;

export const progressionLabel = (p: Progression) => p.chords.map(chordLabel).join(" – ");
export const progressionNumerals = (p: Progression) => p.degrees.map(numeralOf).join(" – ");

const sameProgression = (a: Progression, b: Progression) =>
  a.chords.length === b.chords.length && a.chords.every((c, i) => sameChord(c, b.chords[i]));

/** Due gradi "uguali" all'orecchio (V e V7) non si alternano nella stessa posizione delle opzioni. */
const soundsAlike = (a: string, b: string) => a === b || (DEGREES[a].offset === DEGREES[b].offset && DEGREES[a].quality !== "dim");

function build(key: number, degrees: string[]): Progression {
  return { degrees, chords: degrees.map((d) => degreeChord(key, d)) };
}

/** Progressione che parte dalla tonica, senza due accordi uguali di fila. */
function randomDegrees(pool: string[], length: number, random: Random): string[] {
  const out = ["I"];
  while (out.length < length) {
    const prev = out[out.length - 1];
    out.push(pick(pool.filter((d) => !soundsAlike(d, prev)), random));
  }
  return out;
}

/** Variante della progressione: cambia uno o due accordi (mai il primo), restando plausibile. */
function variant(degrees: string[], pool: string[], random: Random): string[] {
  const out = [...degrees];
  const changes = degrees.length > 3 && random() < 0.4 ? 2 : 1;
  const positions = degrees.map((_, i) => i).slice(1);
  for (let n = 0; n < changes; n++) {
    const i = positions.splice(Math.floor(random() * positions.length), 1)[0];
    const options = pool.filter(
      (d) => !soundsAlike(d, degrees[i]) && !soundsAlike(d, out[i - 1]) && (i + 1 >= out.length || !soundsAlike(d, out[i + 1])),
    );
    if (options.length) out[i] = pick(options, random);
  }
  return out;
}

export function drawProgression(
  exercise: Pick<ProgressionsExercise, "level" | "length" | "key">,
  random: Random = Math.random,
): ProgressionQuestion {
  const pool = PROGRESSION_LEVELS[exercise.level].degrees;
  const key = exercise.key === "fixed" ? 0 : pick(KEYS, random);
  const correct = build(key, randomDegrees(pool, exercise.length, random));
  const options = [correct];
  for (let attempts = 0; options.length < 4 && attempts < 200; attempts++) {
    // Le prime alternative somigliano alla corretta; se non bastano, progressioni nuove.
    const degrees = attempts < 100 ? variant(correct.degrees, pool, random) : randomDegrees(pool, exercise.length, random);
    const candidate = build(key, degrees);
    if (!options.some((o) => sameProgression(o, candidate))) options.push(candidate);
  }
  // Mescola le opzioni.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { key, keyName: `${ROOT_NAMES[key]} maggiore`, options, answer: options.indexOf(correct) };
}
