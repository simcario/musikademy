"use client";

import { CircleCheckBig, Mic, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LevelMeter } from "./mic-setup";

/** Parti comuni ai giochi: schermata iniziale, conto alla rovescia, riquadro centrale, riepilogo. */

export const COUNTDOWN_FROM = 3;

export function GameIntro({ children, onStart }: { children: React.ReactNode; onStart: () => void }) {
  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
      <Button onClick={onStart} size="lg" className="w-full">
        <Play aria-hidden /> Inizia
      </Button>
    </div>
  );
}

export function GameHeader({ label, correct }: { label: string; correct: number }) {
  return (
    <div className="flex items-center justify-between text-sm font-semibold">
      <span>{label}</span>
      <span className="flex items-center gap-1 text-success tabular-nums">
        <CircleCheckBig className="size-4" aria-hidden /> {correct}
        <span className="sr-only"> corrette</span>
      </span>
    </div>
  );
}

/** Riquadro centrale; con `timerMs` mostra la barra del tempo, che riparte quando cambia `timerKey`. */
export function GameStage({ children, timerMs, timerKey }: { children: React.ReactNode; timerMs?: number | null; timerKey?: React.Key }) {
  return (
    <div
      className="relative flex min-h-44 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl bg-surface-mid p-4 text-center"
      aria-live="assertive"
    >
      {children}
      {!!timerMs && (
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-surface-highest" aria-hidden>
          <div key={timerKey} className="h-full origin-left bg-primary" style={{ animation: `countdown-bar ${timerMs}ms linear forwards` }} />
        </div>
      )}
    </div>
  );
}

export function Countdown({ count }: { count: number }) {
  return (
    <p key={count} className="animate-in text-7xl leading-none font-bold text-brand-ink tabular-nums zoom-in-50 fade-in-0">
      {count}
    </p>
  );
}

export function GameFooter({ level, onClose }: { level: number; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Mic className="size-4 shrink-0" aria-hidden />
      <div className="flex-1">
        <LevelMeter level={level} />
      </div>
      <Button variant="ghost" size="sm" onClick={onClose}>
        Termina
      </Button>
    </div>
  );
}

function verdict(correct: number, total: number) {
  const rate = correct / total;
  if (rate === 1) return "Perfetto, nessun errore!";
  if (rate >= 0.8) return "Ottimo lavoro!";
  if (rate >= 0.5) return "Buon inizio: riprova per migliorare.";
  return "Continua ad allenarti: con la pratica diventerà naturale.";
}

export function GameSummary({
  correct,
  total,
  caption,
  onRetry,
  onComplete,
  onClose,
}: {
  correct: number;
  total: number;
  /** Cosa conta il punteggio, es. "note riconosciute". */
  caption: string;
  onRetry: () => void;
  /** Se presente, lo studente può segnare l'esercizio come completato. */
  onComplete?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4 text-center">
      <div>
        <p className="text-5xl leading-tight font-bold tabular-nums">
          {correct}/{total}
        </p>
        <p className="text-sm text-muted-foreground">{caption}</p>
      </div>
      <p className="font-semibold">{verdict(correct, total)}</p>
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
