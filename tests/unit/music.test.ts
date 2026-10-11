import { describe, expect, it } from "vitest";
import { INTERVALS, buildInterval, drawInterval } from "@/features/exercises/interactive/intervals";
import { SCALE_META, buildScale, drawScale } from "@/features/exercises/interactive/scales";
import {
  BEATS_PER_MEASURE,
  drawStaffNote,
  generateMeasure,
  midiOf,
  noteLabel,
  pitchClassOfNote,
  staffPosition,
} from "@/features/exercises/interactive/staff";
import { MEASURE_DIFFICULTIES, SCALE_TYPES } from "@/types";

const labels = (notes: { label: string }[]) => notes.map((n) => n.label).join(" ");
const interval = (label: string) => INTERVALS.find((i) => i.label === label)!;

describe("scale", () => {
  it("scrive le note con la grafia della tonalità", () => {
    expect(buildScale("major", [0, 0]).name).toBe("Do maggiore");
    expect(labels(buildScale("major", [1, 0]).notes)).toBe("Re Mi Fa♯ Sol La Si Do♯ Re");
    expect(labels(buildScale("major", [3, 0]).notes)).toBe("Fa Sol La Si♭ Do Re Mi Fa");
    expect(labels(buildScale("major", [4, -1]).notes)).toBe("Sol♭ La♭ Si♭ Do♭ Re♭ Mi♭ Fa Sol♭");
    expect(labels(buildScale("natural_minor", [5, 0]).notes)).toBe("La Si Do Re Mi Fa Sol La");
    expect(labels(buildScale("harmonic_minor", [5, 0]).notes)).toBe("La Si Do Re Mi Fa Sol♯ La");
    expect(labels(buildScale("melodic_minor", [1, 0]).notes)).toBe("Re Mi Fa Sol La Si Do♯ Re");
    expect(labels(buildScale("harmonic_minor", [4, 1]).notes)).toBe("Sol♯ La♯ Si Do♯ Re♯ Mi Fa♯♯ Sol♯");
  });

  it("ogni scala ha otto note, sale sempre e torna alla tonica", () => {
    for (const type of SCALE_TYPES) {
      for (const tonic of SCALE_META[type].tonics) {
        const { notes, name } = buildScale(type, tonic);
        expect(notes, name).toHaveLength(8);
        expect(notes[7], name).toEqual(notes[0]);
        expect(notes.every((n) => !n.label.includes("undefined")), name).toBe(true);
        // Due note consecutive non hanno mai la stessa altezza: il gioco le distingue dal microfono.
        expect(notes.every((n, i) => i === 0 || n.pitchClass !== notes[i - 1].pitchClass), name).toBe(true);
      }
    }
  });

  it("estrae solo le scale previste dall'esercizio", () => {
    for (let i = 0; i < 50; i++) {
      const scale = drawScale({ scale: "major", accidentals: false });
      expect(scale.name).toMatch(/^(Do|Re|Mi|Fa|Sol|La|Si) maggiore$/);
    }
    const names = new Set(Array.from({ length: 300 }, () => drawScale({ scale: "mixed", accidentals: true }).name.replace(/^\S+ /, "")));
    expect([...names].sort()).toEqual(["maggiore", "minore armonica", "minore melodica", "minore naturale"]);
    expect(drawScale({ scale: "major", accidentals: false }, "Do maggiore").name).not.toBe("Do maggiore");
  });
});

