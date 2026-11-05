import { CHORD_QUALITIES, type Chord, type ChordComplexity, type ChordQuality } from "@/types";
import { WHITE_KEYS } from "./pitch";

/** Accordi: sigle, note, voicing e riconoscimento dal cromagramma. Funzioni pure. */

/** Grafia delle fondamentali (la più comune per ogni tasto nero). */
export const ROOT_NAMES = ["Do", "Do♯", "Re", "Mi♭", "Mi", "Fa", "Fa♯", "Sol", "La♭", "La", "Si♭", "Si"];

export const QUALITY_META: Record<ChordQuality, { suffix: string; label: string; intervals: number[] }> = {
  major: { suffix: "", label: "Maggiore", intervals: [0, 4, 7] },
  minor: { suffix: "m", label: "Minore", intervals: [0, 3, 7] },
  dom7: { suffix: "7", label: "Settima di dominante", intervals: [0, 4, 7, 10] },
  maj7: { suffix: "maj7", label: "Settima maggiore", intervals: [0, 4, 7, 11] },
  min7: { suffix: "m7", label: "Minore settima", intervals: [0, 3, 7, 10] },
  dim: { suffix: "dim", label: "Diminuito", intervals: [0, 3, 6] },
  sus4: { suffix: "sus4", label: "Sospeso (sus4)", intervals: [0, 5, 7] },
};

/** Cosa si può scegliere a ogni livello di complessità. */
export const COMPLEXITY_META: Record<ChordComplexity, { label: string; hint: string; qualities: ChordQuality[]; roots: number[] }> = {
  easy: {
    label: "Facile",
    hint: "Accordi maggiori e minori sui tasti bianchi (Do, Rem, Fa, Sol, Lam…).",
    qualities: ["major", "minor"],
    roots: WHITE_KEYS,
  },
  medium: {
    label: "Media",
    hint: "Maggiori, minori e di settima su tutte le fondamentali.",
    qualities: ["major", "minor", "dom7"],
    roots: ROOT_NAMES.map((_, i) => i),
  },
  hard: {
    label: "Difficile",
    hint: "Anche settime maggiori e minori, diminuiti e sospesi.",
    qualities: [...CHORD_QUALITIES],
    roots: ROOT_NAMES.map((_, i) => i),
  },
};

export const chordLabel = (c: Chord) => ROOT_NAMES[c.root] + QUALITY_META[c.quality].suffix;
export const sameChord = (a: Chord, b: Chord) => a.root === b.root && a.quality === b.quality;

export function chordPitchClasses(c: Chord): number[] {
  return QUALITY_META[c.quality].intervals.map((i) => (c.root + i) % 12);
}

/** L'accordo si può scegliere con la complessità indicata. */
export const allowedAt = (c: Chord, complexity: ChordComplexity) =>
  COMPLEXITY_META[complexity].qualities.includes(c.quality) && COMPLEXITY_META[complexity].roots.includes(c.root);

/** Accordi di partenza proposti per ogni complessità: una progressione semplice (I–V–vi–IV in Do). */
export const DEFAULT_CHORDS: Chord[] = [
  { root: 0, quality: "major" },
  { root: 7, quality: "major" },
  { root: 9, quality: "minor" },
  { root: 5, quality: "major" },
];

/**
 * Voicing per la riproduzione: fondamentale al basso (Do2–Si2) e le altre note in posizione stretta
 * attorno a Mi4, perché accordi diversi suonino nella stessa zona.
 */
export function voiceChord(c: Chord): number[] {
  const bass = 48 + c.root;
  const upper = QUALITY_META[c.quality].intervals.map((i) => {
    const pc = (c.root + i) % 12;
    let midi = 60 + pc;
    if (midi > 70) midi -= 12;
    return midi;
  });
  return [bass, ...upper.sort((a, b) => a - b)];
}

/** Sequenza degli accordi da suonare: nell'ordine scelto (ripetuto) o a caso, mai due uguali di fila. */
export function chordSequence(chords: Chord[], order: "sequence" | "random", count: number, random = Math.random): Chord[] {
  if (!chords.length) return [];
  if (order === "sequence") return Array.from({ length: count }, (_, i) => chords[i % chords.length]);
  const out: Chord[] = [];
  for (let i = 0; i < count; i++) {
    const pool = chords.length > 1 && out.length ? chords.filter((c) => !sameChord(c, out[out.length - 1])) : chords;
    out.push(pool[Math.floor(random() * pool.length)]);
  }
  return out;
}

// ─────────────── Riconoscimento dell'accordo dal cromagramma ───────────────

/** Note più gravi o più acute non contano: rumori, battimenti e armonici molto alti. */
const CHROMA_MIN_HZ = 70;
const CHROMA_MAX_HZ = 2100;

/**
 * Cromagramma (energia per classe di altezza, normalizzata a somma 1) dallo spettro in dB di un AnalyserNode.
 * Ogni bin contribuisce alla nota più vicina.
 */
