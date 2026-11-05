"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/shared/form";
import { cn } from "@/lib/utils";
import {
  CHORD_COMPLEXITIES,
  MEASURE_DIFFICULTIES,
  SCALE_TYPES,
  type Chord,
  type ChordComplexity,
  type ChordQuality,
  type ChordTimingExercise,
  type EarNotesExercise,
  type ProgressionsExercise,
  type Clef,
  type InteractiveExercise,
  type IntervalsExercise,
  type MeasureDifficulty,
  type ScalesExercise,
  type StaffNotesExercise,
} from "@/types";
import { InteractiveIcon, catalogEntry } from "./catalog";
import { COMPLEXITY_META, QUALITY_META, ROOT_NAMES, allowedAt, chordLabel } from "./chords";
import { PROGRESSION_LEVELS } from "./ear";
import { LEVEL_LABEL } from "./intervals";
import { SCALE_META } from "./scales";
import { CLEF_LABEL } from "./staff";
import { StaffView } from "./staff-view";

/** Le opzioni previste più il valore già salvato, se diverso. */
const withCurrent = (options: number[], current: number | null) =>
  [...new Set(current === null ? options : [...options, current])].sort((a, b) => a - b);

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Scelta di un numero da un elenco; con `none` è ammesso anche "nessun valore" (es. senza limite di tempo). */
function NumberSelect({
  label,
  value,
  options,
  unit,
  none,
  onChange,
}: {
  label: string;
  value: number | null;
  options: number[];
  unit: string;
  none?: string;
  onChange: (v: number | null) => void;
}) {
  return (
    <Field label={label}>
      {(p) => (
        <NativeSelect {...p} value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
          {none && <option value="">{none}</option>}
          {withCurrent(options, value).map((n) => (
            <option key={n} value={n}>
              {n} {unit}
            </option>
          ))}
        </NativeSelect>
      )}
    </Field>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
      <input type="checkbox" className="size-[18px] shrink-0 rounded accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/** Scelta a schede: un'opzione per scheda, con descrizione ed eventuale anteprima. */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string; preview?: React.ReactNode }[];
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-[13px] font-medium">{label}</legend>
      <div className={cn("grid gap-2", options.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer flex-col gap-1 rounded-xl border border-border bg-card p-3 has-checked:border-primary has-checked:bg-indigo-soft/60 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            <input type="radio" name={name} className="sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.preview}
            <span className="text-sm font-semibold">{o.label}</span>
            {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const TIME_LIMIT = { label: "Limite di tempo", none: "Senza limite", unit: "secondi" };

const clefPreview = (clef: Clef) => <StaffView clef={clef} items={[]} className="mx-auto max-w-28" />;
const CLEF_OPTIONS = (["treble", "bass"] as const).map((clef) => ({ value: clef, label: CLEF_LABEL[clef], preview: clefPreview(clef) }));

const DIFFICULTY: Record<MeasureDifficulty, { label: string; hint: string }> = {
  easy: { label: "Facile", hint: "Quattro semiminime per gradi congiunti, dentro il pentagramma." },
  medium: { label: "Media", hint: "Minime e semiminime, con salti di terza." },
  hard: { label: "Difficile", hint: "Anche crome, salti fino alla quinta e tagli addizionali." },
};

export interface SettingsStep {
  title: string;
  content: React.ReactNode;
  /** Se presente, il passo non si supera finché non è risolto. */
  error?: string;
}

const MAX_CHORDS = 12;

/** Scelta degli accordi, nell'ordine in cui verranno suonati: fondamentale + qualità tra quelle della complessità. */
function ChordPicker({ value, onChange }: { value: ChordTimingExercise; onChange: (v: ChordTimingExercise) => void }) {
  const meta = COMPLEXITY_META[value.complexity];
  const [root, setRoot] = useState(meta.roots[0]);
  const [quality, setQuality] = useState<ChordQuality>(meta.qualities[0]);
  const validRoot = meta.roots.includes(root) ? root : meta.roots[0];
  const validQuality = meta.qualities.includes(quality) ? quality : meta.qualities[0];
  const set = (chords: Chord[]) => onChange({ ...value, chords });

  return (
    <div className="space-y-3">
      <fieldset className="space-y-1.5">
        <legend className="text-[13px] font-medium">Accordi da suonare, in ordine</legend>
        {value.chords.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun accordo: aggiungine almeno uno.</p>
        ) : (
          <ol className="flex flex-wrap gap-2">
            {value.chords.map((c, i) => (
              <li key={`${i}-${c.root}-${c.quality}`}>
                <span className="inline-flex min-h-10 items-center gap-1 rounded-full border border-border bg-card pr-1 pl-3 text-sm font-semibold">
                  <span className="text-xs text-muted-foreground tabular-nums">{i + 1}.</span> {chordLabel(c)}
                  <button
                    type="button"
                    onClick={() => set(value.chords.filter((_, j) => j !== i))}
                    aria-label={`Togli ${chordLabel(c)}`}
                    className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </fieldset>
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <Field label="Fondamentale">
          {(p) => (
            <NativeSelect {...p} value={validRoot} onChange={(e) => setRoot(Number(e.target.value))}>
              {meta.roots.map((r) => (
                <option key={r} value={r}>
                  {ROOT_NAMES[r]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Tipo">
          {(p) => (
            <NativeSelect {...p} value={validQuality} onChange={(e) => setQuality(e.target.value as ChordQuality)}>
              {meta.qualities.map((q) => (
                <option key={q} value={q}>
                  {QUALITY_META[q].label}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Button
          type="button"
          variant="outline"
          disabled={value.chords.length >= MAX_CHORDS}
          onClick={() => set([...value.chords, { root: validRoot, quality: validQuality }])}
        >
          <Plus aria-hidden /> Aggiungi
        </Button>
      </div>
      <Choice<ChordTimingExercise["order"]>
        label="Ordine"
        value={value.order}
        onChange={(order) => onChange({ ...value, order })}
        options={[
          { value: "sequence", label: "In questo ordine", hint: "La sequenza si ripete: ideale per una progressione." },
          { value: "random", label: "A caso", hint: "Un accordo a caso ogni volta, mai due uguali di fila." },
        ]}
      />
    </div>
  );
}

/**
 * Impostazioni di un esercizio interattivo, divise in passi: il form di assegnazione li mostra
 * tutti insieme, il wizard uno alla volta.
 */
export function settingsSteps(value: InteractiveExercise, onChange: (v: InteractiveExercise) => void): SettingsStep[] {
  switch (value.kind) {
    case "piano-keys":
      return [
        {
          title: "Impostazioni",
          content: (
            <>
              <NumberSelect
                label="Note da riconoscere"
                value={value.rounds}
                options={[5, 10, 15, 20]}
                unit="note"
                onChange={(rounds) => onChange({ ...value, rounds: rounds ?? value.rounds })}
              />
              <Check checked={value.accidentals} onChange={(accidentals) => onChange({ ...value, accidentals })}>
                Includi i tasti neri (diesis e bemolle)
              </Check>
            </>
          ),
        },
      ];

    case "scales":
      return [
        {
          title: "Impostazioni",
          content: (
            <>
              <Field label="Tipo di scala">
                {(p) => (
                  <NativeSelect {...p} value={value.scale} onChange={(e) => onChange({ ...value, scale: e.target.value as ScalesExercise["scale"] })}>
                    {SCALE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {capitalize(SCALE_META[t].label)}
                      </option>
                    ))}
                    <option value="mixed">Mista (un tipo a caso ogni volta)</option>
                  </NativeSelect>
                )}
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberSelect
                  label="Scale da suonare"
                  value={value.rounds}
                  options={[3, 5, 8, 10]}
                  unit="scale"
                  onChange={(rounds) => onChange({ ...value, rounds: rounds ?? value.rounds })}
                />
                <NumberSelect
                  {...TIME_LIMIT}
                  label="Tempo per ogni scala"
                  value={value.timeLimit}
                  options={[15, 20, 30, 45, 60]}
                  onChange={(timeLimit) => onChange({ ...value, timeLimit })}
                />
              </div>
              <Check checked={value.accidentals} onChange={(accidentals) => onChange({ ...value, accidentals })}>
                Includi le tonalità con la tonica su un tasto nero
              </Check>
            </>
          ),
        },
      ];

    case "intervals":
      return [
        {
          title: "Impostazioni",
          content: (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Intervalli">
                  {(p) => (
                    <NativeSelect {...p} value={value.level} onChange={(e) => onChange({ ...value, level: e.target.value as IntervalsExercise["level"] })}>
                      {Object.entries(LEVEL_LABEL).map(([level, label]) => (
                        <option key={level} value={level}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
                <Field label="Direzione">
                  {(p) => (
                    <NativeSelect
                      {...p}
                      value={value.direction}
                      onChange={(e) => onChange({ ...value, direction: e.target.value as IntervalsExercise["direction"] })}
                    >
                      <option value="up">Ascendenti</option>
                      <option value="down">Discendenti</option>
                      <option value="mixed">Ascendenti e discendenti</option>
                    </NativeSelect>
                  )}
                </Field>
                <NumberSelect
                  label="Intervalli da suonare"
                  value={value.rounds}
                  options={[5, 10, 15, 20]}
                  unit="intervalli"
                  onChange={(rounds) => onChange({ ...value, rounds: rounds ?? value.rounds })}
                />
                <NumberSelect
                  {...TIME_LIMIT}
                  label="Tempo per ogni intervallo"
                  value={value.timeLimit}
                  options={[5, 10, 15, 20, 30]}
                  onChange={(timeLimit) => onChange({ ...value, timeLimit })}
                />
              </div>
              <Check checked={value.accidentals} onChange={(accidentals) => onChange({ ...value, accidentals })}>
                Includi le note di partenza alterate (Si♭, Fa♯…)
              </Check>
            </>
          ),
        },
      ];

    case "staff-notes":
      return [
        {
          title: "Chiave",
          content: (
            <Choice<StaffNotesExercise["clef"]>
              label="In quale chiave sono scritte le note?"
              value={value.clef}
              onChange={(clef) => onChange({ ...value, clef })}
              options={[...CLEF_OPTIONS, { value: "mixed", label: "Entrambe", hint: "Ogni nota in una chiave a caso." }]}
            />
          ),
        },
        {
          title: "Note",
          content: (
            <>
              <Choice<StaffNotesExercise["range"]>
                label="Quali note possono uscire?"
                value={value.range}
                onChange={(range) => onChange({ ...value, range })}
                options={[
                  { value: "staff", label: "Dentro il pentagramma", hint: "Righe e spazi, senza tagli addizionali." },
                  { value: "ledger", label: "Con tagli addizionali", hint: "Fino a due tagli sopra e sotto il pentagramma." },
                ]}
              />
              <Check checked={value.accidentals} onChange={(accidentals) => onChange({ ...value, accidentals })}>
                Includi diesis e bemolle
              </Check>
              <Check checked={value.strictOctave} onChange={(strictOctave) => onChange({ ...value, strictOctave })}>
                La nota vale solo nell&apos;ottava in cui è scritta
              </Check>
            </>
          ),
        },
        {
          title: "Sessione",
          content: (
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberSelect
                label="Note da suonare"
                value={value.rounds}
                options={[5, 10, 15, 20]}
                unit="note"
                onChange={(rounds) => onChange({ ...value, rounds: rounds ?? value.rounds })}
              />
              <NumberSelect
                {...TIME_LIMIT}
                label="Tempo per ogni nota"
                value={value.timeLimit}
                options={[5, 10, 15, 20]}
                onChange={(timeLimit) => onChange({ ...value, timeLimit })}
              />
            </div>
          ),
        },
      ];

    case "staff-measure":
      return [
        {
          title: "Chiave",
          content: (
            <Choice<Clef>
              label="In quale chiave è scritta la battuta?"
              value={value.clef}
              onChange={(clef) => onChange({ ...value, clef })}
              options={CLEF_OPTIONS}
            />
          ),
        },
        {
          title: "Difficoltà",
          content: (
            <Choice<MeasureDifficulty>
              label="Quanto è difficile la battuta?"
              value={value.difficulty}
              onChange={(difficulty) => onChange({ ...value, difficulty })}
              options={MEASURE_DIFFICULTIES.map((d) => ({ value: d, ...DIFFICULTY[d] }))}
            />
          ),
        },
        {
          title: "Metronomo",
          content: (
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberSelect
                label="Velocità del metronomo"
                value={value.bpm}
                options={[50, 60, 72, 80, 92, 100]}
                unit="BPM"
                none="Senza metronomo (solo lettura)"
                onChange={(bpm) => onChange({ ...value, bpm })}
              />
              <NumberSelect
                label="Battute da suonare"
                value={value.rounds}
                options={[3, 5, 8, 10]}
                unit="battute"
                onChange={(rounds) => onChange({ ...value, rounds: rounds ?? value.rounds })}
              />
            </div>
          ),
        },
      ];

    case "chord-timing":
      return [
        {
          title: "Complessità",
          content: (
            <Choice<ChordComplexity>
              label="Quali accordi si possono usare?"
              value={value.complexity}
              // Cambiando complessità restano solo gli accordi ammessi.
              onChange={(complexity) => onChange({ ...value, complexity, chords: value.chords.filter((c) => allowedAt(c, complexity)) })}
              options={CHORD_COMPLEXITIES.map((c) => ({ value: c, label: COMPLEXITY_META[c].label, hint: COMPLEXITY_META[c].hint }))}
            />
          ),
        },
        {
          title: "Accordi",
          content: <ChordPicker value={value} onChange={onChange} />,
          error: value.chords.length ? undefined : "Aggiungi almeno un accordo",
        },
        {
          title: "Tempo",
          content: (
            <>
              <Choice<string>
                label="Ogni quanti battiti cambia l'accordo?"
                value={String(value.beatsPerChord)}
                onChange={(v) => onChange({ ...value, beatsPerChord: Number(v) as ChordTimingExercise["beatsPerChord"] })}
                options={[
                  { value: "4", label: "Ogni 4 battiti", hint: "Un accordo per battuta." },
                  { value: "2", label: "Ogni 2 battiti", hint: "Due accordi per battuta." },
                  { value: "1", label: "A ogni battito", hint: "Il cambio più rapido." },
                ]}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberSelect
                  label="Velocità del metronomo"
                  value={value.bpm}
                  options={[50, 60, 72, 80, 92, 100, 120]}
                  unit="BPM"
                  onChange={(bpm) => onChange({ ...value, bpm: bpm ?? value.bpm })}
                />
                <NumberSelect
                  label="Accordi da suonare"
                  value={value.changes}
                  options={[8, 12, 16, 24, 32]}
                  unit="accordi"
                  onChange={(changes) => onChange({ ...value, changes: changes ?? value.changes })}
                />
              </div>
            </>
          ),
        },
      ];

    case "ear-notes":
      return [
        {
          title: "Impostazioni",
          content: (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Scala">
                  {(p) => (
                    <NativeSelect {...p} value={value.scale} onChange={(e) => onChange({ ...value, scale: e.target.value as EarNotesExercise["scale"] })}>
                      <option value="major">Maggiore</option>
                      <option value="minor">Minore</option>
                      <option value="mixed">Maggiore o minore, a caso</option>
                    </NativeSelect>
                  )}
                </Field>
                <Field label="Tonica">
                  {(p) => (
                    <NativeSelect {...p} value={value.tonic} onChange={(e) => onChange({ ...value, tonic: e.target.value as EarNotesExercise["tonic"] })}>
                      <option value="fixed">Sempre Do</option>
                      <option value="random">A caso a ogni domanda</option>
                    </NativeSelect>
                  )}
                </Field>
              </div>
              <NumberSelect
                label="Domande"
                value={value.rounds}
                options={[5, 10, 15, 20]}
                unit="domande"
                onChange={(rounds) => onChange({ ...value, rounds: rounds ?? value.rounds })}
              />
            </>
          ),
        },
      ];

    case "ear-progressions":
      return [
        {
          title: "Impostazioni",
          content: (
            <>
              <Choice<ProgressionsExercise["level"]>
                label="Quali accordi possono comparire?"
                value={value.level}
                onChange={(level) => onChange({ ...value, level })}
                options={(Object.keys(PROGRESSION_LEVELS) as ProgressionsExercise["level"][]).map((l) => ({
                  value: l,
                  label: PROGRESSION_LEVELS[l].label,
                  hint: PROGRESSION_LEVELS[l].hint,
                }))}
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Accordi">
                  {(p) => (
                    <NativeSelect {...p} value={value.length} onChange={(e) => onChange({ ...value, length: Number(e.target.value) as 3 | 4 })}>
                      <option value={3}>3 accordi</option>
                      <option value={4}>4 accordi</option>
                    </NativeSelect>
                  )}
                </Field>
                <Field label="Tonalità">
                  {(p) => (
                    <NativeSelect {...p} value={value.key} onChange={(e) => onChange({ ...value, key: e.target.value as ProgressionsExercise["key"] })}>
                      <option value="fixed">Do maggiore</option>
                      <option value="random">A caso</option>
                    </NativeSelect>
                  )}
                </Field>
                <NumberSelect
                  label="Progressioni"
                  value={value.rounds}
                  options={[5, 8, 10, 15]}
                  unit="domande"
                  onChange={(rounds) => onChange({ ...value, rounds: rounds ?? value.rounds })}
                />
              </div>
            </>
          ),
        },
      ];
  }
}

/** Primo errore delle impostazioni, per bloccare l'assegnazione (es. nessun accordo scelto). */
export function settingsError(value: InteractiveExercise) {
  return settingsSteps(value, () => {}).find((s) => s.error)?.error;
}

/** Tutte le impostazioni in un unico riquadro, per il form di assegnazione e di modifica. */
export function InteractiveSettings({ value, onChange }: { value: InteractiveExercise; onChange: (v: InteractiveExercise) => void }) {
  return (
    <fieldset className="space-y-3 rounded-xl bg-surface-mid p-3">
      <legend className="sr-only">Esercizio interattivo</legend>
      <p className="flex items-center gap-2 text-[13px] font-semibold text-violet-ink">
        <InteractiveIcon className="size-4 shrink-0" aria-hidden />
        Esercizio interattivo · {catalogEntry(value.kind)?.title}
      </p>
      {settingsSteps(value, onChange).map((step) => (
        <div key={step.title} className="space-y-3">
          {step.content}
        </div>
      ))}
    </fieldset>
  );
}
