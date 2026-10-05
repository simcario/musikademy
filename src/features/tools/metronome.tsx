"use client";

import { useState } from "react";
import { Minus, Pause, Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMetronome } from "./use-metronome";

const MIN_BPM = 30;
const MAX_BPM = 260;
const MAX_BEATS = 8;

/** Tempi preimpostati; `from` è la soglia da cui il nome viene mostrato accanto ai BPM. */
const TEMPI = [
  { name: "Largo", bpm: 50, from: 0 },
  { name: "Adagio", bpm: 70, from: 60 },
  { name: "Andante", bpm: 90, from: 80 },
  { name: "Moderato", bpm: 112, from: 104 },
  { name: "Allegro", bpm: 132, from: 120 },
  { name: "Vivace", bpm: 160, from: 152 },
  { name: "Presto", bpm: 184, from: 176 },
];

/** Suddivisioni disponibili per ogni quarto: `value` = numero di note nel quarto. */
const SUBDIVISIONS = [
  { value: 1, label: "Quarto", short: "1/4" },
  { value: 2, label: "Ottavi", short: "1/8" },
  { value: 3, label: "Terzina", short: "3" },
  { value: 4, label: "Sedicesimi", short: "1/16" },
  { value: 6, label: "Sestina", short: "6" },
  { value: 8, label: "Trentaduesimi", short: "1/32" },
];

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

function Chip({ active, onClick, children, ...props }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
} & Pick<React.ComponentProps<"button">, "role" | "aria-checked" | "aria-pressed">) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-10 rounded-full border px-4 text-[13px] font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Metronome() {
  const [bpm, setBpm] = useState(90);
  const [beats, setBeats] = useState<number[]>([1, 1, 1, 1]);
  const [selected, setSelected] = useState(0);
  const { playing, position, toggle } = useMetronome(bpm, beats);

  const tempo = TEMPI.findLast((t) => bpm >= t.from) ?? TEMPI[0];
  const nudge = (delta: number) => setBpm((v) => clamp(v + delta, MIN_BPM, MAX_BPM));

  const setBeatCount = (count: number) => {
    const n = clamp(count, 1, MAX_BEATS);
    setBeats((b) => (n > b.length ? [...b, ...Array<number>(n - b.length).fill(1)] : b.slice(0, n)));
    setSelected((s) => Math.min(s, n - 1));
  };
  const setDivision = (value: number) => setBeats((b) => b.map((d, i) => (i === selected ? value : d)));

  return (
    <section aria-label="Metronomo" className="card-surface space-y-6 p-4 md:p-6">
      <h2 className="text-lg leading-[26px] font-semibold">Metronomo</h2>

      <div className="space-y-4">
        <div className="text-center">
          <p className="text-6xl leading-none font-bold tracking-tight tabular-nums">{bpm}</p>
          <p className="mt-1 text-sm font-medium text-muted-foreground">BPM · {tempo.name}</p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" onClick={() => nudge(-5)} disabled={bpm <= MIN_BPM} aria-label="Diminuisci di 5 BPM">
            −5
          </Button>
          <Button variant="outline" onClick={() => nudge(-1)} disabled={bpm <= MIN_BPM} aria-label="Diminuisci di 1 BPM">
            −1
          </Button>
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Ferma metronomo" : "Avvia metronomo"}
            className="mx-2 flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:bg-brand-hover active:scale-95"
          >
            {playing ? (
              <Pause className="size-7 fill-current" aria-hidden />
            ) : (
              <Play className="size-7 translate-x-px fill-current" aria-hidden />
            )}
          </button>
          <Button variant="outline" onClick={() => nudge(1)} disabled={bpm >= MAX_BPM} aria-label="Aumenta di 1 BPM">
            +1
          </Button>
          <Button variant="outline" onClick={() => nudge(5)} disabled={bpm >= MAX_BPM} aria-label="Aumenta di 5 BPM">
            +5
          </Button>
        </div>
        <input
          type="range"
          min={MIN_BPM}
          max={MAX_BPM}
          step={1}
          value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
          aria-label="Velocità"
          aria-valuetext={`${bpm} BPM`}
          className="h-2 w-full cursor-pointer accent-primary"
        />
      </div>

      <div className="space-y-2">
        <p className="section-label">Tempi preimpostati</p>
        <div className="flex flex-wrap gap-2">
          {TEMPI.map((t) => (
            <Chip key={t.name} active={bpm === t.bpm} aria-pressed={bpm === t.bpm} onClick={() => setBpm(t.bpm)}>
              {t.name} {t.bpm}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="section-label">Quarti per battuta</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setBeatCount(beats.length - 1)}
              disabled={beats.length <= 1}
              aria-label="Togli un quarto"
            >
              <Minus aria-hidden />
            </Button>
            <span className="w-10 text-center text-sm font-semibold tabular-nums">{beats.length}/4</span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setBeatCount(beats.length + 1)}
              disabled={beats.length >= MAX_BEATS}
              aria-label="Aggiungi un quarto"
            >
              <Plus aria-hidden />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {beats.map((division, i) => {
            const sounding = position?.beat === i;
            const isSelected = selected === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(i)}
                aria-pressed={isSelected}
                aria-label={`Quarto ${i + 1}: ${SUBDIVISIONS.find((s) => s.value === division)?.label}`}
                className={cn(
                  "flex min-h-24 flex-col items-center justify-between gap-2 rounded-xl border p-2 transition-colors",
                  isSelected ? "border-primary bg-indigo-soft" : "border-border bg-card hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full text-base font-bold tabular-nums",
                    sounding ? "bg-primary text-primary-foreground" : "bg-surface-mid text-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex flex-wrap items-center justify-center gap-1" aria-hidden>
                  {Array.from({ length: division }, (_, j) => (
                    <span
                      key={j}
                      className={cn(
                        "size-2 rounded-full",
                        sounding && position.sub === j ? "bg-primary" : "bg-surface-highest",
                      )}
                    />
                  ))}
                </span>
                <span className="text-[11px] leading-4 font-semibold text-muted-foreground">
                  {SUBDIVISIONS.find((s) => s.value === division)?.short}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex min-h-9 items-center justify-between gap-2">
          <p className="section-label">Suddivisione del quarto {selected + 1}</p>
          {beats.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setBeats((b) => b.map(() => b[selected]))}>
              Applica a tutti
            </Button>
          )}
        </div>
        <div role="radiogroup" aria-label={`Suddivisione del quarto ${selected + 1}`} className="flex flex-wrap gap-2">
          {SUBDIVISIONS.map((s) => (
            <Chip
              key={s.value}
              role="radio"
              active={beats[selected] === s.value}
              aria-checked={beats[selected] === s.value}
              onClick={() => setDivision(s.value)}
            >
              {s.label}
            </Chip>
          ))}
        </div>
      </div>
    </section>
  );
}
