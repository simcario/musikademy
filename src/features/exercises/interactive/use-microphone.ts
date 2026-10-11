"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectPitch, rmsOf, type PitchReading } from "./pitch";

/** Ingresso scelto al primo utilizzo: resta sul dispositivo, non segue l'account. */
const STORAGE_KEY = "musikademy.mic";

export type MicErrorKind = "denied" | "missing" | "unsupported" | "failed";

export const MIC_ERROR_MESSAGE: Record<MicErrorKind, string> = {
  denied: "Permesso negato. Consenti l'uso del microfono nelle impostazioni del browser e riprova.",
  missing: "Nessun microfono trovato. Collegane uno e riprova.",
  unsupported: "Questo browser non permette di usare il microfono.",
  failed: "Non riesco ad accedere al microfono. Controlla che non sia usato da un'altra app e riprova.",
};

function loadDeviceId() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveDeviceId(deviceId: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, deviceId);
  } catch {
    // Navigazione privata: la scelta vale solo per questa sessione.
  }
}

function errorKind(e: unknown): MicErrorKind {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "unsupported";
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "missing";
  return "failed";
}

const stop = (stream: MediaStream | null) => stream?.getTracks().forEach((t) => t.stop());

/** I filtri pensati per la voce (eco, rumore, guadagno automatico) deformano il suono dello strumento. */
async function openStream(deviceId: string): Promise<MediaStream> {
  const audio = (id: string): MediaTrackConstraints => ({
    ...(id ? { deviceId: { exact: id } } : {}),
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  });
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: audio(deviceId) });
  } catch (e) {
    // L'ingresso salvato non c'è più (es. scheda audio scollegata): si ripiega su quello predefinito.
    if (deviceId && e instanceof DOMException && (e.name === "OverconstrainedError" || e.name === "NotFoundError")) {
      return navigator.mediaDevices.getUserMedia({ audio: audio("") });
    }
    throw e;
  }
}

/** Le etichette degli ingressi sono disponibili solo dopo aver ottenuto il permesso. */
async function listInputs() {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "audioinput" && d.deviceId);
}

/**
 * Microfono per gli esercizi interattivi. Al primo utilizzo (`setup`) l'utente concede il permesso
 * e, se ci sono più ingressi, sceglie quale usare; le volte successive si apre direttamente.
 */
export function useMicrophone() {
  const [status, setStatus] = useState<"checking" | "setup" | "ready">(() => (loadDeviceId() === null ? "setup" : "checking"));
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState<MicErrorKind | null>(null);
  const [busy, setBusy] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const alive = useRef(true);

  const open = useCallback(async (id: string) => {
    const next = await openStream(id);
    if (!alive.current) {
      stop(next);
      return;
    }
    stop(streamRef.current);
    streamRef.current = next;
    setStream(next);
    setDeviceId(next.getAudioTracks()[0]?.getSettings().deviceId ?? id);
    setError(null);
  }, []);

  /** Apre l'ingresso e aggiorna l'elenco; in caso di errore si torna alla configurazione. */
  const attempt = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await open(id);
        const inputs = await listInputs();
        if (!alive.current) return;
        setDevices(inputs);
      } catch (e) {
        if (!alive.current) return;
        setError(errorKind(e));
        setStatus("setup");
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [open],
  );

  useEffect(() => {
    alive.current = true;
    const saved = loadDeviceId();
    if (saved !== null) {
      open(saved)
        .then(listInputs)
        .then((inputs) => {
          if (!alive.current) return;
          setDevices(inputs);
          setStatus("ready");
        })
        .catch((e) => {
          if (!alive.current) return;
          setError(errorKind(e));
          setStatus("setup");
        });
    }
    return () => {
      alive.current = false;
      stop(streamRef.current);
      streamRef.current = null;
    };
  }, [open]);

  return {
    status,
    stream,
    devices,
    deviceId,
    error,
    busy,
    /** Chiede il permesso (su mobile compare la richiesta di sistema). */
    enable: () => attempt(deviceId),
    selectDevice: (id: string) => attempt(id),
    confirm: () => {
      saveDeviceId(deviceId);
      setStatus("ready");
    },
    reconfigure: () => setStatus("setup"),
  };
}

export type Microphone = ReturnType<typeof useMicrophone>;

/** Ogni quanto si analizza il segnale (ms): ~25 letture al secondo. */
const FRAME_MS = 40;
const BUFFER_SIZE = 2048;

/** Analizza il segnale del microfono e consegna a `onFrame` la nota rilevata (o `null`) e il livello. */
export function usePitchListener(stream: MediaStream | null, onFrame: (reading: PitchReading | null, level: number) => void) {
  const callback = useRef(onFrame);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    callback.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (!stream) return;
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    void ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = BUFFER_SIZE;
    source.connect(analyser);
    const buffer = new Float32Array(BUFFER_SIZE);
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buffer);
      callback.current(detectPitch(buffer, ctx.sampleRate), rmsOf(buffer));
    }, FRAME_MS);
    return () => {
      window.clearInterval(timer);
      source.disconnect();
      void ctx.close();
      ctxRef.current = null;
    };
  }, [stream]);

  /** Da chiamare su un gesto dell'utente: alcuni browser tengono sospeso l'audio finché non c'è un tocco. */
  return useCallback(() => void ctxRef.current?.resume(), []);
}
