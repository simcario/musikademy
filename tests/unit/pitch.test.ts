import { describe, expect, it } from "vitest";
import {
  createNoteTracker,
  detectPitch,
  isBlackKey,
  noteName,
  pitchClassOf,
  type PitchReading,
} from "@/features/exercises/interactive/pitch";

const SAMPLE_RATE = 48_000;
const SIZE = 2048;

/** Suono con armonici di ampiezza data (il primo è la fondamentale), come quello di uno strumento. */
function tone(frequency: number, harmonics = [1], gain = 0.3) {
  const buffer = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i++) {
    let v = 0;
    harmonics.forEach((amp, h) => (v += amp * Math.sin((2 * Math.PI * frequency * (h + 1) * i) / SAMPLE_RATE)));
    buffer[i] = v * gain;
  }
  return buffer;
}

/** Rumore deterministico (LCG), per non avere test instabili. */
function noise(gain = 0.3) {
  const buffer = new Float32Array(SIZE);
  let seed = 12345;
  for (let i = 0; i < SIZE; i++) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    buffer[i] = (seed / 4294967296 - 0.5) * 2 * gain;
  }
  return buffer;
}

describe("nomi delle note", () => {
  it("riconosce la classe di altezza in qualunque ottava", () => {
    expect(pitchClassOf(440)).toBe(9);
    expect(pitchClassOf(880)).toBe(9);
    expect(pitchClassOf(261.63)).toBe(0);
    expect(pitchClassOf(246.94)).toBe(11);
    // Leggermente calante o crescente resta la stessa nota.
    expect(pitchClassOf(440 * 2 ** (40 / 1200))).toBe(9);
    expect(pitchClassOf(440 * 2 ** (-40 / 1200))).toBe(9);
  });

  it("nomina i tasti neri con entrambe le grafie", () => {
    expect(noteName(7)).toBe("Sol");
    expect(noteName(1)).toBe("Do♯ / Re♭");
    expect(isBlackKey(1)).toBe(true);
    expect(isBlackKey(4)).toBe(false);
  });
});

describe("rilevamento dell'altezza", () => {
  it("riconosce le note lungo la tastiera", () => {
    for (const frequency of [65.41, 110, 261.63, 440, 987.77, 2093, 3520]) {
      const reading = detectPitch(tone(frequency), SAMPLE_RATE);
      expect(reading, `${frequency} Hz`).not.toBeNull();
      expect(Math.abs(1200 * Math.log2(reading!.frequency / frequency)), `${frequency} Hz`).toBeLessThan(25);
    }
  });

  it("trova la fondamentale anche con armonici più forti", () => {
    const reading = detectPitch(tone(130.81, [0.4, 1, 0.8, 0.5]), SAMPLE_RATE);
    expect(reading).not.toBeNull();
    expect(pitchClassOf(reading!.frequency)).toBe(0);
    expect(Math.abs(reading!.frequency - 130.81)).toBeLessThan(2);
  });

  it("ignora silenzio e rumore", () => {
    expect(detectPitch(new Float32Array(SIZE), SAMPLE_RATE)).toBeNull();
    expect(detectPitch(tone(440, [1], 0.001), SAMPLE_RATE)).toBeNull();
    expect(detectPitch(noise(), SAMPLE_RATE)).toBeNull();
  });
});

describe("note suonate", () => {
  const reading = (frequency: number, rms = 0.1): PitchReading => ({ frequency, clarity: 0.95, rms });

  it("conta le letture consecutive della stessa nota", () => {
    const tracker = createNoteTracker();
    expect(tracker.push(reading(440))).toEqual({ pitchClass: 9, midi: 69, frames: 1 });
    expect(tracker.push(reading(441))).toEqual({ pitchClass: 9, midi: 69, frames: 2 });
    expect(tracker.push(reading(262))).toEqual({ pitchClass: 0, midi: 60, frames: 1 });
    expect(tracker.push(null)).toBeNull();
    expect(tracker.push(reading(262))).toMatchObject({ pitchClass: 0, frames: 1 });
  });

  it("a inizio turno ignora la nota che sta ancora risuonando", () => {
    const tracker = createNoteTracker();
    tracker.push(reading(440, 0.2));
    tracker.reset();
    expect(tracker.push(reading(440, 0.15))).toBeNull();
    expect(tracker.push(reading(440, 0.1))).toBeNull();
    // Un'altra nota vale subito.
    expect(tracker.push(reading(262, 0.1))).toMatchObject({ pitchClass: 0, frames: 1 });
  });

  it("la stessa nota torna valida dopo un nuovo attacco o un silenzio", () => {
    const attacked = createNoteTracker();
    attacked.push(reading(440, 0.2));
    attacked.reset();
    expect(attacked.push(reading(440, 0.05))).toBeNull();
    expect(attacked.push(reading(440, 0.3))).toMatchObject({ pitchClass: 9, frames: 1 });

    const silenced = createNoteTracker();
    silenced.push(reading(440));
    silenced.reset();
    silenced.push(null);
    expect(silenced.push(reading(440))).toMatchObject({ pitchClass: 9, frames: 1 });
  });
});
