/** Rilevamento dell'altezza dal microfono e nomi delle note: funzioni pure, senza Web Audio. */

export const NOTE_NAMES_SHARP = ["Do", "Do♯", "Re", "Re♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"];
export const NOTE_NAMES_FLAT = ["Do", "Re♭", "Re", "Mi♭", "Mi", "Fa", "Sol♭", "Sol", "La♭", "La", "Si♭", "Si"];

/** Classi di altezza (0 = Do … 11 = Si) dei tasti bianchi. */
export const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];

/** Nomi delle sette note e alterazioni, per scrivere una nota con la grafia voluta (Fa♯ oppure Sol♭). */
export const LETTERS = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"];
export const ALTERATION: Record<number, string> = { [-2]: "♭♭", [-1]: "♭", 0: "", 1: "♯", 2: "♯♯" };

export const isBlackKey = (pitchClass: number) => !WHITE_KEYS.includes(pitchClass);

/** Nome della nota; per i tasti neri entrambe le grafie ("Do♯ / Re♭"). */
export function noteName(pitchClass: number) {
  const sharp = NOTE_NAMES_SHARP[pitchClass];
  const flat = NOTE_NAMES_FLAT[pitchClass];
  return sharp === flat ? sharp : `${sharp} / ${flat}`;
}

export const frequencyToMidi = (frequency: number) => 69 + 12 * Math.log2(frequency / 440);

/** Classe di altezza della nota più vicina alla frequenza, qualunque sia l'ottava. */
export function pitchClassOf(frequency: number) {
  return ((Math.round(frequencyToMidi(frequency)) % 12) + 12) % 12;
}

export interface PitchReading {
  frequency: number;
  /** Quanto il segnale è periodico (0–1): basso per rumore e parlato. */
  clarity: number;
  /** Livello del segnale (RMS). */
  rms: number;
}

/** Sotto questo livello è silenzio o rumore di fondo. */
const MIN_RMS = 0.01;
const MIN_CLARITY = 0.88;
/** Do8, l'ultimo tasto del pianoforte, con un po' di margine. */
const MAX_FREQUENCY = 4500;
/** Un picco vale come fondamentale se raggiunge questa quota del picco più alto. */
const PEAK_THRESHOLD = 0.9;

export function rmsOf(buffer: Float32Array) {
  let energy = 0;
  for (let i = 0; i < buffer.length; i++) energy += buffer[i] * buffer[i];
  return Math.sqrt(energy / buffer.length);
}

/**
 * Frequenza fondamentale con il McLeod Pitch Method (autocorrelazione normalizzata):
 * regge gli armonici forti del pianoforte meglio del picco dello spettro.
 * La nota più grave rilevabile ha periodo pari a metà buffer (≈ 47 Hz con 2048 campioni a 48 kHz).
 */
export function detectPitch(buffer: Float32Array, sampleRate: number): PitchReading | null {
  const n = buffer.length;
  const rms = rmsOf(buffer);
  if (rms < MIN_RMS) return null;

  const maxLag = n >> 1;
  const nsdf = new Float32Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let acf = 0;
    let norm = 0;
    for (let i = 0; i < n - lag; i++) {
      const a = buffer[i];
      const b = buffer[i + lag];
      acf += a * b;
      norm += a * a + b * b;
    }
    nsdf[lag] = norm > 0 ? (2 * acf) / norm : 0;
  }

  // Il primo lobo positivo è la correlazione del segnale con sé stesso: si salta.
  let lag = 1;
  while (lag <= maxLag && nsdf[lag] > 0) lag++;

  const peaks: number[] = [];
  let highest = 0;
  while (lag <= maxLag) {
    while (lag <= maxLag && nsdf[lag] <= 0) lag++;
    let best = -1;
    while (lag <= maxLag && nsdf[lag] > 0) {
      if (best < 0 || nsdf[lag] > nsdf[best]) best = lag;
      lag++;
    }
    // Un massimo sull'ultimo campione è un lobo troncato, non un picco.
    if (best > 0 && best < maxLag) {
      peaks.push(best);
      highest = Math.max(highest, nsdf[best]);
    }
  }
  const peak = peaks.find((p) => nsdf[p] >= highest * PEAK_THRESHOLD);
  if (peak === undefined) return null;

  const clarity = nsdf[peak];
  if (clarity < MIN_CLARITY) return null;

  // Interpolazione parabolica: il periodo reale cade tra due campioni.
  const a = nsdf[peak - 1];
  const c = nsdf[peak + 1];
  const curve = a - 2 * clarity + c;
  const period = peak + (curve ? (0.5 * (a - c)) / curve : 0);
  const frequency = sampleRate / period;
  if (frequency > MAX_FREQUENCY) return null;
  return { frequency, clarity, rms };
}

/**
 * Letture consecutive (40 ms l'una) perché una nota valga come risposta:
 * l'errore ne richiede di più, per non punire un falso rilevamento.
 */
export const CORRECT_FRAMES = 3;
export const WRONG_FRAMES = 6;

/** Di quanto deve salire il livello tra due letture perché sia un nuovo attacco. */
const ATTACK_RATIO = 1.8;

/**
 * Trasforma le letture in note "suonate": una nota vale quando resta la stessa per più letture
 * di fila. A ogni nuovo turno la nota che sta ancora risuonando viene ignorata finché non c'è
 * silenzio, un'altra nota o un nuovo attacco.
 */
export function createNoteTracker() {
  let last: number | null = null;
  let frames = 0;
  let level = 0;
  let carried: number | null = null;

  return {
    reset() {
      carried = last;
      frames = 0;
    },
    push(reading: PitchReading | null): { pitchClass: number; midi: number; frames: number } | null {
      if (!reading) {
        last = null;
        frames = 0;
        level = 0;
        carried = null;
        return null;
      }
      const pitchClass = pitchClassOf(reading.frequency);
      if (level > 0 && reading.rms > level * ATTACK_RATIO) carried = null;
      level = reading.rms;
      if (pitchClass === last) frames += 1;
      else {
        last = pitchClass;
        frames = 1;
      }
      if (pitchClass === carried) {
        frames = 0;
        return null;
      }
      carried = null;
      return { pitchClass, midi: Math.round(frequencyToMidi(reading.frequency)), frames };
    },
  };
}
