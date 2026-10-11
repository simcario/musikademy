"use client";

import { useState } from "react";
import { Loader2, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/shared/form";
import { noteName, pitchClassOf } from "./pitch";
import { MIC_ERROR_MESSAGE, usePitchListener, type Microphone } from "./use-microphone";

/** Livello (RMS) che riempie tutta la barra: una nota suonata con decisione vicino al microfono. */
const FULL_LEVEL = 0.25;

export function LevelMeter({ level }: { level: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-highest" aria-hidden>
      <div
        className="h-full origin-left rounded-full bg-success transition-transform duration-75"
        style={{ transform: `scaleX(${Math.min(1, level / FULL_LEVEL)})` }}
      />
    </div>
  );
}

/** Primo utilizzo: permesso al microfono, scelta dell'ingresso (se più di uno) e prova del segnale. */
export function MicSetup({ mic }: { mic: Microphone }) {
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState<number | null>(null);
  usePitchListener(mic.stream, (reading, lvl) => {
    setLevel(lvl);
    if (reading) setHeard(pitchClassOf(reading.frequency));
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-indigo-soft text-brand-ink">
          <Mic className="size-5" aria-hidden />
        </span>
        <div className="space-y-1">
          <h3 className="font-semibold">Configura il microfono</h3>
          <p className="text-sm text-muted-foreground">
            Serve per riconoscere le note che suoni. Il suono viene analizzato su questo dispositivo: non viene registrato né inviato.
          </p>
        </div>
      </div>

      {mic.error && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm font-medium text-danger">
          {MIC_ERROR_MESSAGE[mic.error]}
        </p>
      )}

      {!mic.stream ? (
        <Button onClick={mic.enable} disabled={mic.busy} className="w-full">
          {mic.busy ? <Loader2 className="animate-spin" aria-hidden /> : <Mic aria-hidden />}
          Attiva il microfono
        </Button>
      ) : (
        <>
          {mic.devices.length > 1 && (
            <Field label="Ingresso audio">
              {(p) => (
                <NativeSelect {...p} value={mic.deviceId} disabled={mic.busy} onChange={(e) => mic.selectDevice(e.target.value)}>
                  {mic.devices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microfono ${i + 1}`}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          )}
          <div className="space-y-2 rounded-xl bg-surface-mid p-3">
            <p className="text-sm font-medium">Suona una nota per provare</p>
            <LevelMeter level={level} />
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {heard === null ? "In ascolto…" : `Nota rilevata: ${noteName(heard)}`}
            </p>
          </div>
          <Button onClick={mic.confirm} disabled={mic.busy} className="w-full">
            Conferma e continua
          </Button>
        </>
      )}
    </div>
  );
}
