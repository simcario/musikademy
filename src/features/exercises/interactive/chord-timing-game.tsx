"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheckBig, Headphones, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { scheduleClick } from "@/features/tools/use-metronome";
import { cn } from "@/lib/utils";
import type { Chord, ChordTimingExercise } from "@/types";
import {
  chordLabel,
  chordSequence,
  chromaFromSpectrum,
  createOnsetDetector,
  matchesChord,
  maxOffset,
  timingScore,
  timingVerdict,
} from "./chords";
import { Countdown, GameFooter, GameIntro, GameStage } from "./game-ui";
import type { GameProps } from "./note-quiz-game";

/** Battuta a vuoto prima del primo accordo. */
const COUNT_IN = 4;
const CLICK_VOLUME = 0.45;
/** Dopo l'attacco si aspetta che l'accordo suoni pieno prima di riconoscerlo. */
const CHROMA_DELAY_MS = 200;
const FFT_SIZE = 8192;
/**
 * Gli attacchi si cercano nel segnale filtrato sotto i 500 Hz: il clic del metronomo (oltre 1 kHz)
 * che rientra nel microfono viene attenuato di decine di dB, il corpo dell'accordo no.
 */
const ONSET_LOWPASS_HZ = 500;

/**
 * Livello del segnale ogni 128 campioni (≈ 3 ms), con l'istante esatto sul clock audio: un timer
 * del main thread non basterebbe per misurare scarti di poche decine di millisecondi.
 */
const LEVEL_WORKLET = `
class MusikademyLevel extends AudioWorkletProcessor {
  constructor() { super(); this.batch = []; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      let e = 0;
      for (let i = 0; i < ch.length; i++) e += ch[i] * ch[i];
      this.batch.push(currentTime, Math.sqrt(e / ch.length));
      if (this.batch.length >= 8) { this.port.postMessage(this.batch); this.batch = []; }
    }
    return true;
  }
}
registerProcessor("musikademy-level", MusikademyLevel);
`;

/** Esito di un cambio d'accordo: scarto dell'attacco (s, negativo = in anticipo) e accordo riconosciuto. */
interface ChangeResult {
  offset: number | null;
  chordOk: boolean | null;
}

interface Session {
  ctx: AudioContext;
  analyser: AnalyserNode;
  meter: AudioWorkletNode;
  clickOut: GainNode | null;
  /** Ritardo stimato tra il clic programmato e il suono dello studente che torna nel microfono. */
  latency: number;
}

const TONE_TEXT = { success: "text-success", warning: "text-warning", danger: "text-danger" } as const;

const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Precisione media (0–100) dei cambi già valutati: un cambio mancato vale zero. */
function precisionOf(results: ChangeResult[], beatLength: number) {
  const done = results.filter((r) => r.offset !== null || r.chordOk === false);
  return Math.round(average(done.map((r) => (r.offset === null ? 0 : timingScore(r.offset, beatLength)))) * 100);
}

/**
 * Accordi a tempo: dopo una battuta di conteggio il metronomo continua e lo studente suona gli
 * accordi, cambiando ogni `beatsPerChord` quarti. Il microfono rileva l'attacco di ogni cambio e
 * ne misura lo scarto dal battito; la barra mostra la precisione media. Il cromagramma subito dopo
 * l'attacco dice se l'accordo suonato è quello richiesto.
 */
