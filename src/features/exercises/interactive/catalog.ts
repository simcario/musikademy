import type { LucideIcon } from "lucide-react";
import { Gamepad2, Piano } from "lucide-react";
import type { InteractiveExercise, InteractiveKind } from "@/types";

/** Icona che contraddistingue ovunque un esercizio interattivo. */
export const InteractiveIcon = Gamepad2;

export interface InteractiveCatalogEntry<K extends InteractiveKind = InteractiveKind> {
  kind: K;
  title: string;
  /** Presentazione nel catalogo docente. */
  summary: string;
  /** Istruzioni proposte allo studente (Markdown), modificabili in fase di assegnazione. */
  instructions: string;
  icon: LucideIcon;
  defaults: Extract<InteractiveExercise, { kind: K }>;
}

/** Catalogo degli esercizi interattivi: per aggiungerne uno servono una voce qui e il suo gioco in `interactive-player`. */
export const INTERACTIVE_CATALOG: InteractiveCatalogEntry[] = [
  {
    kind: "piano-keys",
    title: "Riconoscimento della tastiera del pianoforte",
    summary:
      "Dopo un 3-2-1 compare una nota a caso: lo studente ha 5 secondi per suonarla sul proprio strumento. La risposta è riconosciuta dal microfono.",
    instructions:
      "Tieni il dispositivo vicino al pianoforte. Dopo il **3-2-1** compare il nome di una nota: suonala entro **5 secondi**, in qualunque ottava.",
    icon: Piano,
    defaults: { kind: "piano-keys", rounds: 10, accidentals: false },
  },
];

export const ROUND_OPTIONS = [5, 10, 15, 20];

export function catalogEntry(kind: InteractiveKind) {
  return INTERACTIVE_CATALOG.find((e) => e.kind === kind);
}
