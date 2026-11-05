import { describe, expect, it } from "vitest";
import {
  COMPLEXITY_META,
  allowedAt,
  chordLabel,
  chordPitchClasses,
  chordSequence,
  chromaFromSpectrum,
  createOnsetDetector,
  matchesChord,
  maxOffset,
  timingScore,
  voiceChord,
} from "@/features/exercises/interactive/chords";
import { drawEarNotes, drawProgression, pentachord, progressionLabel } from "@/features/exercises/interactive/ear";
import type { Chord } from "@/types";

/** Generatore pseudo-casuale riproducibile. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const C: Chord = { root: 0, quality: "major" };
const Am: Chord = { root: 9, quality: "minor" };
const G7: Chord = { root: 7, quality: "dom7" };

/** Cromagramma ideale: le note dell'accordo più un po' di rumore uniforme. */
function chromaOf(pcs: number[], noise = 0.02) {
  const c = new Array(12).fill(noise);
  pcs.forEach((pc) => (c[pc] += 1));
  const total = c.reduce((a, b) => a + b, 0);
  return c.map((x) => x / total);
}

describe("accordi", () => {
  it("sigle e note", () => {
    expect(chordLabel(C)).toBe("Do");
    expect(chordLabel(Am)).toBe("Lam");
    expect(chordLabel(G7)).toBe("Sol7");
    expect(chordLabel({ root: 10, quality: "maj7" })).toBe("Si♭maj7");
    expect(chordPitchClasses(G7)).toEqual([7, 11, 2, 5]);
  });

  it("voicing con la fondamentale al basso e le altre note vicine", () => {
    for (const chord of [C, Am, G7, { root: 6, quality: "dim" } as Chord]) {
      const [bass, ...upper] = voiceChord(chord);
      expect(bass % 12).toBe(chord.root);
      expect(upper.every((m) => m >= 59 && m <= 70)).toBe(true);
      expect(new Set(upper.map((m) => m % 12))).toEqual(new Set(chordPitchClasses(chord)));
    }
  });

  it("complessità", () => {
    expect(allowedAt(C, "easy")).toBe(true);
    expect(allowedAt(G7, "easy")).toBe(false);
    expect(allowedAt({ root: 1, quality: "major" }, "easy")).toBe(false);
    expect(allowedAt(G7, "medium")).toBe(true);
    expect(COMPLEXITY_META.hard.qualities).toContain("sus4");
  });

  it("sequenza in ordine o a caso senza ripetizioni consecutive", () => {
    expect(chordSequence([C, Am], "sequence", 5).map(chordLabel)).toEqual(["Do", "Lam", "Do", "Lam", "Do"]);
    const random = chordSequence([C, Am, G7], "random", 50, seeded(1));
    expect(random).toHaveLength(50);
    expect(random.every((c, i) => i === 0 || chordLabel(c) !== chordLabel(random[i - 1]))).toBe(true);
    expect(chordSequence([C], "random", 3).map(chordLabel)).toEqual(["Do", "Do", "Do"]);
  });

  it("riconosce l'accordo dal cromagramma", () => {
    expect(matchesChord(chromaOf([0, 4, 7]), C)).toBe(true);
    expect(matchesChord(chromaOf([0, 4, 7]), Am)).toBe(false);
    expect(matchesChord(chromaOf([9, 0, 4]), Am)).toBe(true);
    expect(matchesChord(chromaOf([7, 11, 2, 5]), G7)).toBe(true);
    expect(matchesChord(new Array(12).fill(0), C)).toBe(false);
  });

  it("cromagramma dallo spettro: un La 440 Hz finisce sul La", () => {
    const fftSize = 8192;
    const sampleRate = 48000;
    const db = new Float32Array(fftSize / 2).fill(-120);
    db[Math.round((440 * fftSize) / sampleRate)] = -10;
    const chroma = chromaFromSpectrum(db, sampleRate, fftSize);
    expect(chroma.indexOf(Math.max(...chroma))).toBe(9);
  });
});

describe("precisione del tempo", () => {
  it("perfetto vicino al battito, zero oltre la tolleranza", () => {
    const beat = 60 / 80;
    expect(timingScore(0, beat)).toBe(1);
    expect(timingScore(-0.02, beat)).toBe(1);
    expect(timingScore(0.1, beat)).toBeGreaterThan(0);
    expect(timingScore(0.1, beat)).toBeLessThan(1);
    expect(timingScore(maxOffset(beat), beat)).toBe(0);
    expect(timingScore(0.1, beat)).toBe(timingScore(-0.1, beat));
  });

  it("la tolleranza non supera metà della distanza tra due battiti", () => {
    for (const bpm of [50, 80, 120, 160]) expect(maxOffset(60 / bpm)).toBeLessThan(60 / bpm / 2);
  });

  it("rileva gli attacchi e ignora la coda dell'accordo", () => {
    const d = createOnsetDetector();
    const onsets: number[] = [];
    const block = 0.003;
    for (let i = 0; i < 400; i++) {
      const t = i * block;
      // Silenzio, attacco a 0.3 s che decade, nuovo attacco a 0.9 s.
      const level = t < 0.3 ? 0.002 : t < 0.9 ? 0.3 * Math.exp(-(t - 0.3) * 3) : 0.3 * Math.exp(-(t - 0.9) * 3);
      const onset = d.push(t, level);
      if (onset !== null) onsets.push(onset);
    }
    expect(onsets).toHaveLength(2);
    expect(onsets[0]).toBeCloseTo(0.3, 2);
    expect(onsets[1]).toBeCloseTo(0.9, 2);
  });
});

describe("ascolto", () => {
  it("pentacordo maggiore e minore", () => {
    expect(pentachord("major", [0, 0]).notes.map((n) => n.label)).toEqual(["Do", "Re", "Mi", "Fa", "Sol"]);
    expect(pentachord("minor", [5, 0]).notes.map((n) => n.label)).toEqual(["La", "Si", "Do", "Re", "Mi"]);
    const { notes } = pentachord("major", [1, 0]);
    expect(notes.every((n, i) => i === 0 || n.midi > notes[i - 1].midi)).toBe(true);
  });

  it("domanda sulla nota: sempre una delle cinque, tonica fissa da Do", () => {
    const random = seeded(7);
    for (let i = 0; i < 50; i++) {
      const q = drawEarNotes({ scale: "major", tonic: "fixed" }, null, random);
      expect(q.scaleName).toBe("Do maggiore");
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(5);
    }
  });

  it("progressioni: quattro opzioni diverse, una corretta, dalla tonica", () => {
    const random = seeded(3);
    for (const level of ["basic", "intermediate", "advanced"] as const) {
      for (let i = 0; i < 30; i++) {
        const q = drawProgression({ level, length: 4, key: "random" }, random);
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options.map(progressionLabel)).size).toBe(4);
        expect(q.options[q.answer].degrees[0]).toBe("I");
        expect(q.options.every((o) => o.chords.length === 4)).toBe(true);
      }
    }
    const fixed = drawProgression({ level: "basic", length: 3, key: "fixed" }, random);
    expect(fixed.keyName).toBe("Do maggiore");
    expect(chordLabel(fixed.options[fixed.answer].chords[0])).toBe("Do");
  });
});
