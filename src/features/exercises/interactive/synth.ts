"use client";

/**
 * Sintetizzatore per gli esercizi d'ascolto: un suono simile al pianoforte (qualche armonico con
 * decadimento esponenziale), programmato sul clock della Web Audio API. Nessun campione da scaricare.
 */

const PARTIALS = [
  { ratio: 1, gain: 1 },
  { ratio: 2, gain: 0.45 },
  { ratio: 3, gain: 0.2 },
  { ratio: 4, gain: 0.08 },
];

export const midiToFrequency = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export function createSynth() {
  const ctx = new AudioContext();
  const out = ctx.createGain();
  out.gain.value = 0.5;
  // Un compressore evita che gli accordi a quattro voci saturino.
  const comp = ctx.createDynamicsCompressor();
  out.connect(comp).connect(ctx.destination);
  let voices: AudioScheduledSourceNode[] = [];

  function note(midi: number, time: number, duration: number, velocity = 0.8) {
    const frequency = midiToFrequency(midi);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(velocity * 0.3, time + 0.008);
    env.gain.exponentialRampToValueAtTime(velocity * 0.12, time + 0.25);
    env.gain.setTargetAtTime(0.0001, time + duration, 0.08);
    env.connect(out);
    for (const p of PARTIALS) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency * p.ratio;
      // Gli armonici alti si spengono prima, come in una corda vera.
      g.gain.setValueAtTime(p.gain, time);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, p.gain * 0.2), time + 0.4 / p.ratio + 0.3);
      osc.connect(g).connect(env);
      osc.start(time);
      osc.stop(time + duration + 0.5);
      voices.push(osc);
      osc.onended = () => (voices = voices.filter((v) => v !== osc));
    }
  }

  return {
    ctx,
    /** Da chiamare su un gesto dell'utente: alcuni browser tengono sospeso l'audio finché non c'è un tocco. */
    resume: () => void ctx.resume(),
    now: () => ctx.currentTime,
    note,
    chord(midis: number[], time: number, duration: number) {
      midis.forEach((m, i) => note(m, time + i * 0.012, duration, i === 0 ? 0.7 : 0.55));
    },
    /** Ferma tutto ciò che è stato programmato. */
    stop() {
      voices.forEach((v) => {
        try {
          v.stop();
        } catch {
          // Già fermato.
        }
      });
      voices = [];
    },
    close: () => void ctx.close(),
  };
}

export type Synth = ReturnType<typeof createSynth>;