export function ChordTimingGame({ exercise, stream, onComplete, onClose }: GameProps<ChordTimingExercise>) {
  const { bpm, beatsPerChord, changes } = exercise;
  const beatLength = 60 / bpm;
  const [phase, setPhase] = useState<"idle" | "preparing" | "counting" | "playing" | "done">("idle");
  const [sequence, setSequence] = useState<Chord[]>([]);
  const [results, setResults] = useState<ChangeResult[]>([]);
  const [beat, setBeat] = useState(-1);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const session = useRef<Session | null>(null);
  const startAt = useRef(0);
  const resultsRef = useRef<ChangeResult[]>([]);
  const sequenceRef = useRef<Chord[]>([]);
  const running = useRef(false);
  const detector = useRef(createOnsetDetector());

  const changeTime = useCallback((i: number) => startAt.current + (COUNT_IN + i * beatsPerChord) * beatLength, [beatsPerChord, beatLength]);

  const update = (i: number, patch: Partial<ChangeResult>) => {
    resultsRef.current = resultsRef.current.map((r, j) => (j === i ? { ...r, ...patch } : r));
    setResults(resultsRef.current);
  };

  /** Grafo audio: microfono → analizzatore (accordo) e → filtri passa-basso → misuratore di livello (attacchi). */
  const prepare = useCallback(async (): Promise<Session> => {
    if (session.current) return session.current;
    const ctx = new AudioContext({ latencyHint: "interactive" });
    await ctx.resume();
    const url = URL.createObjectURL(new Blob([LEVEL_WORKLET], { type: "application/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    let node: AudioNode = source;
    for (let i = 0; i < 3; i++) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = ONSET_LOWPASS_HZ;
      node.connect(lp);
      node = lp;
    }
    const meter = new AudioWorkletNode(ctx, "musikademy-level");
    node.connect(meter);
    // Il nodo va collegato all'uscita perché il browser lo elabori: a volume zero.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    meter.connect(mute).connect(ctx.destination);
    const inputLatency = (stream.getAudioTracks()[0]?.getSettings() as { latency?: number }).latency ?? 0;
    const latency = (ctx.outputLatency || ctx.baseLatency || 0) + inputLatency;
    session.current = { ctx, analyser, meter, clickOut: null, latency };
    return session.current;
  }, [stream]);

  /** Attacco rilevato all'istante `time` (clock audio): si associa al cambio d'accordo più vicino, se entro la tolleranza. */
  const onOnset = useCallback(
    (time: number) => {
      const s = session.current;
      if (!s || !running.current) return;
      const t = time - s.latency;
      const max = maxOffset(beatLength);
      const i = Math.round((t - changeTime(0)) / (beatsPerChord * beatLength));
      if (i < 0 || i >= sequenceRef.current.length) return;
      const offset = t - changeTime(i);
      const r = resultsRef.current[i];
      if (Math.abs(offset) > max || !r || r.offset !== null || r.chordOk === false) return;
      update(i, { offset });
      window.setTimeout(() => {
        if (!session.current) return;
        const db = new Float32Array(s.analyser.frequencyBinCount);
        s.analyser.getFloatFrequencyData(db);
        const chroma = chromaFromSpectrum(db, s.ctx.sampleRate, FFT_SIZE);
        update(i, { chordOk: matchesChord(chroma, sequenceRef.current[i]) });
      }, CHROMA_DELAY_MS);
    },
    [beatLength, beatsPerChord, changeTime],
  );

  // Livello e attacchi dal worklet.
  useEffect(() => {
    const s = session.current;
    if (!s || phase === "idle" || phase === "preparing") return;
    s.meter.port.onmessage = (e: MessageEvent<number[]>) => {
      const batch = e.data;
      for (let k = 0; k < batch.length; k += 2) {
        const onset = detector.current.push(batch[k], batch[k + 1]);
        if (onset !== null) onOnset(onset);
      }
      setLevel(batch[batch.length - 1] * 4);
    };
    return () => {
      s.meter.port.onmessage = null;
    };
  }, [phase, onOnset]);

  // I quarti seguono il clock audio; i cambi oltre la tolleranza senza attacco sono mancati.
  useEffect(() => {
    const s = session.current;
    if (!s || (phase !== "counting" && phase !== "playing")) return;
    let frame = 0;
    const total = COUNT_IN + sequenceRef.current.length * beatsPerChord;
    const loop = () => {
      const now = s.ctx.currentTime - s.latency;
      const index = Math.floor((now - startAt.current) / beatLength);
      setBeat(index);
      if (index >= COUNT_IN && phase === "counting") setPhase("playing");
      const max = maxOffset(beatLength);
      resultsRef.current.forEach((r, i) => {
        if (r.offset === null && r.chordOk === null && now > changeTime(i) + max) update(i, { chordOk: false });
      });
      if (index >= total) {
        running.current = false;
        s.clickOut?.disconnect();
        setPhase("done");
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, beatLength, beatsPerChord, changeTime]);

  useEffect(
    () => () => {
      running.current = false;
      void session.current?.ctx.close();
      session.current = null;
    },
    [],
  );

  const start = async () => {
    setError(null);
    setPhase("preparing");
    let s: Session;
    try {
      s = await prepare();
    } catch {
      setError("Questo browser non permette di misurare il tempo dal microfono. Prova con Chrome, Edge, Firefox o Safari aggiornati.");
      setPhase("idle");
      return;
    }
    const seq = chordSequence(exercise.chords, exercise.order, changes);
    sequenceRef.current = seq;
    resultsRef.current = seq.map(() => ({ offset: null, chordOk: null }));
    setSequence(seq);
    setResults(resultsRef.current);
    detector.current.reset();

    s.clickOut?.disconnect();
    const out = s.ctx.createGain();
    out.gain.value = CLICK_VOLUME;
    out.connect(s.ctx.destination);
    s.clickOut = out;
    const first = s.ctx.currentTime + 0.3;
    const total = COUNT_IN + seq.length * beatsPerChord;
    for (let i = 0; i < total; i++) {
      const isChange = i >= COUNT_IN && (i - COUNT_IN) % beatsPerChord === 0;
      scheduleClick(s.ctx, out, first + i * beatLength, i === 0 || isChange ? "accent" : "beat");
    }
    // I tempi attesi sono quelli in cui lo studente sente il clic: si confrontano al netto della latenza.
    startAt.current = first;
    running.current = true;
    setBeat(-1);
    setPhase("counting");
  };

  const stop = () => {
    running.current = false;
    session.current?.clickOut?.disconnect();
    onClose();
  };

  if (phase === "idle" || phase === "preparing") {
    return (
      <div className="space-y-3">
        <GameIntro onStart={start}>
          Il metronomo ({bpm} BPM) conta una battuta (4-3-2-1), poi suona gli accordi che compaiono, cambiando accordo{" "}
          {beatsPerChord === 1 ? "a ogni battito" : `ogni ${beatsPerChord} battiti`}: attacca ogni nuovo accordo esattamente sul clic. La
          barra mostra quanto sei preciso. {changes} accordi.
        </GameIntro>
        <p className="flex items-start gap-2 rounded-xl bg-surface-mid p-3 text-xs text-muted-foreground">
          <Headphones className="mt-0.5 size-4 shrink-0" aria-hidden />
          Con le cuffie la misura è più precisa: il microfono non sente il metronomo.
        </p>
        {phase === "preparing" && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Preparo l&apos;audio…
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  const precision = precisionOf(results, beatLength);

  if (phase === "done") {
    return <TimingSummary results={results} precision={precision} beatLength={beatLength} onRetry={start} onComplete={onComplete} onClose={onClose} />;
  }

  const playing = beat - COUNT_IN;
  const current = playing >= 0 ? Math.min(sequence.length - 1, Math.floor(playing / beatsPerChord)) : -1;
  const shown = Math.max(0, current);
  const beatInChord = playing >= 0 ? playing % beatsPerChord : -1;
  const evaluated = results.filter((r) => r.offset !== null || r.chordOk === false);
  const last = [...results].reverse().find((r) => r.offset !== null || r.chordOk === false);
  const verdict = last ? timingVerdict(last.offset, beatLength) : null;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm font-semibold">
          <span>
            Accordo {Math.max(1, current + 1)} di {sequence.length} · {bpm} BPM
          </span>
          <span className="tabular-nums">{evaluated.length ? `${precision}%` : "—"}</span>
        </div>
        <Progress value={evaluated.length ? precision : 0} aria-label="Precisione del tempo" />
        <p className="text-xs text-muted-foreground">Precisione del tempo</p>
      </div>

      <GameStage>
        {phase === "counting" ? (
          <>
            <p className="section-label">Preparati: primo accordo {chordLabel(sequence[0])}</p>
            <Countdown count={COUNT_IN - Math.max(0, Math.min(beat, COUNT_IN - 1))} />
          </>
        ) : (
          <>
            <p className="text-6xl leading-none font-bold text-brand-ink">{chordLabel(sequence[shown])}</p>
            {shown + 1 < sequence.length && (
              <p className="text-sm font-medium text-muted-foreground">Poi: {chordLabel(sequence[shown + 1])}</p>
            )}
            <div className="flex h-10 items-center gap-2" aria-hidden>
              {Array.from({ length: beatsPerChord }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-sm font-bold",
                    beatInChord === i ? "bg-primary text-primary-foreground" : "bg-surface-highest text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
              ))}
            </div>
            {verdict && (
              <p className={cn("text-sm font-semibold", TONE_TEXT[verdict.tone])}>
                {verdict.label}
                {last?.offset != null && ` (${last.offset > 0 ? "+" : ""}${Math.round(last.offset * 1000)} ms)`}
                {last?.chordOk === false && last.offset !== null && " · accordo non riconosciuto"}
              </p>
            )}
          </>
        )}
      </GameStage>

      <GameFooter level={level} onClose={stop} />
    </div>
  );
}

function TimingSummary({
  results,
  precision,
  beatLength,
  onRetry,
  onComplete,
  onClose,
}: {
  results: ChangeResult[];
  precision: number;
  beatLength: number;
  onRetry: () => void;
  onComplete?: () => void;
  onClose: () => void;
}) {
  const hits = results.filter((r) => r.offset !== null);
  const recognized = results.filter((r) => r.chordOk).length;
  const perfect = hits.filter((r) => timingScore(r.offset!, beatLength) >= 0.95).length;
  const mean = average(hits.map((r) => r.offset!));
  const tendency =
    hits.length < 3 || Math.abs(mean) < 0.02
      ? "Nessuna tendenza: né in anticipo né in ritardo."
      : mean < 0
        ? `Tendi ad anticipare (in media ${Math.round(-mean * 1000)} ms).`
        : `Tendi a ritardare (in media ${Math.round(mean * 1000)} ms).`;
  const message =
    precision >= 90 ? "Tempo impeccabile!" : precision >= 70 ? "Ottimo controllo del tempo." : precision >= 40 ? "Buon inizio: riprova per migliorare." : "Continua ad allenarti, magari a una velocità più bassa.";

  return (
    <div className="space-y-4 text-center">
      <div className="space-y-2">
        <p className="text-5xl leading-tight font-bold tabular-nums">{precision}%</p>
        <Progress value={precision} aria-label="Precisione del tempo" />
        <p className="text-sm text-muted-foreground">precisione del tempo</p>
      </div>
      <p className="font-semibold">{message}</p>
      <ul className="space-y-1 text-sm text-muted-foreground">
        <li>
          Attacchi a tempo: {hits.length}/{results.length} ({perfect} perfetti)
        </li>
        <li>
          Accordi riconosciuti: {recognized}/{results.length}
        </li>
        <li>{tendency}</li>
      </ul>
      <div className="flex flex-col gap-2">
        <Button onClick={onRetry}>
          <RotateCcw aria-hidden /> Riprova
        </Button>
        {onComplete && (
          <Button variant="outline" onClick={onComplete}>
            <CircleCheckBig aria-hidden /> Segna come completato
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          Chiudi
        </Button>
      </div>
    </div>
  );
}