describe("intervalli", () => {
  it("trova la nota di arrivo con la grafia corretta", () => {
    expect(buildInterval([0, 0], interval("3ª maggiore"), "up").answer).toEqual({ pitchClass: 4, label: "Mi" });
    expect(buildInterval([0, 0], interval("3ª minore"), "up").answer).toEqual({ pitchClass: 3, label: "Mi♭" });
    expect(buildInterval([3, 0], interval("4ª giusta"), "up").answer.label).toBe("Si♭");
    expect(buildInterval([3, 0], interval("4ª aumentata"), "up").answer.label).toBe("Si");
    expect(buildInterval([0, 0], interval("3ª maggiore"), "down").answer).toEqual({ pitchClass: 8, label: "La♭" });
    expect(buildInterval([6, -1], interval("5ª giusta"), "up")).toMatchObject({ start: { label: "Si♭", pitchClass: 10 }, answer: { label: "Fa" } });
    expect(buildInterval([0, 1], interval("7ª maggiore"), "up").answer.label).toBe("Si♯");
  });

  it("rispetta livello e direzione", () => {
    for (let i = 0; i < 100; i++) {
      const q = drawInterval({ level: "seconds_thirds", direction: "up", accidentals: false });
      expect(q.interval).toMatch(/^[23]ª/);
      expect(q.direction).toBe("up");
      expect(q.start.label).toMatch(/^(Do|Re|Mi|Fa|Sol|La|Si)$/);
      expect(q.answer.pitchClass).not.toBe(q.start.pitchClass);
      expect(q.answer.label).not.toContain("undefined");
    }
    for (let i = 0; i < 300; i++) {
      expect(drawInterval({ level: "all", direction: "mixed", accidentals: true }).answer.label).not.toContain("undefined");
    }
  });
});

describe("pentagramma", () => {
  it("colloca le note sulle righe giuste", () => {
    const middleC = { step: 28, alter: 0 };
    expect(midiOf(middleC)).toBe(60);
    expect(noteLabel(middleC)).toBe("Do");
    // Do centrale: un taglio sotto in chiave di violino, un taglio sopra in chiave di basso.
    expect(staffPosition(middleC, "treble")).toBe(-2);
    expect(staffPosition(middleC, "bass")).toBe(10);
    // Seconda riga in chiave di violino = Sol4, quarta riga in chiave di basso = Fa3.
    expect(midiOf({ step: 32, alter: 0 })).toBe(67);
    expect(staffPosition({ step: 32, alter: 0 }, "treble")).toBe(2);
    expect(midiOf({ step: 24, alter: 0 })).toBe(53);
    expect(staffPosition({ step: 24, alter: 0 }, "bass")).toBe(6);
    expect(noteLabel({ step: 31, alter: 1 })).toBe("Fa♯");
    expect(pitchClassOfNote({ step: 34, alter: -1 })).toBe(10);
  });

  it("estrae note nell'estensione e nella chiave richieste", () => {
    for (let i = 0; i < 200; i++) {
      const { clef, note } = drawStaffNote({ clef: "treble", range: "staff", accidentals: false });
      expect(clef).toBe("treble");
      expect(note.alter).toBe(0);
      expect(staffPosition(note, clef)).toBeGreaterThanOrEqual(-1);
      expect(staffPosition(note, clef)).toBeLessThanOrEqual(9);
    }
    for (let i = 0; i < 300; i++) {
      const { clef, note } = drawStaffNote({ clef: "mixed", range: "ledger", accidentals: true });
      expect(Math.abs(staffPosition(note, clef) - 4)).toBeLessThanOrEqual(8);
      // Mai Mi♯, Si♯, Do♭, Fa♭.
      expect(["Mi♯", "Si♯", "Do♭", "Fa♭"]).not.toContain(noteLabel(note));
    }
    const previous = drawStaffNote({ clef: "bass", range: "staff", accidentals: false });
    for (let i = 0; i < 50; i++) {
      expect(midiOf(drawStaffNote({ clef: "bass", range: "staff", accidentals: false }, previous).note)).not.toBe(midiOf(previous.note));
    }
  });

  it("genera battute di quattro quarti senza note ripetute di fila", () => {
    for (const difficulty of MEASURE_DIFFICULTIES) {
      for (let i = 0; i < 200; i++) {
        const measure = generateMeasure("treble", difficulty);
        expect(measure.reduce((sum, n) => sum + n.beats, 0)).toBe(BEATS_PER_MEASURE);
        measure.forEach((n, j) => {
          expect(n.start).toBe(measure.slice(0, j).reduce((sum, m) => sum + m.beats, 0));
          if (j > 0) expect(pitchClassOfNote(n.note)).not.toBe(pitchClassOfNote(measure[j - 1].note));
          const position = staffPosition(n.note, "treble");
          expect(position).toBeGreaterThanOrEqual(difficulty === "hard" ? -2 : 0);
          expect(position).toBeLessThanOrEqual(difficulty === "hard" ? 10 : 8);
        });
      }
    }
    expect(generateMeasure("bass", "easy").every((n) => n.beats === 1)).toBe(true);
  });
});