export function chromaFromSpectrum(db: Float32Array, sampleRate: number, fftSize: number): number[] {
  const chroma = new Array<number>(12).fill(0);
  const binHz = sampleRate / fftSize;
  for (let bin = Math.ceil(CHROMA_MIN_HZ / binHz); bin < db.length && bin * binHz <= CHROMA_MAX_HZ; bin++) {
    const value = db[bin];
    if (!Number.isFinite(value)) continue;
    const power = Math.pow(10, value / 10);
    const midi = 69 + 12 * Math.log2((bin * binHz) / 440);
    chroma[((Math.round(midi) % 12) + 12) % 12] += power;
  }
  const total = chroma.reduce((a, b) => a + b, 0);
  return total > 0 ? chroma.map((c) => c / total) : chroma;
}

/** Quanto il cromagramma somiglia all'accordo: energia sulle sue note meno quella fuori, pesata per numero di note. */
export function chordScore(chroma: number[], c: Chord): number {
  const tones = chordPitchClasses(c);
  let inside = 0;
  for (const pc of tones) inside += chroma[pc];
  const outside = 1 - inside;
  return inside / tones.length - outside / (12 - tones.length);
}

/** Tutti gli accordi con cui confrontare quello suonato. */
const ALL_CHORDS: Chord[] = CHORD_QUALITIES.flatMap((quality) => ROOT_NAMES.map((_, root) => ({ root, quality })));

/**
 * L'accordo suonato è quello richiesto? Vale se l'accordo richiesto è tra i più somiglianti:
 * il microfono di un telefono non distingue sempre accordi che condividono quasi tutte le note
 * (es. Do e Do maj7), per cui si accetta un piccolo margine.
 */
export function matchesChord(chroma: number[], target: Chord, tolerance = 0.85): boolean {
  const total = chroma.reduce((a, b) => a + b, 0);
  if (total <= 0) return false;
  const best = Math.max(...ALL_CHORDS.map((c) => chordScore(chroma, c)));
  const own = chordScore(chroma, target);
  // Le note dell'accordo devono comunque prevalere su quelle estranee.
  return own > 0 && own >= best * tolerance;
}

// ─────────────── Precisione del tempo ───────────────

/** Entro questo scarto (s) l'attacco vale come perfetto. */
export const PERFECT_WINDOW = 0.03;

/** Scarto oltre il quale l'attacco non vale più: un quarto della durata del quarto, al massimo 250 ms. */
export const maxOffset = (beatLength: number) => Math.min(0.25, beatLength / 4 + 0.05);

/** Precisione di un attacco (0–1): 1 entro la finestra perfetta, poi cala fino a 0 allo scarto massimo. */
export function timingScore(offset: number, beatLength: number): number {
  const err = Math.abs(offset);
  const max = maxOffset(beatLength);
  if (err <= PERFECT_WINDOW) return 1;
  if (err >= max) return 0;
  return 1 - (err - PERFECT_WINDOW) / (max - PERFECT_WINDOW);
}

/** Giudizio su un attacco, per il messaggio a video. */
export function timingVerdict(offset: number | null, beatLength: number): { label: string; tone: "success" | "warning" | "danger" } {
  if (offset === null) return { label: "Mancato", tone: "danger" };
  const score = timingScore(offset, beatLength);
  if (score >= 0.95) return { label: "Perfetto", tone: "success" };
  const early = offset < 0;
  if (score >= 0.5) return { label: early ? "Un po' in anticipo" : "Un po' in ritardo", tone: "warning" };
  return { label: early ? "In anticipo" : "In ritardo", tone: "danger" };
}

// ─────────────── Rilevamento degli attacchi ───────────────

export interface OnsetDetectorOptions {
  /** Livello minimo assoluto (RMS) di un attacco. */
  minLevel?: number;
  /** Di quanto il livello deve superare il minimo recente. */
  ratio?: number;
  /** Dopo un attacco, per quanto (s) non se ne cercano altri: le corde e le note che risuonano non contano. */
  refractory?: number;
}

/**
 * Rilevamento degli attacchi dal livello del segnale a blocchi brevi (pochi ms): c'è un attacco quando
 * il livello sale bruscamente rispetto al minimo degli ultimi ~60 ms. Restituisce l'istante dell'attacco o `null`.
 */
export function createOnsetDetector({ minLevel = 0.02, ratio = 2.2, refractory = 0.15 }: OnsetDetectorOptions = {}) {
  const history: { time: number; level: number }[] = [];
  let lastOnset = -Infinity;
  return {
    push(time: number, level: number): number | null {
      history.push({ time, level });
      while (history.length && time - history[0].time > 0.06) history.shift();
      if (time - lastOnset < refractory || level < minLevel) return null;
      const floor = Math.min(...history.map((h) => h.level));
      if (level < Math.max(floor, minLevel / ratio) * ratio) return null;
      lastOnset = time;
      return time;
    },
    reset() {
      history.length = 0;
      lastOnset = -Infinity;
    },
  };
}
